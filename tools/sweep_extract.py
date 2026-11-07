#!/usr/bin/env python3
"""Sweep extraction pilot — Meta Model API vs. the events-sweep contract.

Fetches one listing page, builds the best static input the page offers
(link-preserving cleaned text for server-rendered pages, the embedded
events JSON for Wix-class pages), and asks a Muse model to extract
structured events in the exact JSON shape the daily sweep syncs to
production (see the southern-maine-events-watch cron body).

Usage:
  sweep_extract.py --url <page> --source-name "SPACE" \
      --venue-name "SPACE" --venue-city "Portland" \
      --models muse-wonder-1.0,muse-spark-1.3-contributor --out <dir>

Writes into <dir>: raw.html, input.txt, events-<model>.json, report.json.
Validation built in: every returned url/image_url must literally appear
in the page payload (invented-URL check); starts_at must parse.
"""
import argparse
import html as html_mod
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime

sys.path.insert(0, "/home/hatch/workspace/custom-connectors/custom.meta-model-api/bin")
from meta_api import call  # noqa: E402

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36"


def atomic_json_dump(obj, path, **kw):
    """Write JSON via temp file + os.replace so a killed run never
    leaves a truncated file behind."""
    tmp = path + ".tmp"
    with open(tmp, "w") as fh:
        json.dump(obj, fh, **kw)
        fh.flush()
        os.fsync(fh.fileno())
    os.replace(tmp, path)
CATEGORIES = ["after-dark", "bar-brain", "on-stage", "hack-build", "game-on",
              "taste-maine", "town-square", "family-fun", "game-day",
              "seasonal", "learn", "gallery"]

SYSTEM = """You extract structured event listings from a Maine venue/organizer page for the Joinaroo events database. You return ONLY a JSON array — no prose, no code fences.

Each event object has exactly these fields:
{"title": str, "description": str|null, "category_slug": str, "starts_at": str, "ends_at": str|null, "cost_free": bool, "cost_text": str|null, "url": str|null, "source": str, "image_url": str|null, "recurrence": str|null, "series_key": str|null, "venue": {"name": str, "address": str|null, "city": str, "lat": number|null, "lng": number|null}}

Rules:
- Today is Tuesday, October 27, 2026. All times are local to Maine (America/New_York): EDT is UTC-04:00 through Nov 1, 2026; EST is UTC-05:00 after. starts_at/ends_at are ISO-8601 WITH the offset.
- YEAR RULE: a date the page prints without a year takes the year that makes it the NEXT occurrence — a "January 9" found in October 2026 is 2027-01-09, never 2026. Weekday names on the page must agree with the date you output.
- Only events actually present in the input. Skip past events (before Oct 27, 2026) unless the page only lists them.
- "url": copy the event's own detail-page URL VERBATIM from the input. Never construct, guess, or shorten a URL. If the input gives no per-event URL, use null.
- "image_url": only an image URL the input attaches to that specific event; otherwise null. Never invent one.
- "cost_text": pricing exactly as printed, all tiers (e.g. "$15 advance / $20 day of show"). cost_free is true only when the page says free. When no price is printed, cost_text is null and cost_free is false.
- "description": ONLY details not already captured in the other fields — what the event is, who performs, special notes. Never restate the date, time, venue, or price. null when nothing additional is stated.
- "category_slug": one of after-dark, bar-brain, on-stage, hack-build, game-on, taste-maine, town-square, family-fun, game-day, seasonal, learn, gallery. Categorize by what the event IS, never by start time: a concert is on-stage even in the afternoon; a talk/lecture/class is learn; a film/screening is learn unless aimed at kids/families (then family-fun); trivia/quiz is bar-brain wherever it is held; holiday-themed events are seasonal even when they are also markets or parties (a Christmas market is seasonal, not town-square); other markets are town-square unless art-only (gallery); gallery openings are gallery. (Mapping aligned with feed_extract.py and category_audit.py, Nov 6 2026.)
- "venue": the venue the event is AT. If the listing names a different venue for an event (e.g. "at First Parish Church"), use that one; otherwise the source venue given in the task. lat/lng only when the input states them, else null.
- "recurrence"/"series_key": only when the page clearly states the event repeats; otherwise both null.
- "source": exactly the source name given in the task.
- If the input is embedded site JSON with a "formatted" local date/time string and a separate timeZoneId that conflicts with the venue's actual location, trust the formatted string and the venue's real timezone."""


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read().decode("utf-8", errors="ignore")


def clean_html(raw):
    raw = re.sub(r"(?is)<(script|style|noscript)[^>]*>.*?</\1>", " ", raw)
    raw = re.sub(r"(?is)<!--.*?-->", " ", raw)
    raw = re.sub(r"(?is)<a[^>]+href=\"([^\"]+)\"[^>]*>(.*?)</a>",
                 lambda m: " " + re.sub(r"<[^>]+>", " ", m.group(2)).strip() + " [URL: " + m.group(1) + "] ", raw)
    raw = re.sub(r"(?is)<img[^>]+src=\"([^\"]+)\"[^>]*>", r" [IMG: \1] ", raw)
    raw = re.sub(r"(?is)<(br|/p|/div|/li|/h[1-6]|/tr|/section|/article)[^>]*>", "\n", raw)
    txt = html_mod.unescape(re.sub(r"(?s)<[^>]+>", " ", raw))
    lines = [re.sub(r"\s+", " ", l).strip() for l in txt.splitlines()]
    return "\n".join(l for l in lines if l)


def wix_events_input(raw, page_url):
    """If the page embeds a Wix events array, slim it to the useful keys."""
    if '"scheduling"' not in raw or '"startDate"' not in raw:
        return None
    for m in re.finditer(r'"events"\s*:\s*\[', raw):
        start = m.end() - 1
        depth, i, in_str, esc = 0, start, False, False
        while i < len(raw):
            c = raw[i]
            if in_str:
                if esc:
                    esc = False
                elif c == "\\":
                    esc = True
                elif c == '"':
                    in_str = False
            elif c == '"':
                in_str = True
            elif c == "[":
                depth += 1
            elif c == "]":
                depth -= 1
                if depth == 0:
                    break
            i += 1
        try:
            arr = json.loads(raw[start:i + 1])
        except Exception:
            continue
        if not arr or not isinstance(arr[0], dict) or "scheduling" not in arr[0]:
            continue
        slim = []
        for ev in arr:
            loc = ev.get("location") or {}
            sched = (ev.get("scheduling") or {}).get("config") or {}
            slim.append({
                "title": ev.get("title"),
                "slug": ev.get("slug"),
                "description": (ev.get("description") or "")[:600] or None,
                "formatted": (ev.get("scheduling") or {}).get("formatted"),
                "startDate": sched.get("startDate"),
                "endDate": sched.get("endDate"),
                "timeZoneId": sched.get("timeZoneId"),
                "location_name": loc.get("name"),
                "formattedAddress": loc.get("formattedAddress"),
                "lat": (loc.get("geocode") or {}).get("latitude"),
                "lng": (loc.get("geocode") or {}).get("longitude"),
                "price": ev.get("price") or ev.get("lowestPrice"),
                "image": (ev.get("mainImage") or {}).get("url") if isinstance(ev.get("mainImage"), dict) else None,
            })
        # Detail-URL base derives from THIS page's origin — never a
        # hardcoded venue. A slug that does not literally appear in
        # the raw payload gets url=null rather than an invented URL.
        origin = urllib.parse.urlsplit(page_url)
        base = f"{origin.scheme}://{origin.netloc}/event-details/"
        for s in slim:
            if s.get("slug") and s["slug"] in raw:
                s["url"] = base + s["slug"]
            else:
                s["url"] = None
        return json.dumps(slim, indent=1)
    return None


def extract(model, source_name, venue_name, venue_city, page_input):
    user = (f"Source name: {source_name}\n"
            f"Source venue (default when an event names no other venue): {venue_name}, {venue_city}, Maine.\n\n"
            f"PAGE INPUT:\n{page_input}")
    body = {"model": model, "temperature": 0, "max_tokens": 16000,
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
        events = json.loads(content)
    except Exception as e:
        return {"model": model, "error": f"JSON parse: {e}", "raw_head": content[:300],
                "usage": payload.get("usage"), "secs": secs}
    return {"model": model, "events": events, "usage": payload.get("usage"), "secs": secs}


def validate(events, raw):
    invented_url, invented_img, bad_dates, missing = [], [], [], []
    for ev in events:
        for field, bucket in (("url", invented_url), ("image_url", invented_img)):
            v = ev.get(field)
            if v and v not in raw:
                bucket.append(v)
        try:
            datetime.fromisoformat(ev["starts_at"])
        except Exception:
            bad_dates.append(ev.get("starts_at"))
        for req in ("title", "starts_at", "category_slug", "venue"):
            if not ev.get(req):
                missing.append(f"{ev.get('title', '?')}: {req}")
    return {"invented_urls": invented_url, "invented_images": invented_img,
            "bad_dates": bad_dates, "missing_fields": missing}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True)
    ap.add_argument("--source-name", required=True)
    ap.add_argument("--venue-name", required=True)
    ap.add_argument("--venue-city", required=True)
    ap.add_argument("--models", default="muse-wonder-1.0,muse-spark-1.3-contributor")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    import os
    os.makedirs(args.out, exist_ok=True)
    raw = fetch(args.url)
    open(f"{args.out}/raw.html", "w").write(raw)
    wix = wix_events_input(raw, args.url)
    if wix:
        page_input, route = wix, "embedded-json"
    else:
        page_input, route = clean_html(raw), "cleaned-html"
    open(f"{args.out}/input.txt", "w").write(page_input)
    print(f"input route: {route} | input chars: {len(page_input)}")

    report = {"url": args.url, "source": args.source_name, "route": route,
              "input_chars": len(page_input), "runs": []}
    for model in [m.strip() for m in args.models.split(",") if m.strip()]:
        res = extract(model, args.source_name, args.venue_name, args.venue_city, page_input)
        run = {"model": model, "secs": res.get("secs"), "usage": res.get("usage")}
        if "events" in res:
            evs = res["events"]
            atomic_json_dump(evs, f"{args.out}/events-{model}.json", indent=1)
            run["count"] = len(evs)
            run["validation"] = validate(evs, raw)
            print(f"{model}: {len(evs)} events, usage={res.get('usage')}, validation={run['validation']}")
        else:
            run["error"] = res.get("error")
            print(f"{model}: ERROR {res.get('error')}")
        report["runs"].append(run)
    atomic_json_dump(report, f"{args.out}/report.json", indent=1)


if __name__ == "__main__":
    raise SystemExit(main())
