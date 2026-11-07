#!/usr/bin/env python3
"""Category audit: check every event's category against its title and
description with muse-spark-1.3-contributor and flag CLEAR mismatches only.

Sibling of dupe_flag.py (built Oct 27, 2026, Angelo's pick). The class it
hunts: early sweeps miscategorized by start time (an afternoon concert
tagged after-dark) and similar what-it-is errors. Flags only — categories
are changed by Angelo's batches, never here.

Usage:
  python3 category_audit.py --data <dir with events.tsv> --out <run dir>
      [--model muse-spark-1.3-contributor] [--workers 4] [--batch 10]

events.tsv columns: id, title, category_slug, starts_at, venue, description.
Exit code 2 = halted on a Meta API 429 (progress preserved; rerun resumes).
"""
import argparse, json, os, sys, threading
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.expanduser("~/workspace/custom-connectors/custom.meta-model-api/bin"))
from meta_api import call as meta_call  # noqa: E402

SYSTEM = """You audit event categories for Joinaroo, a Maine events guide. You get a batch of events, each with its CURRENT category, title, venue, start time, and description. For each event decide whether the current category is clearly wrong.

THE 12 CATEGORIES:
- after-dark: nightlife — club nights, DJ/dance parties, late-night 21+ social events, burlesque, drag shows. NOT ordinary concerts.
- bar-brain: trivia, pub quizzes, bar bingo, karaoke nights — mental/social bar games, wherever held (libraries included).
- on-stage: live performance — concerts, theatre, plays, musicals, comedy shows, dance performances.
- hack-build: tech meetups, coding events, hackathons, maker/build events.
- game-on: playing games socially — video gaming, esports watch/play parties, board-game nights, chess, cribbage, cornhole leagues.
- taste-maine: food & drink centered — tastings, food festivals, cooking classes, beer/wine events, supper clubs.
- town-square: community/civic life — farmers/craft/artisan markets, town events, parades, fundraisers, community gatherings.
- family-fun: aimed at kids/families — storytimes, children's activities, family movies, trunk-or-treat, touch-a-truck.
- game-day: organized sports — school/college/pro games and matches, road races, fishing tournaments. Playing or watching AS SPORT.
- seasonal: holiday/season-tied — Halloween parties and haunted attractions, Christmas/holiday events, seasonal festivals.
- learn: lectures, talks, classes, workshops, author readings, panels, educational programs, films/screenings (unless aimed at kids/families — then family-fun), planetarium shows. (Category mapping aligned with feed_extract.py and sweep_extract.py, Nov 6 2026.)
- gallery: visual art — exhibitions, gallery openings, museum exhibits, art shows and receptions.

DECISION RULES:
1. Categorize by what the event IS. Start time NEVER decides — an afternoon concert is on-stage, not after-dark; a 7 PM lecture is learn.
2. Holiday-themed beats everything: a Halloween party is seasonal even at a bar; a Christmas market is seasonal, not town-square.
3. A performance is on-stage even if it happens in a bar or at night.
4. Trivia/quiz is bar-brain wherever it is held. Bingo at a bar is bar-brain; bingo as a community fundraiser is town-square.
5. Markets are town-square unless holiday-themed (seasonal) or art-only (gallery).
6. CONSERVATIVE: verdict "change" ONLY for a clear mismatch. If two categories are defensible, or the description is too thin to tell, verdict "keep".

Answer with ONLY a JSON object, no prose:
{"results": [{"id": <event id>, "verdict": "keep"|"change", "suggested": "<slug when change, else null>", "evidence": "<= 25 words"}]}
Return one result per event in the batch, ids exactly as given."""


class Halt(Exception):
    pass


def atomic_json_dump(obj, path, **kw):
    """Write JSON via temp file + os.replace so a killed run never
    leaves a truncated file behind."""
    tmp = path + ".tmp"
    with open(tmp, "w") as fh:
        json.dump(obj, fh, **kw)
        fh.flush()
        os.fsync(fh.fileno())
    os.replace(tmp, path)


def read_tsv(path, ncols):
    rows = []
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            parts = line.rstrip("\n").split("\t")
            if len(parts) < ncols:
                parts += [""] * (ncols - len(parts))
            rows.append(parts[:ncols])
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--model", default="muse-spark-1.3-contributor")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--batch", type=int, default=10)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    events = [{"id": int(r[0]), "title": r[1], "category": r[2], "starts_at": r[3],
               "venue": r[4], "description": (r[5] or "")[:240]}
              for r in read_tsv(os.path.join(args.data, "events.tsv"), 6)]
    progress_path = os.path.join(args.out, "verdicts.jsonl")
    done = {}
    if os.path.exists(progress_path):
        for line in open(progress_path, encoding="utf-8"):
            try:
                rec = json.loads(line)
                done[rec["id"]] = rec
            except Exception:
                pass
    todo = [e for e in events if e["id"] not in done]
    batches = [todo[i:i + args.batch] for i in range(0, len(todo), args.batch)]
    print(f"events {len(events)} | already verdicted {len(done)} | batches to run {len(batches)}", flush=True)
    lock = threading.Lock()
    state = {"halt": False, "tokens": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}}
    out = open(progress_path, "a", encoding="utf-8")

    def work(batch):
        if state["halt"]:
            return
        lines = []
        for e in batch:
            lines.append(f'Event {e["id"]}: current={e["category"]} | start={e["starts_at"][:16]} | venue={e["venue"]} | title={e["title"]} | description={e["description"]}')
        # Reasoning tokens count against max_tokens: a 3000 cap let Spark
        # spend the whole budget reasoning and emit nothing (finish=length,
        # content=None) — 60 batches skipped for exactly this. 12000 is the
        # floor that worked for the other tools.
        body = {"model": args.model, "max_tokens": 12000,
                "messages": [{"role": "system", "content": SYSTEM},
                             {"role": "user", "content": "Audit these events:\n" + "\n".join(lines)}]}
        status, data = meta_call("POST", "/chat/completions", body)
        if status == 429:
            state["halt"] = True
            raise Halt("429")
        if status != 200:
            raise RuntimeError(f"meta api {status}: {str(data)[:200]}")
        usage = data.get("usage") or {}
        try:
            content = data["choices"][0]["message"].get("content") or ""
            parsed = json.loads(content[content.index("{"):content.rindex("}") + 1])
            results = parsed["results"]
            by_id = {e["id"]: e for e in batch}
            recs = []
            for res in results:
                eid = int(res["id"])
                if eid not in by_id:
                    continue
                recs.append({"id": eid, "current": by_id[eid]["category"],
                             "verdict": res.get("verdict"), "suggested": res.get("suggested"),
                             "evidence": res.get("evidence", "")})
        except Exception as exc:
            print(f"  batch skipped (unparseable response: {exc}); rerun resumes it", flush=True)
            return
        with lock:
            for rec in recs:
                out.write(json.dumps(rec) + "\n")
                done[rec["id"]] = rec
            out.flush()
            for k in state["tokens"]:
                state["tokens"][k] += int(usage.get(k, 0) or 0)
        print(f"  batch done ({len(done)}/{len(events)})", flush=True)

    try:
        with ThreadPoolExecutor(max_workers=args.workers) as ex:
            list(ex.map(work, batches))
    except Halt:
        print("HALTED on 429 — progress saved, rerun to resume", flush=True)
        out.close()
        sys.exit(2)
    out.close()
    changes = [r for r in done.values() if r["verdict"] == "change"]
    flags = {"changes": sorted(changes, key=lambda r: (r["current"], r["suggested"] or "", r["id"])),
             "checked": len(done), "total_events": len(events), "token_totals": state["tokens"]}
    atomic_json_dump(flags, os.path.join(args.out, "flags.json"), indent=1)
    print(f"changes: {len(changes)} | checked: {len(done)}/{len(events)} | tokens: {state['tokens']}")


if __name__ == "__main__":
    main()
