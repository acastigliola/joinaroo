#!/usr/bin/env python3
"""Detail-page extraction — Meta Model API.

Companion to sweep_extract.py: given ONE event detail page (the URL a
listing points to) plus the facts the listing already established, extract
the enrichment a listing cannot supply — full cost tiers, doors-vs-show
times, end time, age restriction, recurrence, ticket info, and a
non-redundant description — in the sweep's sync field shape.

Usage:
  detail_extract.py --url <detail page> --title "<listing title>" \
      --starts-at "2026-10-30T19:00:00-04:00" \
      --models muse-spark-1.3-contributor,muse-wonder-1.0 --out <dir>

Writes raw.html, input.txt, detail-<model>.json, report.json into <dir>.
Validation built in: every dollar amount in cost_text must literally
appear in the page input (price-invention check); image_url must appear
in the raw page. og:image is also captured mechanically (no model) as
the reference image for the page.
"""
import argparse, json, os, re, sys, time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sweep_extract import fetch, clean_html, wix_events_input, atomic_json_dump  # noqa: E402
sys.path.insert(0, os.path.expanduser("~/workspace/custom-connectors/custom.meta-model-api/bin"))
from meta_api import call  # noqa: E402

SYSTEM = """You enrich ONE event's database record from its own detail page, for the Joinaroo events database. You return ONLY a JSON object — no prose, no code fences — with exactly these fields:
{"cost_text": str|null, "cost_free": bool, "image_url": str|null, "doors_text": str|null, "show_start": str|null, "ends_at": str|null, "age_restriction": str|null, "recurrence_text": str|null, "ticket_info": str|null, "description": str|null}

Rules:
- Extract ONLY from the page input for the event named in the task. Ignore other events, related-event cards, and site boilerplate.
- "cost_text": ticket pricing exactly as printed, EVERY tier (e.g. "$15 advance / $20 day of show", "$10 (21+) / $15 (all ages)"). Copy amounts verbatim from the page text — never invent, round, or complete a price. cost_free is true only when the page says the event is free / no cover. No price printed -> cost_text null, cost_free false.
- "show_start": if the page distinguishes doors time from show time, the SHOW start as ISO-8601 with offset; if it gives one start time, that time as ISO-8601; null when the page states no time. "doors_text": the doors time as printed (e.g. "Doors 6PM"), else null.
- "ends_at": ISO-8601 with offset when the page states an end time, else null.
- Maine is America/New_York: EDT is UTC-04:00 through Nov 1, 2026; EST is UTC-05:00 after. The event's known date is given in the task — use it for the ISO fields.
- "image_url": the image the page attaches to THIS event (its hero/promo image), copied verbatim from the input; null if none is identifiable.
- "age_restriction": as printed ("21+", "18+", "all ages"), else null.
- "recurrence_text": only when the page clearly states the event repeats, as printed; else null.
- "ticket_info": where/how to get tickets as printed (seller, phone, "at the door"), else null.
- "description": ONLY details about what the event IS that are not already in the structured fields — the act, the program, special notes. Never restate date, time, venue, or price. Keep it to the page's own substance, 1-3 sentences; null when the page adds nothing."""


def meta_block(raw):
    def grab(prop):
        m = re.search(rf'<meta[^>]+(?:property|name)="{prop}"[^>]+content="([^"]+)"', raw)
        if not m:
            m = re.search(rf'<meta[^>]+content="([^"]+)"[^>]+(?:property|name)="{prop}"', raw)
        return m.group(1) if m else None
    return {"og_title": grab("og:title"), "og_description": grab("og:description"),
            "og_image": grab("og:image") or grab("twitter:image")}


def build_input(url, raw):
    meta = meta_block(raw)
    head = ("PAGE META (mechanical):\n" + json.dumps(meta, indent=1) + "\n\n")
    slug = url.rstrip("/").split("/")[-1]
    wix = wix_events_input(raw, url)
    if wix:
        try:
            arr = json.loads(wix)
            match = [e for e in arr if e.get("slug") == slug]
            if match:
                return head + "EMBEDDED EVENT JSON:\n" + json.dumps(match[0], indent=1), "embedded-json", meta
            if len(arr) == 1:
                return head + "EMBEDDED EVENT JSON:\n" + wix, "embedded-json", meta
        except Exception:
            pass
    return head + "PAGE TEXT:\n" + clean_html(raw), "cleaned-html", meta


def extract(model, title, starts_at, page_input):
    user = (f"Event (from its listing): {title}\nKnown starts_at: {starts_at}\n\n{page_input}")
    body = {"model": model, "temperature": 0, "max_tokens": 8000,
            "messages": [{"role": "system", "content": SYSTEM},
                         {"role": "user", "content": user}]}
    t0 = time.time()
    status, payload = call("POST", "/chat/completions", body)
    secs = round(time.time() - t0, 1)
    if status != 200:
        return {"model": model, "error": f"HTTP {status}: {json.dumps(payload)[:300]}", "secs": secs}
    content = payload["choices"][0]["message"]["content"].strip()
    content = re.sub(r"^```(json)?|```$", "", content, flags=re.M).strip()
    try:
        obj = json.loads(content)
    except Exception as e:
        return {"model": model, "error": f"JSON parse: {e}", "raw_head": content[:300],
                "usage": payload.get("usage"), "secs": secs}
    return {"model": model, "detail": obj, "usage": payload.get("usage"), "secs": secs}


def validate(detail, page_input, raw):
    amounts = re.findall(r"\$(\d+)", detail.get("cost_text") or "")
    invented = [a for a in amounts if f"${a}" not in page_input]
    img = detail.get("image_url")
    return {"invented_amounts": invented,
            "image_not_in_page": bool(img) and img not in raw and img not in page_input}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True)
    ap.add_argument("--title", required=True)
    ap.add_argument("--starts-at", required=True)
    ap.add_argument("--models", default="muse-spark-1.3-contributor,muse-wonder-1.0")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    raw = fetch(args.url)
    open(f"{args.out}/raw.html", "w").write(raw)
    page_input, route, meta = build_input(args.url, raw)
    open(f"{args.out}/input.txt", "w").write(page_input)
    print(f"route: {route} | input chars: {len(page_input)} | og_image: {meta.get('og_image')}")

    report = {"url": args.url, "title": args.title, "route": route, "meta": meta, "runs": []}
    for model in [m.strip() for m in args.models.split(",") if m.strip()]:
        res = extract(model, args.title, args.starts_at, page_input)
        run = {"model": model, "secs": res.get("secs"), "usage": res.get("usage")}
        if "detail" in res:
            atomic_json_dump(res["detail"], f"{args.out}/detail-{model}.json", indent=1)
            run["validation"] = validate(res["detail"], page_input, raw)
            print(f"{model}: cost={res['detail'].get('cost_text')!r} show_start={res['detail'].get('show_start')} "
                  f"validation={run['validation']} usage={res.get('usage')}")
        else:
            run["error"] = res.get("error")
            print(f"{model}: ERROR {res.get('error')}")
        report["runs"].append(run)
    atomic_json_dump(report, f"{args.out}/report.json", indent=1)


if __name__ == "__main__":
    raise SystemExit(main())
