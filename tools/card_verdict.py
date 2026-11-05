#!/usr/bin/env python3
"""Card verdict — Meta Model API (vision).

Judges ONE event hero image the way the card-curation pass did: will
this image render well as an event card, or does it need a treatment —
and if so, which remedy CLASS? It returns a verdict only, never crop
geometry: subject selection and measurements stay with the codified
curation skill and human/model review (Spark grounding failed the
golden measurement validation 0/4 on Oct 28 — do not ask it for boxes).

Card context the verdict assumes: on the mobile site the hero is
center-cropped into a narrow portrait inset window (about 0.59 aspect)
beside the card text, or — for top-layout cards — run as a wide banner.

Usage:
  card_verdict.py --image <file> --event "Title, Venue, City" \
      --model muse-spark-1.3 --out <dir>

Writes verdict.json + report.json into <dir>. Exit 2 on rate limit.
"""
import argparse, base64, io, json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.expanduser("~/workspace/custom-connectors/custom.meta-model-api/bin"))
import meta_api  # noqa: E402
from PIL import Image  # noqa: E402

PROMPT_TMPL = (
    "You judge whether ONE event's hero image will render well as a small event card. The event is: {event}. "
    "On the card, the image is CENTER-CROPPED into a narrow portrait window (roughly 0.59 width/height aspect) — "
    "only the central vertical band of the image survives. Judge the image in front of you. "
    "Answer with JSON only, no other text: "
    "{{\"verdict\": one of \"fine\" | \"treat\", "
    "\"remedy\": one of \"none\" | \"focus_shift\" | \"top_banner\" | \"stretch\" | \"crop_out\", "
    "\"subject\": what the main subject is, in a few words, "
    "\"reason\": one short sentence}} "
    "Rules: verdict \"fine\" (remedy \"none\") when the subject sits inside the central band and the center crop keeps it "
    "recognizable — MOST decent photos are fine; leave them alone. Treat ONLY when one of these is clearly true: "
    "(1) the subject sits outside the central band so the center crop cuts it away -> \"focus_shift\"; "
    "(2) the image is a poster/flyer whose TITLE LETTERING or lockup spans wider than the central window, so cropping "
    "slices the words -> \"top_banner\" (the lettering should run whole as a wide banner); "
    "(3) the image is a text-heavy flyer/document whose printed content IS the event info and should fill the card -> \"stretch\"; "
    "(4) one sub-region of the image (a person, a face, a single product shot) is clearly the right card at portrait "
    "aspect while the whole frame is not -> \"crop_out\". "
    "A centered subject does NOT save a flyer whose text columns span wider than the window. "
    "Judge the rendered image content, not the filename."
)


def datauri_for(path):
    im = Image.open(path).convert("RGB")
    im.thumbnail((1024, 1024))
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=78)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def parse_json(content):
    try:
        return json.loads(content)
    except Exception:
        s, e = content.find("{"), content.rfind("}")
        if s >= 0 and e > s:
            try:
                return json.loads(content[s:e + 1])
            except Exception:
                return None
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--image", required=True)
    ap.add_argument("--event", required=True)
    ap.add_argument("--model", default="muse-spark-1.3")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    body = {"model": args.model, "temperature": 0, "max_tokens": 4000,
            "messages": [{"role": "user", "content": [
                {"type": "text", "text": PROMPT_TMPL.format(event=args.event)},
                {"type": "image_url", "image_url": {"url": datauri_for(args.image)}}]}]}
    status, payload = meta_api.call("POST", "/chat/completions", body)
    if status == 429 or (status != 200 and "rate" in json.dumps(payload).lower()):
        print("RATE LIMIT — HALTING")
        return 2
    if status != 200:
        print(f"HTTP {status}")
        return 1
    usage = payload.get("usage", {})
    choice = payload["choices"][0]
    content = (choice["message"].get("content") or "").strip()
    verdict = parse_json(content) if content else None
    with open(os.path.join(args.out, "verdict.json"), "w") as f:
        json.dump(verdict, f, indent=1)
    with open(os.path.join(args.out, "report.json"), "w") as f:
        json.dump({"usage": usage, "finish_reason": choice.get("finish_reason"),
                   "image": args.image, "event": args.event}, f, indent=1)
    print(json.dumps(verdict), "| usage:", usage.get("total_tokens"))
    return 0 if verdict else 1


if __name__ == "__main__":
    sys.exit(main())
