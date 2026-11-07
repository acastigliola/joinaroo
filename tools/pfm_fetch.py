#!/usr/bin/env python3
"""Portland Food Map fetch — the mechanical layer for a prose source.

PFM's Events category is a weekly roundup post plus standalone posts:
prose, not a structured feed, so this tool does NOT extract events.
It pulls the newest posts from the WordPress REST API, cleans each to
text with outbound links inline, tracks which posts are new or updated
since the last run (state file), and writes a candidates file for the
sweep's extraction pass — the same division of labor as feed_extract.py:
mechanical work in code, judgment in the model layer.

Born Nov 5, 2026: Angelo added Portland Food Map to the sweep list
after a manual harvest found 5 events the radar had missed (3 ingested,
2 flagged). The Thanksgiving resource guide is out of scope by his
ruling — a business being open is not an event.

Usage:
  pfm_fetch.py [--days 21] [--state <path>] [--out <path>]

Defaults: state and candidates live in the events-watch goal's
hidden_files. Prints one summary line.
"""
import argparse
import html as html_mod
import json
import os
import re
import sys
import urllib.request
from datetime import datetime, timedelta, timezone

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36"
API = ("https://www.portlandfoodmap.com/wp-json/wp/v2/posts"
       "?categories=6&per_page=15&orderby=date&order=desc"
       "&_fields=id,date,modified,link,title,content")
BASE = os.path.expanduser(
    "~/workspace/goals/southern-maine-events-watch/hidden_files")


def fetch(url, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")


def clean(content_html):
    """Post HTML -> text with links inline as 'text [url]'."""
    c = re.sub(r'<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>',
               lambda m: f"{re.sub('<[^>]+>', '', m.group(2))} [{m.group(1)}]",
               content_html, flags=re.S)
    t = re.sub(r"<(p|li|br|h\d)[^>]*>", "\n", c)
    t = re.sub("<[^>]+>", "", t)
    t = html_mod.unescape(t)
    return re.sub(r"\n\s*\n+", "\n", t).strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=21)
    ap.add_argument("--state", default=os.path.join(BASE, "pfm-seen.json"))
    ap.add_argument("--out", default=os.path.join(BASE, "pfm-candidates.json"))
    args = ap.parse_args()

    posts = json.loads(fetch(API))
    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=args.days)
    kept = []
    for p in posts:
        # WP returns site-local naive datetimes; close enough for a window.
        d = datetime.fromisoformat(p["date"]).replace(tzinfo=None)
        if d >= cutoff:
            kept.append(p)

    seen = {}
    if os.path.exists(args.state):
        seen = json.load(open(args.state))
    new_ids = []
    out_posts = []
    for p in kept:
        pid = str(p["id"])
        if seen.get(pid) != p["modified"]:
            new_ids.append(p["id"])
        title = html_mod.unescape(re.sub("<[^>]+>", "", p["title"]["rendered"]))
        out_posts.append({"id": p["id"], "date": p["date"][:10],
                          "modified": p["modified"], "title": title,
                          "link": p["link"],
                          "text": clean(p["content"]["rendered"])})
        seen[pid] = p["modified"]

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    json.dump({"fetched_at": datetime.now(timezone.utc).isoformat(),
               "new_post_ids": new_ids, "posts": out_posts},
              open(args.out, "w"), indent=1)
    json.dump(seen, open(args.state, "w"), indent=1)
    print(f"pfm: {len(out_posts)} posts in {args.days}d window, "
          f"{len(new_ids)} new/updated (ids {new_ids}) -> {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
