#!/usr/bin/env python3
"""Grade flyer_read.py output against Wix-JSON ground truth (Geno's 13).

Truth sources: the Wix events JSON pulled from genosrockclub.com/event-list
(title, "formatted" local date/time string, price string, UTC start/end).
Grades: title (key act name present), date (starts_at date), start/end time,
cost (dollar-amount sets equal, only where the JSON carries a price).
BLOODBATH IV is graded on date only for time: its flyer prints 8 PM while the
JSON/page say 7 PM — the reader is print-faithful, so 8 PM is the CORRECT
read of the flyer and the disagreement is the expected, desired output.

Usage: grade_flyers.py <validation-dir> <reader-out-dir>
"""
import json, os, re, sys
from datetime import datetime

MONTHS = {m: i + 1 for i, m in enumerate(
    ["January", "February", "March", "April", "May", "June", "July",
     "August", "September", "October", "November", "December"])}


def truth_from_formatted(fmt, price):
    # "October 27, 2026, 6:00 – 10:00 PM" | "October 31, 2026, 9:00 PM – 1:00 AM"
    m = re.match(r"([A-Za-z]+) (\d+), (\d+), (.+)", (fmt or "").replace(" at ", ", "))
    if not m:
        return None
    mon, day, year, times = m.group(1), int(m.group(2)), int(m.group(3)), m.group(4)
    date = f"{year}-{MONTHS[mon]:02d}-{day:02d}"
    parts = [p.strip() for p in re.split(r"[–-]", times) if p.strip()]
    def t24(t, ref_ampm=None):
        mm = re.match(r"(\d+):(\d+)\s*(AM|PM)?", t)
        if not mm:
            return None
        h, mi, ap = int(mm.group(1)), int(mm.group(2)), mm.group(3) or ref_ampm
        if ap == "PM" and h != 12: h += 12
        if ap == "AM" and h == 12: h = 0
        return f"{h:02d}:{mi:02d}"
    end_ampm = None
    if len(parts) == 2:
        end_ampm = re.search(r"(AM|PM)", parts[1]).group(1) if re.search(r"(AM|PM)", parts[1]) else None
    start = t24(parts[0], end_ampm)
    end = t24(parts[1]) if len(parts) == 2 else None
    amounts = sorted(int(x) for x in re.findall(r"\$(\d+)", price or ""))
    return {"date": date, "start": start, "end": end, "amounts": amounts}


def main():
    vdir, rdir = sys.argv[1], sys.argv[2]
    raw_gt = json.load(open(os.path.join(vdir, "ground-truth-raw.json")))
    report = json.load(open(os.path.join(rdir, "report.json")))
    recs = {r["file"]: r for r in report["records"]}
    rows, score = [], {"title": 0, "date": 0, "start": 0, "end": 0, "cost": 0, "cost_graded": 0}
    for fn, g in sorted(raw_gt.items()):
        truth = truth_from_formatted(g.get("formatted"), g.get("price"))
        rec = recs.get(fn)
        fl = (rec or {}).get("flyer") or {}
        title_words = [w for w in re.split(r"[^A-Za-z0-9]+", (g.get("title") or "").upper()) if len(w) > 2]
        f_title = (fl.get("title") or "").upper()
        title_ok = bool(title_words) and any(w in f_title for w in title_words[:2])
        starts = fl.get("starts_at") or ""
        ends = fl.get("ends_at") or ""
        date_ok = starts[:10] == truth["date"]
        start_ok = starts[11:16] == truth["start"]
        end_ok = (ends[11:16] == truth["end"]) if truth["end"] else None
        cost_amounts = sorted(int(x) for x in re.findall(r"\$(\d+)", fl.get("cost_text") or ""))
        cost_ok = None
        if truth["amounts"]:
            score["cost_graded"] += 1
            cost_ok = cost_amounts == truth["amounts"]
            score["cost"] += bool(cost_ok)
        score["title"] += title_ok
        score["date"] += date_ok
        score["start"] += start_ok
        score["end"] += bool(end_ok)
        rows.append({"file": fn, "truth": truth, "read_starts": starts, "read_ends": ends,
                     "read_cost": fl.get("cost_text"), "title_ok": title_ok, "date_ok": date_ok,
                     "start_ok": start_ok, "end_ok": end_ok, "cost_ok": cost_ok,
                     "recurrence_text": fl.get("recurrence_text"), "age": fl.get("age_restriction")})
    n = len(rows)
    print(f"graded {n} flyers")
    print(f"title {score['title']}/{n} | date {score['date']}/{n} | start {score['start']}/{n} | "
          f"end {score['end']}/{n} | cost {score['cost']}/{score['cost_graded']} graded")
    for r in rows:
        flags = [k for k in ("title_ok", "date_ok", "start_ok", "end_ok", "cost_ok") if r[k] is False]
        print(f"  {r['file'][:52]:52s} {'OK' if not flags else 'CHECK: ' + ','.join(flags)} "
              f"read={r['read_starts']} cost={r['read_cost']!r} rec={r['recurrence_text']!r}")
    json.dump({"score": score, "n": n, "rows": rows},
              open(os.path.join(rdir, "grades.json"), "w"), indent=1)


if __name__ == "__main__":
    raise SystemExit(main())
