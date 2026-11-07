#!/usr/bin/env python3
"""Image pick — Meta Model API / muse-spark.

Scores candidate images for ONE event (the photo-backlog problem: an event
has no image_url and its page offers several images, or one dubious one)
and picks the best hero image. The mechanical rule it replaces — "take
og:image" — cannot tell a promo flyer from a calendar icon.

Usage:
  image_pick.py --event "Title, Venue, City, Date" --dir <event-dir> \
      --out <run-dir> [--model muse-spark-1.3-contributor]

<event-dir> holds candidate files named cand-*.{jpg,png,webp}. Writes
scores.jsonl (resumable) + pick.json into <out>. A 429 / rate-limit
response halts the run with exit code 2, progress preserved.
"""
import argparse, base64, hashlib, io, json, os, sys, threading
from PIL import Image

sys.path.insert(0, os.path.expanduser("~/workspace/custom-connectors/custom.meta-model-api/bin"))
import meta_api  # noqa: E402

PROMPT_TMPL = (
    "You choose the hero image for a local event listing. The event is: {event}. "
    "Judge THIS candidate image for that listing. Answer with JSON only, no other text: "
    "{{\"image_type\": one of \"event promo or flyer\" | \"event-related photo\" | \"performer photo\" | "
    "\"venue photo\" | \"logo or icon\" | \"generic stock\" | \"unrelated\", "
    "\"suitability\": 0-10 (10 = clearly this event's own promo art or a photo of this event/act; "
    "7-9 = a real photo of the performer, venue, or activity the event is about; 4-6 = topically "
    "related but generic; 1-3 = branding, icons, or barely related; 0 = unrelated or unusable), "
    "\"evidence\": what the image actually shows, in one short sentence}} "
    "A logo, site icon, social-share graphic, or calendar icon is never suitable as a hero image "
    "even when it comes from the event's own page — score it 3 or below. Judge only what is in the "
    "image, not the filename."
)

_stop = threading.Event()


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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--event", required=True)
    ap.add_argument("--dir", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--model", default="muse-spark-1.3-contributor")
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    progress = os.path.join(args.out, "scores.jsonl")
    done = {}
    if os.path.exists(progress):
        for line in open(progress):
            try:
                r = json.loads(line)
                if r.get("score") is not None:
                    done[r["sha256"]] = r
            except Exception:
                pass

    names = sorted(n for n in os.listdir(args.dir)
                   if n.startswith("cand-") and n.lower().endswith((".jpg", ".jpeg", ".png", ".webp", ".gif")))
    prompt = PROMPT_TMPL.format(event=args.event)
    totals = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
    results = []
    for n in names:
        p = os.path.join(args.dir, n)
        h = sha256_of(p)
        # A resumed record is reused only when its filename is one of
        # the current candidates; a stale record (same bytes, filename
        # no longer present) falls through and is re-scored under the
        # current name, so downstream manifest lookups can never miss.
        if h in done and done[h].get("file") in names:
            rec = done[h]
        else:
            try:
                Image.open(p).verify()
            except Exception:
                rec = {"file": n, "sha256": h, "score": None, "error": "unreadable image file"}
                with open(progress, "a") as f:
                    f.write(json.dumps(rec) + "\n")
                results.append(rec)
                print(f"  {n}: unreadable image file — skipped")
                continue
            body = {"model": args.model, "temperature": 0, "max_tokens": 3000,
                    "messages": [{"role": "user", "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": datauri_for(p)}}]}]}
            status, payload = meta_api.call("POST", "/chat/completions", body)
            if status == 429 or (status != 200 and "rate" in json.dumps(payload).lower()):
                print("RATE LIMIT — HALTING"); return 2
            if status != 200:
                print(f"{n}: HTTP {status}"); continue
            u = payload.get("usage", {})
            for k in totals: totals[k] += u.get(k, 0)
            content = payload["choices"][0]["message"]["content"].strip()
            score = None
            try:
                score = json.loads(content)
            except Exception:
                s, e = content.find("{"), content.rfind("}")
                if s >= 0 and e > s:
                    try: score = json.loads(content[s:e + 1])
                    except Exception: pass
            rec = {"file": n, "sha256": h, "score": score}
            with open(progress, "a") as f:
                f.write(json.dumps(rec) + "\n")
        results.append(rec)
        sc = rec.get("score") or {}
        print(f"  {n}: type={sc.get('image_type')!r} suitability={sc.get('suitability')} — {sc.get('evidence')}")

    scored = [r for r in results if r.get("score")]
    pick = max(scored, key=lambda r: r["score"].get("suitability", -1)) if scored else None
    out = {"event": args.event, "model": args.model, "candidates": results,
           "pick": ({"file": pick["file"], **pick["score"]} if pick else None),
           "token_totals": totals}
    atomic_json_dump(out, os.path.join(args.out, "pick.json"), indent=1)
    print("PICK:", out["pick"])
    print("tokens:", totals)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
