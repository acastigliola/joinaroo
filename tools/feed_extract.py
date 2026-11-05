#!/usr/bin/env python3
"""Feed extraction — the mechanical layer of the events sweep.

Pulls STRUCTURED event feeds (Tribe REST JSON, LibraryCalendar JSON,
Squarespace collection JSON, iCalendar exports, LibCal/Assabet RSS,
SIDEARM athletics schedule text services) and
normalizes items into the exact JSON shape the daily sweep syncs to
production (see the southern-maine-events-watch cron body). No model
calls: where a source publishes a real feed, extraction is parsing.

Born from the Nov 4, 2026 audit: 60 real events the prose sweep missed
clustered on sources that had feeds all along (UMaine's December
planetarium slate, the LibraryCalendar libraries, Squarespace venues).

Usage:
  feed_extract.py --source ppl [--horizon-days 60] --out <dir>
  feed_extract.py --all [--horizon-days 60] --out <basedir>

Writes into <out>/<source>/ (or <out>/ for a single source):
events.json (sync-shape items) + report.json (feed URLs hit, items
fetched, items in window, covered date range, validation notes).
Feed gaps are reported, never papered over: a source whose feed lacks
per-event URLs, times, or cost says so in its report.
"""
import argparse
import html as html_mod
import json
import os
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36"
NY = ZoneInfo("America/New_York")
CATEGORIES = ["after-dark", "bar-brain", "on-stage", "hack-build", "game-on",
              "taste-maine", "town-square", "family-fun", "game-day",
              "seasonal", "learn", "gallery"]

# ---------------------------------------------------------------- sources
# kind: tribe | librarycalendar | squarespace | ics | libcal-rss | assabet-rss | sidearm
SOURCES = {
    "umaine": {
        "kind": "ics", "source_name": "University of Maine Calendar",
        "venue": {"name": "University of Maine", "address": None, "city": "Orono",
                  "lat": 44.8996, "lng": -68.6682},
        "default_category": "learn",
        # The REST API on this subsite is login-locked; the Tribe ICS
        # archive exports are the public feed. The all-events list
        # advances slowly (~12 new events/page), so the run also pulls
        # the concentrated public-facing category archives.
        "archives": [
            "https://umaine.edu/calendar/events/",
            "https://umaine.edu/calendar/events/category/versant-astronomy-center/",
            "https://umaine.edu/calendar/events/category/public-programs-and-shows/",
            "https://umaine.edu/calendar/events/category/arts/",
            "https://umaine.edu/calendar/events/category/community/",
        ],
        "max_pages": 30,
        "notes": "REST API is login-locked (rest_not_logged_in); ICS export "
                 "is the feed. 30 events per export page, pages overlap — "
                 "dedupe is by UID. No structured cost in ICS.",
    },
    "ppl": {
        "kind": "librarycalendar", "source_name": "Portland Public Library",
        "base": "https://portlandme.librarycalendar.com",
        "venue": {"name": "Portland Public Library", "address": "5 Monument Square",
                  "city": "Portland", "lat": 43.6573, "lng": -70.2586},
        "default_category": "learn",
        "notes": "Feed carries branch + room + offsite address per event; "
                 "no structured cost (library programs are free unless the "
                 "description says otherwise — cost stays null).",
    },
    "sppl": {
        "kind": "tribe", "source_name": "South Portland Public Library",
        "base": "https://southportlandlibrary.com",
        "venue": {"name": "South Portland Public Library", "address": "482 Broadway",
                  "city": "South Portland", "lat": 43.6255, "lng": -70.2589},
        "default_category": "learn",
    },
    "merrill": {
        "kind": "tribe", "source_name": "Merrill Memorial Library",
        "base": "https://yarmouthlibrary.org",
        "venue": {"name": "Merrill Memorial Library", "address": "215 Main St",
                  "city": "Yarmouth", "lat": 43.7980, "lng": -70.1776},
        "default_category": "learn",
    },
    "scarborough": {
        "kind": "libcal-rss", "source_name": "Scarborough Public Library",
        "feed": "https://scarboroughlibrary.libcal.com/rss.php?cid=19666&m=month",
        "venue": {"name": "Scarborough Public Library", "address": "48 Gorham Rd",
                  "city": "Scarborough", "lat": 43.5917, "lng": -70.3370},
        "default_category": "learn",
        "notes": "LibCal RSS is a rolling ~30-day window regardless of the "
                 "requested horizon (dy parameter is ignored by LibCal) — "
                 "the feed itself caps coverage. Times ride inside the "
                 "description text; they are parsed mechanically.",
    },
    "kfl": {
        "kind": "assabet-rss", "source_name": "Kennebunk Free Library",
        "feed": "https://kennebunklibrary.assabetinteractive.com/calendar/upcoming-events.rss",
        "venue": {"name": "Kennebunk Free Library", "address": "112 Main St",
                  "city": "Kennebunk", "lat": 43.3833, "lng": -70.5434},
        "default_category": "learn",
        "notes": "Assabet RSS carries date+time range as the first line of "
                 "the description text; parsed mechanically.",
    },
    "317main": {
        "kind": "squarespace", "source_name": "317 Main Community Music Center",
        "collection": "https://317main.org/events",
        "venue": {"name": "317 Main Community Music Center", "address": "317 Main St",
                  "city": "Yarmouth", "lat": 43.7967, "lng": -70.1806},
        "default_category": "on-stage",
        "notes": "Squarespace 'upcoming' array only — events the venue "
                 "removes vanish without a cancellation signal.",
    },
    "flourish": {
        "kind": "squarespace", "source_name": "Flourish-Arts as Sacred Healing",
        "collection": "https://www.flourishme.life/happenings-1",
        "venue": {"name": "Flourish-Arts as Sacred Healing", "address": "140 Main St",
                  "city": "Biddeford", "lat": 43.4926, "lng": -70.4656},
        "default_category": "learn",
    },
    "brickstore": {
        "kind": "tribe", "source_name": "Brick Store Museum",
        "base": "https://www.brickstoremuseum.org",
        "venue": {"name": "Brick Store Museum", "address": "117 Main St",
                  "city": "Kennebunk", "lat": 43.3847, "lng": -70.5412},
        "default_category": "learn",
        "notes": "Known source-data flaw: recurring tours carry a bogus "
                 "23:30 end time in the museum's own data (real end ~1h "
                 "after start). Items with duration > 8h are flagged in "
                 "the report, not silently corrected.",
    },
    "artascope": {
        "kind": "tribe", "source_name": "Artascope Studios",
        "base": "https://artascope.org",
        "venue": {"name": "Artascope Studios", "address": "138 Bayview St",
                  "city": "Yarmouth", "lat": 43.8040, "lng": -70.1721},
        "default_category": "learn",
    },
    "mihc": {
        "kind": "tribe", "source_name": "Maine Irish Heritage Center",
        "base": "https://maineirish.com",
        "venue": {"name": "Maine Irish Heritage Center", "address": "34 Gray St",
                  "city": "Portland", "lat": 43.6517, "lng": -70.2683},
        "default_category": "on-stage",
    },
    # ---- added Nov 4, 2026 (second audit wave: feed-fix-2) ----
    "usm-calendar": {
        "kind": "ics", "source_name": "USM Calendar",
        "venue": {"name": "University of Southern Maine", "address": None,
                  "city": "Portland", "lat": 43.6623, "lng": -70.2756},
        "default_category": "learn",
        # Same platform as UMaine (WordPress Tribe): the REST API is
        # login-locked (401 rest_not_logged_in), the ICS archive exports
        # are the public feed. The all-events list is dense (a whole
        # university, ~9 days per 30-event page), so the run also pulls
        # the two category archives that exist: planetarium (the
        # Southworth slate lives there) and athletics-calendar. The
        # Crewe Center recitals ride the all-events archive.
        "archives": [
            "https://usm.maine.edu/calendar-of-events/events/",
            "https://usm.maine.edu/calendar-of-events/events/category/planetarium/",
            "https://usm.maine.edu/calendar-of-events/events/category/athletics-calendar/",
        ],
        "max_pages": 30,
        "notes": "REST API is login-locked (rest_not_logged_in); ICS "
                 "export is the feed, same as UMaine. Events span the "
                 "Portland and Gorham campuses — the LOCATION field's "
                 "first segment overrides the venue name when present. "
                 "No structured cost in ICS.",
    },
    # Small-college athletics: every Maine school checked runs SIDEARM.
    # Each sport's schedule page embeds a plain-text schedule service
    # (/services/schedule_txt.ashx?schedule=<id>) carrying the full
    # season — date, local start time, Home/Away/Neutral, opponent,
    # location — with home/away explicit. The puller discovers the
    # schedule id from the schedule page, then parses the text table.
    # Only Home rows are emitted (an away game is the host school's
    # feed's row, so every in-state game surfaces exactly once); away
    # and neutral rows are counted in the puller's diagnostics.
    "bates": {
        "kind": "sidearm", "source_name": "Bates Athletics",
        "host": "gobatesbobcats.com", "team_name": "Bates",
        "sports": ["mens-basketball", "womens-basketball",
                   "mens-ice-hockey", "womens-ice-hockey"],
        "venue": {"name": "Alumni Gymnasium", "address": None,
                  "city": "Lewiston", "lat": 44.1063, "lng": -70.2030},
        "default_category": "game-day",
        "notes": "Bates has no varsity ice hockey — those sport pages "
                 "yield no schedule id and are skipped by design.",
    },
    "bowdoin": {
        "kind": "sidearm", "source_name": "Bowdoin Athletics",
        "host": "athletics.bowdoin.edu", "team_name": "Bowdoin",
        "sports": ["mens-basketball", "womens-basketball",
                   "mens-ice-hockey", "womens-ice-hockey"],
        "venue": {"name": "Morrell Gymnasium", "address": None,
                  "city": "Brunswick", "lat": 43.9087, "lng": -69.9638},
        "default_category": "game-day",
    },
    "colby": {
        "kind": "sidearm", "source_name": "Colby Athletics",
        "host": "colbyathletics.com", "team_name": "Colby",
        "sports": ["mens-basketball", "womens-basketball",
                   "mens-ice-hockey", "womens-ice-hockey"],
        "venue": {"name": "Margaret M. Crook Center", "address": None,
                  "city": "Waterville", "lat": 44.5639, "lng": -69.6637},
        "default_category": "game-day",
    },
    "une": {
        "kind": "sidearm", "source_name": "UNE Athletics",
        "host": "athletics.une.edu", "team_name": "UNE",
        "sports": ["mens-basketball", "womens-basketball",
                   "mens-ice-hockey", "womens-ice-hockey"],
        "venue": {"name": "Harold Alfond Forum", "address": None,
                  "city": "Biddeford", "lat": 43.4576, "lng": -70.3915},
        "default_category": "game-day",
    },
    "usm": {
        "kind": "sidearm", "source_name": "USM Athletics",
        "host": "southernmainehuskies.com", "team_name": "Southern Maine",
        "sports": ["mens-basketball", "womens-basketball",
                   "mens-ice-hockey", "womens-ice-hockey"],
        "venue": {"name": "Hill Gymnasium", "address": None,
                  "city": "Gorham", "lat": 43.6795, "lng": -70.4434},
        "default_category": "game-day",
    },
    "husson": {
        "kind": "sidearm", "source_name": "Husson Athletics",
        "host": "hussoneagles.com", "team_name": "Husson",
        "sports": ["mens-basketball", "womens-basketball",
                   "mens-ice-hockey", "womens-ice-hockey"],
        "venue": {"name": "Newman Gymnasium", "address": None,
                  "city": "Bangor", "lat": 44.8262, "lng": -68.7923},
        "default_category": "game-day",
        "notes": "Husson has no varsity ice hockey — those sport pages "
                 "yield no schedule id and are skipped by design.",
    },
    "thomas": {
        "kind": "sidearm", "source_name": "Thomas Athletics",
        "host": "thomasathletics.com", "team_name": "Thomas",
        "sports": ["mens-basketball", "womens-basketball",
                   "mens-ice-hockey", "womens-ice-hockey"],
        "venue": {"name": "Larry Mahaney Gymnasium", "address": None,
                  "city": "Waterville", "lat": 44.5630, "lng": -69.6740},
        "default_category": "game-day",
        "notes": "athletics.thomas.edu serves byte-identical content "
                 "(same SIDEARM site, dual host); thomasathletics.com "
                 "is the canonical host used here. No varsity hockey.",
    },
    "umf": {
        "kind": "sidearm", "source_name": "UMF Athletics",
        "host": "goumfbeavers.com", "team_name": "UMF",
        "sports": ["mens-basketball", "womens-basketball",
                   "mens-ice-hockey", "womens-ice-hockey"],
        "venue": {"name": "Dearborn Gymnasium", "address": None,
                  "city": "Farmington", "lat": 44.6700, "lng": -70.1467},
        "default_category": "game-day",
        "notes": "No varsity ice hockey — hockey pages yield no "
                 "schedule id and are skipped by design.",
    },
    "mma": {
        "kind": "sidearm", "source_name": "Maine Maritime Athletics",
        "host": "marinersports.org", "team_name": "Maine Maritime",
        "sports": ["mens-basketball", "womens-basketball",
                   "mens-ice-hockey", "womens-ice-hockey"],
        "venue": {"name": "Margaret Chase Smith Gymnasium", "address": None,
                  "city": "Castine", "lat": 44.3861, "lng": -68.8064},
        "default_category": "game-day",
        "notes": "No varsity ice hockey — hockey pages yield no "
                 "schedule id and are skipped by design.",
    },
}

# Sources checked Nov 4, 2026 with NO usable public feed (stay on the
# sweep's prose pass): Gray Public Library (Wix homepage announcements,
# no calendar feed), Dyer Library Saco (Weebly site with no published
# events calendar at all).
# Second wave, checked Nov 4, 2026 (feed-fix-2): Waterville Public
# Library (an RSS endpoint exists at /RSS/eventsfeed.php but returns an
# empty channel — zero items — in every variant tried; the events live
# only in HTML index/detail pages), Waterville Creates (WordPress; the
# Tribe events REST route 404s and the WP REST 'shows' post type
# exposes titles/links but NO dates — show dates exist only in rendered
# HTML), Maine Celtics / NBA G League (stats.nba.com times out from
# this network, cdn.nba.com static JSON is Akamai-denied, and the
# gleague.nba.com schedule page's embedded __NEXT_DATA__ contains no
# game data — the slate stays a prose-pass source via Ticketmaster and
# the team schedule page).


def fetch(url, timeout=60, retries=3):
    """Fetch a URL. curl is the primary transport: several of these hosts
    truncate large responses to Python's urllib mid-stream (observed:
    SPPL's Tribe API returns 48K of 181K to urllib, complete to curl),
    while curl completes. urllib remains as the fallback."""
    import http.client
    import subprocess
    last = None
    for _ in range(retries):
        try:
            r = subprocess.run(["curl", "-s", "-L", "-A", UA,
                                "--max-time", str(timeout), url],
                               capture_output=True, timeout=timeout + 15)
            if r.returncode == 0 and r.stdout:
                return r.stdout.decode("utf-8", errors="ignore")
            last = RuntimeError(f"curl rc={r.returncode}")
        except Exception as e:  # noqa: BLE001
            last = e
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                expected = resp.headers.get("Content-Length")
                chunks = []
                while True:
                    try:
                        chunk = resp.read(1 << 16)
                    except http.client.IncompleteRead as e:
                        chunks.append(e.partial)
                        break
                    if not chunk:
                        break
                    chunks.append(chunk)
                body = b"".join(chunks)
                if expected and len(body) < int(expected):
                    raise http.client.IncompleteRead(body, int(expected) - len(body))
                return body.decode("utf-8", errors="ignore")
        except Exception as e:  # noqa: BLE001 - retry any transport failure
            last = e
    raise last


def clean_text(html_str, cap=800):
    if not html_str:
        return None
    txt = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", html_str)
    txt = re.sub(r"(?is)<(br|/p|/div|/li|/h[1-6])[^>]*>", "\n", txt)
    txt = html_mod.unescape(re.sub(r"(?s)<[^>]+>", " ", txt))
    txt = "\n".join(l.strip() for l in (re.sub(r"\s+", " ", l) for l in txt.splitlines()) if l)
    return (txt[:cap].rstrip() or None)


def iso_with_offset(dt):
    """Naive Maine-local datetime -> ISO string with the real UTC offset."""
    return dt.replace(tzinfo=NY).isoformat()


def parse_local(s):
    return datetime.strptime(s.strip(), "%Y-%m-%d %H:%M:%S")


CATEGORY_RULES = [
    (r"storytime|story time|baby|toddler|preschool", "family-fun"),
    (r"trivia", "bar-brain"),
    (r"concert|live music|open mic|jam session|irish session|circle singing", "on-stage"),
    (r"film|movie|screening", "on-stage"),
    (r"exhibit|gallery|art show|reception", "gallery"),
    (r"\bmarket\b|craft fair|holiday fair", "town-square"),
    (r"planetarium|astronomy|night sky", "on-stage"),
]


def categorize(cfg, title, source_categories=""):
    hay = f"{title} {source_categories}".lower()
    for pat, slug in CATEGORY_RULES:
        if re.search(pat, hay):
            return slug
    return cfg["default_category"]


def base_item(cfg, title):
    return {"title": title, "description": None, "category_slug": cfg["default_category"],
            "starts_at": None, "ends_at": None, "cost_free": False, "cost_text": None,
            "url": None, "source": cfg["source_name"], "image_url": None,
            "recurrence": None, "series_key": None,
            "venue": dict(cfg["venue"])}


# ---------------------------------------------------------------- tribe
def pull_tribe(cfg, start, end):
    base = cfg["base"].rstrip("/")
    items, feed_urls, page, total_pages = [], [], 1, 1
    while page <= total_pages:
        url = (f"{base}/wp-json/tribe/events/v1/events"
               f"?start_date={start:%Y-%m-%d}%2000:00:00&end_date={end:%Y-%m-%d}%2023:59:59"
               f"&per_page=20&page={page}&status=publish")
        feed_urls.append(url)
        data = json.loads(fetch(url))
        total_pages = int(data.get("total_pages") or 1)
        for ev in data.get("events", []):
            it = base_item(cfg, html_mod.unescape(ev.get("title") or "").strip())
            try:
                it["starts_at"] = iso_with_offset(parse_local(ev["start_date"]))
                it["ends_at"] = iso_with_offset(parse_local(ev["end_date"])) if ev.get("end_date") else None
            except Exception:
                it["_bad_date"] = ev.get("start_date")
            it["url"] = ev.get("url") or None
            it["description"] = clean_text(ev.get("description"))
            cost = html_mod.unescape((ev.get("cost") or "").strip())
            cost = re.sub(r"<[^>]+>", "", cost).strip()
            if cost:
                it["cost_text"] = cost
                it["cost_free"] = bool(re.fullmatch(r"\$?0(\.00)?|free", cost, re.I))
            img = ev.get("image")
            if isinstance(img, str) and img.startswith("http"):
                it["image_url"] = img
            v = ev.get("venue") or {}
            if v.get("venue"):
                venue = {"name": html_mod.unescape(v["venue"]),
                         "address": v.get("address") or cfg["venue"]["address"],
                         "city": v.get("city") or cfg["venue"]["city"],
                         "lat": v.get("geo_lat") or cfg["venue"]["lat"],
                         "lng": v.get("geo_lng") or cfg["venue"]["lng"]}
                it["venue"] = venue
            cats = " ".join(c.get("name", "") for c in ev.get("categories", []) if isinstance(c, dict))
            it["category_slug"] = categorize(cfg, it["title"], cats)
            items.append(it)
        page += 1
    return items, feed_urls


# ------------------------------------------------------- librarycalendar
def pull_librarycalendar(cfg, start, end):
    url = cfg["base"].rstrip("/") + "/events/feed/json"
    raw_items = json.loads(fetch(url, timeout=120))
    items = []
    for ev in raw_items:
        if not ev.get("public", True) or not ev.get("published", True):
            continue
        try:
            s = parse_local(ev["start_date"])
            e = parse_local(ev["end_date"]) if ev.get("end_date") else None
        except Exception:
            continue
        if not (start <= s < end):
            continue
        it = base_item(cfg, (ev.get("title") or "").strip())
        it["starts_at"] = iso_with_offset(s)
        it["ends_at"] = iso_with_offset(e) if e else None
        it["url"] = ev.get("url") or None
        it["description"] = clean_text(ev.get("description"))
        if ev.get("image"):
            it["image_url"] = ev["image"]
        branch = next(iter((ev.get("branch") or {}).values()), None)
        offsite = ev.get("offsite_address")
        if offsite:
            it["venue"] = {"name": str(offsite), "address": None,
                           "city": cfg["venue"]["city"], "lat": None, "lng": None}
        elif branch and "branch" in str(branch).lower():
            it["venue"] = dict(cfg["venue"], name=f"{cfg['venue']['name']} ({branch})")
        ptype = " ".join(str(v) for v in (ev.get("program_type") or {}).values())
        it["category_slug"] = categorize(cfg, it["title"], ptype)
        items.append(it)
    return items, [url]


# ------------------------------------------------------------ squarespace
def pull_squarespace(cfg, start, end):
    url = cfg["collection"].rstrip("/") + "?format=json"
    data = json.loads(fetch(url, timeout=90))
    items = []
    for ev in data.get("upcoming", []):
        try:
            s = datetime.fromtimestamp(ev["startDate"] / 1000, tz=timezone.utc).astimezone(NY).replace(microsecond=0)
            e = datetime.fromtimestamp(ev["endDate"] / 1000, tz=timezone.utc).astimezone(NY).replace(microsecond=0)
        except Exception:
            continue
        if not (start <= s.replace(tzinfo=None) < end):
            continue
        it = base_item(cfg, (ev.get("title") or "").strip())
        it["starts_at"] = s.isoformat()
        it["ends_at"] = e.isoformat()
        full = ev.get("fullUrl") or ""
        it["url"] = (cfg["collection"].split("/")[0] + "//" + cfg["collection"].split("/")[2] + full) if full.startswith("/") else (full or None)
        it["description"] = clean_text(ev.get("body"))
        if ev.get("assetUrl"):
            it["image_url"] = ev["assetUrl"]
        loc = ev.get("location") or {}
        if loc.get("name"):
            it["venue"] = {"name": loc["name"],
                           "address": loc.get("addressLine1") or cfg["venue"]["address"],
                           "city": loc.get("addressLine2") or cfg["venue"]["city"],
                           "lat": cfg["venue"]["lat"], "lng": cfg["venue"]["lng"]}
        cats = " ".join(ev.get("categories", []) or [])
        it["category_slug"] = categorize(cfg, it["title"], cats)
        items.append(it)
    return items, [url]


# ------------------------------------------------------------------- ics
def _ics_unfold(raw):
    return re.sub(r"\r?\n[ \t]", "", raw)


def _ics_unescape(s):
    return s.replace("\\n", "\n").replace("\\,", ",").replace("\\;", ";").replace("\\\\", "\\")


def _parse_ics_dt(value, params):
    value = value.strip()
    if re.fullmatch(r"\d{8}", value):
        d = datetime.strptime(value, "%Y%m%d")
        return d.replace(tzinfo=NY)
    if value.endswith("Z"):
        return datetime.strptime(value, "%Y%m%dT%H%M%S%z").astimezone(NY)
    dt = datetime.strptime(value, "%Y%m%dT%H%M%S")
    tzid = params.get("TZID")
    if tzid:
        try:
            return dt.replace(tzinfo=ZoneInfo(tzid))
        except Exception:
            return dt.replace(tzinfo=NY)
    return dt.replace(tzinfo=NY)


def parse_ics(raw):
    events = []
    for block in _ics_unfold(raw).split("BEGIN:VEVENT")[1:]:
        block = block.split("END:VEVENT")[0]
        fields = {}
        for line in block.splitlines():
            if ":" not in line:
                continue
            key, value = line.split(":", 1)
            parts = key.split(";")
            params = dict(p.split("=", 1) for p in parts[1:] if "=" in p)
            fields.setdefault(parts[0], (value.strip(), params))
        if "DTSTART" not in fields or "SUMMARY" not in fields:
            continue
        try:
            s = _parse_ics_dt(*fields["DTSTART"])
            e = _parse_ics_dt(*fields["DTEND"]) if "DTEND" in fields else None
        except Exception:
            continue
        events.append({
            "uid": fields.get("UID", ("", {}))[0],
            "title": _ics_unescape(fields["SUMMARY"][0]),
            "starts": s, "ends": e,
            "url": fields.get("URL", (None, {}))[0],
            "location": _ics_unescape(fields["LOCATION"][0]) if "LOCATION" in fields else None,
            "description": _ics_unescape(fields["DESCRIPTION"][0]) if "DESCRIPTION" in fields else None,
            "categories": fields.get("CATEGORIES", ("", {}))[0],
        })
    return events


def pull_ics(cfg, start, end):
    items, feed_urls, seen_uids = [], [], set()
    for archive in cfg["archives"]:
        for page in range(1, cfg.get("max_pages", 30) + 1):
            if page == 1:
                url = archive.rstrip("/") + "/?ical=1"
            else:
                url = archive.rstrip("/") + f"/list/page/{page}/?ical=1"
            feed_urls.append(url)
            try:
                raw = fetch(url)
            except Exception:
                break
            new_here = 0
            page_max = None
            for ev in parse_ics(raw):
                s_naive = ev["starts"].replace(tzinfo=None)
                page_max = s_naive if page_max is None or s_naive > page_max else page_max
                if ev["uid"] in seen_uids:
                    continue
                seen_uids.add(ev["uid"])
                new_here += 1
                if not (start <= s_naive < end):
                    continue
                it = base_item(cfg, ev["title"])
                it["starts_at"] = ev["starts"].astimezone(NY).isoformat()
                it["ends_at"] = ev["ends"].astimezone(NY).isoformat() if ev["ends"] else None
                it["url"] = ev["url"]
                it["description"] = clean_text(ev["description"])
                if ev["location"]:
                    loc_name = ev["location"].split(",")[0].strip()
                    if loc_name and loc_name.lower() != cfg["venue"]["name"].lower():
                        it["venue"] = dict(cfg["venue"], name=loc_name)
                it["category_slug"] = categorize(cfg, ev["title"], ev["categories"])
                items.append(it)
            # Stop paging an archive once it stops yielding new events or
            # its window has moved past the horizon.
            if new_here == 0 or (page_max and page_max >= end):
                break
    return items, feed_urls


# -------------------------------------------------------------- libcal rss
LIBCAL_NS = {"libcal": "https://libcal.com/rss_xmlns.php"}


def _rss_items(xml_text):
    root = ET.fromstring(xml_text)
    return root.findall(".//item")


def _text(parent, tag):
    if ":" in tag:  # namespaced, e.g. libcal:date
        prefix, local = tag.split(":", 1)
        el = parent.find(f"{{{LIBCAL_NS[prefix]}}}{local}")
    else:
        el = parent.find(tag)
    return (el.text or "").strip() if el is not None and el.text else None


def _parse_ampm_range(desc_html):
    """'3:30 PM - 4:30 PM' style ranges inside feed description text."""
    m = re.search(r"(\d{1,2}:\d{2}\s*[AP]M)\s*[-–—]\s*(\d{1,2}:\d{2}\s*[AP]M)", desc_html or "", re.I)
    if m:
        return m.group(1), m.group(2)
    m = re.search(r"(\d{1,2}:\d{2}\s*[AP]M)", desc_html or "", re.I)
    return (m.group(1), None) if m else (None, None)


def _ampm_to_time(s):
    return datetime.strptime(re.sub(r"\s+", " ", s.strip().upper()), "%I:%M %p").time()


def pull_libcal(cfg, start, end):
    xml_text = fetch(cfg["feed"])
    items = []
    for node in _rss_items(xml_text):
        date_s = _text(node, "libcal:date")
        if not date_s:
            continue
        desc = _text(node, "description") or ""
        t1, t2 = _parse_ampm_range(desc)
        try:
            day = datetime.strptime(date_s, "%Y-%m-%d")
        except Exception:
            continue
        s = datetime.combine(day.date(), _ampm_to_time(t1)) if t1 else day
        e = datetime.combine(day.date(), _ampm_to_time(t2)) if t2 else None
        if not (start <= s < end):
            continue
        it = base_item(cfg, _text(node, "title") or "")
        it["starts_at"] = iso_with_offset(s)
        it["ends_at"] = iso_with_offset(e) if e else None
        it["url"] = _text(node, "link")
        it["description"] = clean_text(desc)
        img = _text(node, "libcal:feat_image")
        if img:
            it["image_url"] = img
        room = _text(node, "libcal:location")
        if room:
            it["venue"] = dict(cfg["venue"], name=f"{cfg['venue']['name']} ({room})")
        it["category_slug"] = categorize(cfg, it["title"],
                                         " ".join(c.text or "" for c in node.findall("category")))
        items.append(it)
    return items, [cfg["feed"]]


# ------------------------------------------------------------- assabet rss
def pull_assabet(cfg, start, end):
    xml_text = fetch(cfg["feed"])
    items = []
    for node in _rss_items(xml_text):
        desc = _text(node, "description") or ""
        plain = clean_text(desc, cap=4000) or ""
        m = re.search(r"(\w+ \d{1,2}, \d{4})\s+(\d{1,2}:\d{2}\s*[AP]M)?\s*(?:[-–—]\s*(\d{1,2}:\d{2}\s*[AP]M))?",
                      plain)
        if not m:
            continue
        try:
            day = datetime.strptime(m.group(1), "%B %d, %Y")
        except Exception:
            continue
        s = datetime.combine(day.date(), _ampm_to_time(m.group(2))) if m.group(2) else day
        e = datetime.combine(day.date(), _ampm_to_time(m.group(3))) if m.group(3) else None
        if not (start <= s < end):
            continue
        it = base_item(cfg, _text(node, "title") or "")
        it["starts_at"] = iso_with_offset(s)
        it["ends_at"] = iso_with_offset(e) if e else None
        it["url"] = _text(node, "link")
        body = re.sub(r"^\S+ \d{1,2}, \d{4}[^\n]*\n?", "", plain)
        body = re.sub(r"^[^\n]*Kennebunk Free Library[^\n]*\n?", "", body)
        body = re.sub(r"^112 Main St\.[^\n]*\n?", "", body)
        it["description"] = (body.strip()[:800] or None)
        it["category_slug"] = categorize(cfg, it["title"])
        items.append(it)
    return items, [cfg["feed"]]


# -------------------------------------------------------------- sidearm
SIDEARM_SPORT_LABELS = {"mens-basketball": "Men's Basketball",
                        "womens-basketball": "Women's Basketball",
                        "mens-ice-hockey": "Men's Ice Hockey",
                        "womens-ice-hockey": "Women's Ice Hockey"}
_MONTHS = {m: i + 1 for i, m in enumerate(
    ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
     "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"])}


def _sidearm_season(dt):
    """Winter-season label ('2026-27') for a run date."""
    if dt.month >= 7:
        return f"{dt.year}-{str(dt.year + 1)[-2:]}"
    return f"{dt.year - 1}-{str(dt.year)[-2:]}"


def _sidearm_time(s):
    """'7:30 p.m.' / 'Noon' / 'Noon / 2 p.m.' / '7 p.m. (10 p.m. EST)'
    -> datetime.time, or None when the feed says TBA/other."""
    s = re.sub(r"\s*\([^)]*\)\s*$", "", (s or "").strip())  # drop "(10 p.m. EST)"
    s = s.split("/")[0].strip()  # tournament TBD double-headers: first time
    s = re.split(r"\s+or\s+", s)[0].strip()  # "1:30 p.m. or 3:30 p.m.": first
    low = s.lower()
    if low == "noon":
        return datetime.strptime("12:00 PM", "%I:%M %p").time()
    if low == "midnight":
        return datetime.strptime("12:00 AM", "%I:%M %p").time()
    m = re.fullmatch(r"(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?", low)
    if m:
        return datetime.strptime(
            f"{m.group(1)}:{m.group(2) or '00'} {m.group(3).upper()}M",
            "%I:%M %p").time()
    return None


def _sidearm_venue(cfg, location):
    venue = dict(cfg["venue"])
    if not location:
        return venue
    m = re.search(r"\(([^)]+)\)\s*$", location)
    if m:
        venue["name"] = m.group(1).strip()
    elif " / " in location:
        venue["name"] = location.split(" / ", 1)[1].strip()
    city = location.split(",")[0].strip()
    if city:
        venue["city"] = city
    return venue


def pull_sidearm(cfg, start, end):
    """Per sport: the schedule page embeds a plain-text schedule service
    id; the service returns the full season as a fixed-width table.
    Emits HOME games only — an away game is the host school's row in
    that school's own feed. Diagnostics (rows seen by class) are kept
    on cfg['_diag'] and printed, since the report shape is fixed."""
    season = _sidearm_season(start)
    season_year = int(season.split("-")[0])
    items, feed_urls = [], []
    diag = {"season": season, "sports": {}}
    for slug in cfg["sports"]:
        label = SIDEARM_SPORT_LABELS.get(slug, slug)
        page_url = f"https://{cfg['host']}/sports/{slug}/schedule/{season}"
        feed_urls.append(page_url)
        d = {"rows": 0, "home": 0, "away": 0, "neutral": 0,
             "tba_time": 0, "unparsed": 0, "schedule_id": None,
             "header_mismatch": False}
        diag["sports"][slug] = d
        try:
            page = fetch(page_url, timeout=90)
        except Exception:
            continue
        m = re.search(r"schedule_txt\.ashx\?schedule=(\d+)", page)
        if not m:
            continue
        d["schedule_id"] = m.group(1)
        txt_url = (f"https://{cfg['host']}/services/schedule_txt.ashx"
                   f"?schedule={m.group(1)}")
        feed_urls.append(txt_url)
        try:
            raw = fetch(txt_url)
        except Exception:
            continue
        # Header guard: some schools' pages for sports they don't
        # sponsor embed an unrelated schedule id (Husson's hockey pages
        # point at a stale "General Schedule"). Trust the txt only when
        # its own header names this sport and this season.
        head = " ".join(raw.splitlines()[:5]).replace("’", "'")
        if not re.search(rf"\b{re.escape(label)}\b", head, re.I) \
                or str(season_year) not in head:
            d["header_mismatch"] = True
            continue
        for line in raw.splitlines():
            rm = re.match(r"^([A-Z][a-z]{2}) (\d{1,2}) \([A-Za-z]{3}\)\s+(.*)$",
                          line.strip())
            if not rm:
                continue
            fields = re.split(r"\s{2,}", rm.group(3).strip())
            if len(fields) < 4 or fields[1] not in ("Home", "Away", "Neutral"):
                d["unparsed"] += 1
                continue
            d["rows"] += 1
            d[fields[1].lower()] += 1
            if fields[1] != "Home":
                continue
            month = _MONTHS[rm.group(1)]
            year = season_year if month >= 7 else season_year + 1
            t = _sidearm_time(fields[0])
            if t is None:
                d["tba_time"] += 1
                t = datetime.min.time()
            s = datetime(year, month, int(rm.group(2)), t.hour, t.minute)
            if not (start <= s < end):
                continue
            opponent = re.sub(r"\s*\*+\s*$", "", fields[2]).strip()
            location = fields[3] if len(fields) > 3 else None
            # Source flaw: the arena parenthetical is sometimes padded
            # into its own column ("Lewiston, Maine  (Underhill Arena)")
            # and split off — rejoin it.
            if location and len(fields) > 4 and fields[4].startswith("("):
                location = f"{location} {fields[4]}"
            it = base_item(cfg, f"{cfg['team_name']} {label} vs {opponent}")
            it["starts_at"] = iso_with_offset(s)
            it["url"] = page_url
            it["venue"] = _sidearm_venue(cfg, location)
            it["category_slug"] = "game-day"
            items.append(it)
    cfg["_diag"] = diag
    print(f"  sidearm {cfg['host']}: " + "; ".join(
        f"{slug} id={d['schedule_id']} rows={d['rows']} home={d['home']} "
        f"away={d['away']} neutral={d['neutral']} tba={d['tba_time']} "
        f"unparsed={d['unparsed']}"
        + (" HEADER-MISMATCH" if d["header_mismatch"] else "")
        for slug, d in diag["sports"].items()))
    return items, feed_urls


PULLERS = {"tribe": pull_tribe, "librarycalendar": pull_librarycalendar,
           "squarespace": pull_squarespace, "ics": pull_ics,
           "libcal-rss": pull_libcal, "assabet-rss": pull_assabet,
           "sidearm": pull_sidearm}


def validate(items):
    bad_dates, missing_url, long_events = [], [], []
    for it in items:
        try:
            s = datetime.fromisoformat(it["starts_at"])
            if it.get("ends_at"):
                hrs = (datetime.fromisoformat(it["ends_at"]) - s).total_seconds() / 3600
                if hrs > 8:
                    long_events.append(f"{it['title']} ({hrs:.1f}h)")
        except Exception:
            bad_dates.append(it.get("title"))
        if not it.get("url"):
            missing_url.append(it.get("title"))
        it.pop("_bad_date", None)
    return {"bad_dates": bad_dates, "missing_url": missing_url,
            "duration_over_8h_flagged_not_fixed": long_events}


def run_source(key, horizon_days, outdir):
    cfg = SOURCES[key]
    now = datetime.now(NY).replace(tzinfo=None)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=horizon_days)
    items, feed_urls = PULLERS[cfg["kind"]](cfg, start, end)
    # Dedupe within the feed: same title at the same start time.
    seen, deduped = set(), []
    for it in sorted(items, key=lambda x: x["starts_at"] or ""):
        k = (re.sub(r"\s+", " ", (it["title"] or "").lower().strip()), it["starts_at"])
        if k in seen:
            continue
        seen.add(k)
        deduped.append(it)
    os.makedirs(outdir, exist_ok=True)
    json.dump(deduped, open(os.path.join(outdir, "events.json"), "w"), indent=1)
    starts = [it["starts_at"] for it in deduped if it["starts_at"]]
    report = {"source": key, "source_name": cfg["source_name"], "kind": cfg["kind"],
              "feed_urls": feed_urls, "horizon_days": horizon_days,
              "fetched_in_window": len(items), "after_dedupe": len(deduped),
              "covered_range": [min(starts), max(starts)] if starts else None,
              "validation": validate(deduped),
              "notes": cfg.get("notes")}
    json.dump(report, open(os.path.join(outdir, "report.json"), "w"), indent=1)
    print(f"{key}: {len(deduped)} items in {horizon_days}d window, "
          f"range {report['covered_range']}, validation={report['validation']}")
    return report


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", choices=sorted(SOURCES))
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--horizon-days", type=int, default=60)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    if args.all:
        for key in sorted(SOURCES):
            try:
                run_source(key, args.horizon_days, os.path.join(args.out, key))
            except Exception as e:
                print(f"{key}: FAILED {type(e).__name__}: {e}")
    elif args.source:
        run_source(args.source, args.horizon_days, args.out)
    else:
        ap.error("pass --source <key> or --all")


if __name__ == "__main__":
    raise SystemExit(main())
