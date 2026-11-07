#!/usr/bin/env python3
"""Peephole people-gate stamper (Nov 2, 2026).

Vision-stamps event_photos.has_people (1/0) on credited photos that
don't have a stamp yet, using muse-spark-1.3-contributor. The peephole's quality
gate counts ONLY has_people=1 photos — Spark's rule: proof a room was
alive means visible people, not empty stages or merch shots.

Window: credited photos whose event started in the last 6 days, or
that were uploaded in the last 24h (tonight's finder output). Idem-
potent — stamped rows are never re-checked. Prints one summary line.
Ledger the spend in META-SPEND-LEDGER.md after manual runs (the
evening cron's runs are batched into the daily note by its own body).
"""
import argparse
import base64
import json
import subprocess
import sys
import urllib.request
from datetime import datetime

sys.path.insert(0, "/home/hatch/workspace/custom-connectors/custom.meta-model-api/bin")
import meta_api

SSH = "/home/hatch/workspace/smevents-deploy/prod-ssh.sh"
PROMPT = (
    "You are checking an event photo for a nightlife feature. Answer with "
    "exactly one word, YES or NO, and nothing else. YES if the photo shows "
    "people as a real presence in the room: distinguishable faces, audience "
    "members, fans, attendees, or performers on stage - OR a dense crowd "
    "facing a stage or performance, even when individual faces are not "
    "resolved (a wall of heads, raised hands, and foreground crowd density "
    "in front of a lit stage counts as people). NO only if the photo shows "
    "an empty room or empty stage or gear with nobody present, merchandise, "
    "posters or flyers, food, objects, scenery without people, or a single "
    "stray person with no crowd or performance context."
)


def sql(query, stdin_mode=False):
    """Run sqlite3 on prod; raise on any failure (non-zero exit or
    stderr output) so a write that didn't land is never counted."""
    if stdin_mode:
        proc = subprocess.run(
            [SSH, "sqlite3 /opt/smevents/api/smevents.db"],
            input=query, capture_output=True, text=True, timeout=120,
        )
    else:
        proc = subprocess.run(
            [SSH, f"sqlite3 /opt/smevents/api/smevents.db \"{query}\""],
            capture_output=True, text=True, timeout=120,
        )
    if proc.returncode != 0 or proc.stderr.strip():
        raise RuntimeError(
            f"sqlite3 failed (rc={proc.returncode}): {proc.stderr.strip()[:300]}")
    return proc.stdout


def backup_db():
    """Snapshot the prod DB before any write, house backup style."""
    name = (f"/opt/smevents/backups/smevents-pre-peoplestamp-"
            f"{datetime.now():%Y%m%d-%H%M%S}.db")
    sql(f".backup {name}")
    print(f"backup: {name}", flush=True)
    return name


def fetch_candidates():
    q = (
        "SELECT p.id || '|' || p.filename FROM event_photos p "
        "JOIN events e ON e.id = p.event_id "
        "WHERE p.source_id IS NOT NULL AND p.has_people IS NULL "
        "AND (e.starts_at >= datetime('now','-6 days') "
        "OR p.created_at >= datetime('now','-1 day')) "
        "ORDER BY p.id"
    )
    out = sql(q)
    rows = []
    for line in out.strip().splitlines():
        if "|" in line:
            pid, fn = line.split("|", 1)
            rows.append((int(pid), fn.strip()))
    return rows


def check_photo(filename):
    url = f"https://joinaroo.com/api/uploads/{filename}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = resp.read()
        ctype = resp.headers.get_content_type() or "image/jpeg"
    b64 = base64.b64encode(data).decode()
    body = {
        "model": "muse-spark-1.3-contributor",
        "max_tokens": 4000,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": PROMPT},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{ctype};base64,{b64}"},
                    },
                ],
            }
        ],
    }
    status, resp = meta_api.call("POST", "/chat/completions", body)
    if status != 200:
        return None, 0
    usage = resp.get("usage", {})
    tokens = usage.get("total_tokens", 0)
    text = ""
    for choice in resp.get("choices", []):
        text += choice.get("message", {}).get("content") or ""
    text = text.strip().upper()
    if text.startswith("YES"):
        return 1, tokens
    if text.startswith("NO"):
        return 0, tokens
    return None, tokens


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true",
                    help="print planned UPDATEs without writing (no backup taken)")
    args = ap.parse_args()
    rows = fetch_candidates()
    print(f"candidates: {len(rows)}", flush=True)
    if rows and not args.dry_run:
        backup_db()
    stamped = 0
    planned = 0
    yes = 0
    total_tokens = 0
    failed = 0
    for pid, fn in rows:
        try:
            verdict, tokens = check_photo(fn)
        except Exception as e:  # noqa: BLE001
            print(f"  id {pid} ({fn}): ERROR {e}", flush=True)
            verdict, tokens = None, 0
        total_tokens += tokens
        if verdict is None:
            failed += 1
            continue
        stmt = f"UPDATE event_photos SET has_people={verdict} WHERE id={pid};"
        if args.dry_run:
            planned += 1
            yes += verdict
            print(f"  id {pid}: WOULD STAMP {stmt}", flush=True)
            continue
        # Commit each verdict immediately — the peephole reads the DB
        # live, and a long run must not hold the gate shut until the end.
        # sql() raises on failure: abort loudly rather than count a
        # write that never landed.
        try:
            sql(f".timeout 60000\n{stmt}\n", stdin_mode=True)
        except Exception as e:  # noqa: BLE001
            print(f"  id {pid}: WRITE FAILED — ABORTING: {e}", flush=True)
            sys.exit(1)
        stamped += 1
        yes += verdict
        print(f"  id {pid}: {'PEOPLE' if verdict else 'no-people'}", flush=True)
    if args.dry_run:
        print(
            f"SUMMARY dry_run planned={planned} people={yes} "
            f"no_people={planned - yes} failed={failed} tokens={total_tokens}"
        )
    else:
        print(
            f"SUMMARY stamped={stamped} people={yes} no_people={stamped - yes} "
            f"failed={failed} tokens={total_tokens}"
        )


if __name__ == "__main__":
    main()
