#!/usr/bin/env python3
"""Flyer reader — Meta Model API / muse-spark.

Reads event flyer/poster images and extracts the details printed on them
into the sweep's field shape. Built for the daily sweep's Phase 2 (flyers
carry recurrence, times, and prices that page text never states) and for
ingest checks. Print-faithful by design: the reader reports what the flyer
PRINTS, even when that may conflict with a listing page — conflicts are
flagged downstream by the agent, never silently "corrected" here, and
fields the flyer does not show come back null, never invented.

Usage:
  flyer_read.py --dir <dir> [--files a.jpg,b.jpg] --out <run-dir> \
      [--model muse-spark-1.3-contributor] [--workers 4]

Properties (same as finder_screen.py):
- Resumable: results append to <out>/progress.jsonl keyed by file sha256.
- Hard stop: any 429 / rate-limit response halts the run, exit code 2,
  progress preserved.
- Accounting: per-call token usage and run totals in report.json.
"""
import argparse, base64, hashlib, io, json, os, sys, threading
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

sys.path.insert(0, os.path.expanduser("~/workspace/custom-connectors/custom.meta-model-api/bin"))
import meta_api  # noqa: E402

PROMPT = (
    "You read event flyers and posters for a local events database in Maine. "
    "Extract ONLY what this image itself prints. Answer with JSON only, no other text: "
    "{"
    "\"is_flyer\": true/false, "
    "\"title\": the event name as printed, or null, "
    "\"presenter\": who presents it, as printed, or null, "
    "\"acts\": [performers/bands named on the flyer], "
    "\"date_text\": the date exactly as printed, or null, "
    "\"starts_at\": ISO-8601 with UTC offset, or null, "
    "\"ends_at\": ISO-8601 with UTC offset, or null, "
    "\"doors_text\": doors/opening time as printed, or null, "
    "\"venue\": venue name as printed, or null, "
    "\"address\": street address as printed, or null, "
    "\"city\": city as printed, or null, "
    "\"cost_text\": ticket pricing exactly as printed including every tier, or null, "
    "\"cost_free\": true only if the flyer says free / no cover, "
    "\"age_restriction\": e.g. \"21+\", \"18+\", \"all ages\", as printed, or null, "
    "\"recurrence_text\": how often it repeats, exactly as printed (e.g. \"Every Monday\"), or null, "
    "\"ticket_info\": where/how to get tickets, as printed, or null, "
    "\"theme\": costume/theme/dress notes as printed, or null, "
    "\"evidence\": the literal lines of text you read off this flyer that support the fields above"
    "} "
    "Rules: Today is Tuesday, October 27, 2026. Maine is America/New_York: EDT is UTC-04:00 through "
    "Nov 1, 2026 and EST is UTC-05:00 after. A printed date without a year takes the year of its NEXT "
    "occurrence (a 'January 9' flyer read in October 2026 means 2027-01-09). If the flyer prints a "
    "weekday, the date you output must fall on that weekday. If the flyer prints NO date at all (a "
    "standing series flyer that only names a weekday, e.g. \"Mondays 8PM\"), starts_at and ends_at stay "
    "null — never infer a date from the weekday. If it prints a date but no time, starts_at stays null "
    "too. Times are the SHOW times printed; if both "
    "doors and show times print, starts_at is the show time and doors goes in doors_text. Report what "
    "the flyer prints even if it looks wrong — never correct it from outside knowledge. Anything the "
    "flyer does not print is null (acts is [] when none are named). If the image is not an event flyer "
    "or poster, is_flyer is false and every other field is null/empty."
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
    im.thumbnail((1408, 1408))
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=82)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def read_one(model, path):
    # A corrupt/unreadable image becomes an error record (the
    # image_pick.py pattern) — it must never abort the whole run.
    try:
        return _read_one(model, path)
    except Exception as e:  # noqa: BLE001
        return {"status": None, "error": "UNREADABLE_IMAGE", "raw": str(e)[:300]}


def _read_one(model, path):
    body = {
        "model": model,
        "messages": [{"role": "user", "content": [
            {"type": "text", "text": PROMPT},
            {"type": "image_url", "image_url": {"url": datauri_for(path)}},
        ]}],
        "temperature": 0,
        "max_tokens": 6000,
    }
    status, payload = meta_api.call("POST", "/chat/completions", body)
    if status == 429 or (status != 200 and "rate" in json.dumps(payload).lower()):
        _stop.set()
        return {"status": status, "error": "RATE_LIMIT", "raw": json.dumps(payload)[:300]}
    if status != 200:
        return {"status": status, "error": "HTTP", "raw": json.dumps(payload)[:300]}
    content = payload["choices"][0]["message"]["content"].strip()
    parsed = None
    try:
        parsed = json.loads(content)
    except Exception:
        s, e = content.find("{"), content.rfind("}")
        if s >= 0 and e > s:
            try:
                parsed = json.loads(content[s:e + 1])
            except Exception:
                parsed = None
    return {"status": 200, "flyer": parsed, "content": content if parsed is None else None,
            "usage": payload.get("usage", {})}


def main():
    ap = argparse.ArgumentParser()
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
                    if rec.get("flyer") is not None:
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
    print(f"files={len(paths)} unique={len(by_hash)} already_read={len(by_hash) - len(todo_hashes)} to_read={len(todo_hashes)}")

    totals = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0, "reasoning_tokens": 0}

    def work(h):
        if _stop.is_set():
            return
        p = by_hash[h][0]
        res = read_one(args.model, p)
        rec = {"sha256": h, "file": os.path.basename(p),
               "files_with_same_bytes": [os.path.basename(x) for x in by_hash[h]],
               "bytes": os.path.getsize(p), "model": args.model, **res}
        with _lock:
            with open(progress_path, "a") as f:
                f.write(json.dumps(rec) + "\n")
            u = res.get("usage") or {}
            totals["prompt_tokens"] += u.get("prompt_tokens", 0)
            totals["completion_tokens"] += u.get("completion_tokens", 0)
            totals["total_tokens"] += u.get("total_tokens", 0)
            totals["reasoning_tokens"] += (u.get("completion_tokens_details") or {}).get("reasoning_tokens", 0)
        fl = res.get("flyer") or {}
        print(f"  {os.path.basename(p)[:56]:56s} -> flyer={fl.get('is_flyer')} starts_at={fl.get('starts_at')} "
              f"{'RATE LIMIT — HALTING' if res.get('error') == 'RATE_LIMIT' else ''}")

    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        list(ex.map(work, todo_hashes))

    recs = {}
    if os.path.exists(progress_path):
        with open(progress_path) as f:
            for line in f:
                try:
                    rec = json.loads(line)
                    if rec["sha256"] in by_hash:
                        recs[rec["sha256"]] = rec
                except Exception:
                    pass
    parsed = [r for r in recs.values() if r.get("flyer") is not None]
    report = {
        "model": args.model,
        "files": len(paths), "unique_files": len(by_hash),
        "read": len(recs), "parsed": len(parsed), "unresolved": len(recs) - len(parsed),
        "run_token_totals": totals,
        "halted_on_rate_limit": _stop.is_set(),
        "records": sorted(recs.values(), key=lambda r: r["file"]),
    }
    atomic_json_dump(report, os.path.join(args.out, "report.json"), indent=2)
    print(json.dumps({k: report[k] for k in ("files", "unique_files", "read", "parsed",
                                              "unresolved", "halted_on_rate_limit")}, indent=2))
    print("run token totals:", json.dumps(totals))
    return 2 if _stop.is_set() else 0


if __name__ == "__main__":
    raise SystemExit(main())
