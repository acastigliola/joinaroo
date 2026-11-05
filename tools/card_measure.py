#!/usr/bin/env python3
"""Card curation — subject measurement (Meta Model API / muse-spark).

Measures ONE subject in ONE event photo: returns the subject's bounding box
in 0-1000 normalized coordinates so card curation can compute (a) the CSS
object-position focus percentage (the box center) and (b) whether the
subject is wider than the card's crop window (box width vs window width).

This is a measuring instrument only — it makes no curation decision. The
remedy choice (focus shift, crop-out, flyer logic, leave-alone) stays with
the curation skill and Angelo's eye.

Usage:
  card_measure.py <image_path> "<subject prompt>" [--model muse-spark-1.3]

Output (stdout, JSON):
  {"found": true, "box": {"x_min":..,"y_min":..,"x_max":..,"y_max":..},
   "center_x_pct": .., "center_y_pct": .., "width_pct": .., "height_pct": ..,
   "usage": {...}, "sha256": "..."}
  or {"found": false, ...} when the subject is not in the image.

Image handling mirrors finder_screen.py: downscale to <=1024px, JPEG q78,
base64 data URI. SAM-style segmentation is deliberately NOT used — one
union box per image is all the geometry the card math needs.
"""
import argparse, base64, hashlib, io, json, os, sys
from PIL import Image

sys.path.insert(0, os.path.expanduser("~/workspace/custom-connectors/custom.meta-model-api/bin"))
import meta_api  # noqa: E402

PROMPT = (
    "You measure subjects in photos for an event-card layout tool. "
    "Locate this subject in the image: {subject}. "
    "If the prompt matches multiple people or objects, return ONE box that "
    "tightly encloses ALL of them together (the union box). "
    "Answer with JSON only, no other text: "
    "{{\"x_min\": <int>, \"y_min\": <int>, \"x_max\": <int>, \"y_max\": <int>}} "
    "using 0-1000 normalized coordinates (0,0 = top-left, 1000,1000 = bottom-right). "
    "If the subject is not present in the image, answer {{\"found\": false}}."
)


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


def parse_box(content):
    try:
        v = json.loads(content)
    except Exception:
        s, e = content.find("{"), content.rfind("}")
        if s < 0 or e <= s:
            return None
        try:
            v = json.loads(content[s:e + 1])
        except Exception:
            return None
    if not isinstance(v, dict):
        return None
    if v.get("found") is False:
        return {"found": False}
    keys = ("x_min", "y_min", "x_max", "y_max")
    if not all(isinstance(v.get(k), (int, float)) for k in keys):
        return None
    return {k: max(0, min(1000, float(v[k]))) for k in keys}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("image_path")
    ap.add_argument("subject")
    ap.add_argument("--model", default="muse-spark-1.3")
    args = ap.parse_args()

    body = {
        "model": args.model,
        "messages": [{"role": "user", "content": [
            {"type": "text", "text": PROMPT.format(subject=args.subject)},
            {"type": "image_url", "image_url": {"url": datauri_for(args.image_path)}},
        ]}],
        "temperature": 0,
        "max_tokens": 4000,
    }
    status, payload = meta_api.call("POST", "/chat/completions", body)
    base = {"file": os.path.basename(args.image_path), "subject": args.subject,
            "sha256": sha256_of(args.image_path), "model": args.model}
    if status == 429:
        print(json.dumps({**base, "found": False, "error": "RATE_LIMIT", "status": 429}))
        return 2
    if status != 200:
        print(json.dumps({**base, "found": False, "error": "HTTP", "status": status,
                          "raw": json.dumps(payload)[:300]}))
        return 1
    usage = payload.get("usage", {})
    content = payload["choices"][0]["message"]["content"].strip()
    box = parse_box(content)
    if box is None:
        print(json.dumps({**base, "found": False, "error": "UNPARSEABLE", "content": content[:300],
                          "usage": usage}))
        return 1
    if box.get("found") is False:
        print(json.dumps({**base, "found": False, "usage": usage}))
        return 0
    out = {
        **base,
        "found": True,
        "box": {k: round(v, 1) for k, v in box.items()},
        "center_x_pct": round((box["x_min"] + box["x_max"]) / 20.0, 1),
        "center_y_pct": round((box["y_min"] + box["y_max"]) / 20.0, 1),
        "width_pct": round((box["x_max"] - box["x_min"]) / 10.0, 1),
        "height_pct": round((box["y_max"] - box["y_min"]) / 10.0, 1),
        "usage": usage,
    }
    print(json.dumps(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
