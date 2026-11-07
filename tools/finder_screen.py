#!/usr/bin/env python3
"""Event Photo Finder — screening harness (Meta Model API / muse-spark).

Screens downloaded candidate photos against ONE event: for each file the
model returns whether the photo belongs to the event, what type of image it
is, the visible evidence, and — when the image is an event flyer — the event
details printed on it. Screening is a filter, never a credit decision: credit
still comes from the source post/caption per the finder skill.

Usage:
  finder_screen.py --event "Evan Honer at State Theatre, Portland, Maine, Oct 24, 2026" \
      --dir ~/workspace/browser_downloads/sess-XXX --out ~/workspace/.../run-dir \
      [--files a.jpg,b.jpg] [--model muse-spark-1.3-contributor] [--workers 4]

Properties:
- Resumable: verdicts append to <out>/progress.jsonl keyed by file sha256;
  re-running skips files already screened (identical bytes screen once).
- Hard stop: any 429 / rate-limit response halts the run immediately with
  progress preserved (Angelo's provider rate-limit rule).
- Accounting: progress + report carry per-call token usage and totals.
"""
import argparse, base64, hashlib, io, json, os, sys, threading
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

sys.path.insert(0, os.path.expanduser("~/workspace/custom-connectors/custom.meta-model-api/bin"))
import meta_api  # noqa: E402

PROMPT = (
    "You screen photos for a local events site. This photo is a candidate for the event: {event}. "
    "Answer with JSON only, no other text: "
    "{{\"belongs\": true/false, "
    "\"photo_type\": \"fan photo at the event\"|\"stage/performance shot\"|\"game/action shot\"|"
    "\"crowd/venue shot\"|\"logo or graphic\"|\"event flyer\"|\"screenshot\"|\"other\", "
    "\"evidence\": \"the specific things visible in the image that support your answer\", "
    "\"flyer\": null or {{\"title\": ..., \"date\": ..., \"time\": ..., \"venue\": ..., "
    "\"prices\": ..., \"theme_or_acts\": ...}} — fill flyer ONLY when photo_type is \"event flyer\", "
    "using only what the flyer itself prints, null for fields it does not show."
)

_stop = threading.Event()
_lock = threading.Lock()


def atomic_json_dump(obj, path, **kw):
    """Write JSON via temp file + os.replace so a killed run never
    leaves a truncated file behind."""
    tmp = path + ".tmp"
    with open(tmp, "w") as fh:
        json.dump(obj, fh, **kw)
        fh.flush()
        os.fsync(fh.fileno())
    os.replace(tmp, path)


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def datauri_for(path):
    im = Image.open(path).convert("RGB")
    im.thumbnail((1024, 1024))
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=78)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def screen_one(model, event_text, path):
    # A corrupt/unreadable image becomes an error record (the
    # image_pick.py pattern) — it must never abort the whole run.
    try:
        return _screen_one(model, event_text, path)
    except Exception as e:  # noqa: BLE001
        return {"status": None, "error": "UNREADABLE_IMAGE", "raw": str(e)[:300]}


def _screen_one(model, event_text, path):
    body = {
        "model": model,
        "messages": [{"role": "user", "content": [
            {"type": "text", "text": PROMPT.format(event=event_text)},
            {"type": "image_url", "image_url": {"url": datauri_for(path)}},
        ]}],
        "temperature": 0,
        "max_tokens": 4000,
    }
    status, payload = meta_api.call("POST", "/chat/completions", body)
    if status == 429 or (status != 200 and "rate" in json.dumps(payload).lower()):
        _stop.set()
        return {"status": status, "error": "RATE_LIMIT", "raw": json.dumps(payload)[:300]}
    if status != 200:
        return {"status": status, "error": "HTTP", "raw": json.dumps(payload)[:300]}
    content = payload["choices"][0]["message"]["content"].strip()
    verdict = None
    try:
        verdict = json.loads(content)
    except Exception:
        s, e = content.find("{"), content.rfind("}")
        if s >= 0 and e > s:
            try:
                verdict = json.loads(content[s:e + 1])
            except Exception:
                verdict = None
    return {"status": 200, "verdict": verdict, "content": content if verdict is None else None,
            "usage": payload.get("usage", {})}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--event", required=True)
    ap.add_argument("--dir", required=True)
    ap.add_argument("--files", default=None, help="comma-separated basenames; default: all images in --dir")
    ap.add_argument("--out", required=True)
    ap.add_argument("--model", default="muse-spark-1.3-contributor")
    ap.add_argument("--workers", type=int, default=4)
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    progress_path = os.path.join(args.out, "progress.jsonl")
    done = {}
    if os.path.exists(progress_path):
        with open(progress_path) as f:
            for line in f:
                try:
                    rec = json.loads(line)
                    if rec.get("verdict") is not None:
                        done[rec["sha256"]] = rec
                except Exception:
                    pass

    if args.files:
        names = [n.strip() for n in args.files.split(",") if n.strip()]
    else:
        names = sorted(n for n in os.listdir(args.dir)
                       if n.lower().endswith((".jpg", ".jpeg", ".png", ".webp")))
    paths = [os.path.join(args.dir, n) for n in names]

    by_hash = {}
    for p in paths:
        by_hash.setdefault(sha256_of(p), []).append(p)
    todo_hashes = [h for h in by_hash if h not in done]
    print(f"files={len(paths)} unique={len(by_hash)} already_screened={len(by_hash) - len(todo_hashes)} to_screen={len(todo_hashes)}")

    totals = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0, "reasoning_tokens": 0}

    def work(h):
        if _stop.is_set():
            return
        p = by_hash[h][0]
        res = screen_one(args.model, args.event, p)
        rec = {"sha256": h, "file": os.path.basename(p), "files_with_same_bytes": [os.path.basename(x) for x in by_hash[h]],
               "bytes": os.path.getsize(p), "model": args.model, **res}
        with _lock:
            with open(progress_path, "a") as f:
                f.write(json.dumps(rec) + "\n")
            u = res.get("usage") or {}
            totals["prompt_tokens"] += u.get("prompt_tokens", 0)
            totals["completion_tokens"] += u.get("completion_tokens", 0)
            totals["total_tokens"] += u.get("total_tokens", 0)
            totals["reasoning_tokens"] += (u.get("completion_tokens_details") or {}).get("reasoning_tokens", 0)
        v = res.get("verdict") or {}
        print(f"  {os.path.basename(p)[:60]:60s} -> belongs={v.get('belongs')} type={v.get('photo_type')} "
              f"{'RATE LIMIT — HALTING' if res.get('error') == 'RATE_LIMIT' else ''}")

    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        list(ex.map(work, todo_hashes))

    # Final report over ALL screened hashes for this run's file set.
    recs = {}
    with open(progress_path) as f:
        for line in f:
            try:
                rec = json.loads(line)
                if rec["sha256"] in by_hash:
                    recs[rec["sha256"]] = rec
            except Exception:
                pass
    kept = [r for r in recs.values() if (r.get("verdict") or {}).get("belongs") is True]
    rejected = [r for r in recs.values() if (r.get("verdict") or {}).get("belongs") is False]
    errored = [r for r in recs.values() if r.get("verdict") is None]
    report = {
        "event": args.event, "model": args.model,
        "files": len(paths), "unique_files": len(by_hash),
        "screened": len(recs), "belongs": len(kept), "rejected": len(rejected), "unresolved": len(errored),
        "run_token_totals": totals,
        "halted_on_rate_limit": _stop.is_set(),
        "kept_files": sorted(os.path.basename(x) for r in kept for x in [os.path.join(args.dir, r["file"])]),
        "records": sorted(recs.values(), key=lambda r: r["file"]),
    }
    atomic_json_dump(report, os.path.join(args.out, "report.json"), indent=2)
    print(json.dumps({k: report[k] for k in ("files", "unique_files", "screened", "belongs", "rejected",
                                              "unresolved", "halted_on_rate_limit")}, indent=2))
    print("run token totals:", json.dumps(totals))
    return 2 if _stop.is_set() else 0


if __name__ == "__main__":
    raise SystemExit(main())
