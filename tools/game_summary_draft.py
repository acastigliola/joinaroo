#!/usr/bin/env python3
"""Game summary drafting — Meta Model API.

Drafts the events.game_summary JSON block (records strip, note panel,
What's Next panel) for a finished game from ONE source page — a recap,
a standings/schedule page, or a tournament bracket release — plus the
facts the operator already established (teams, mascots, final score).

The hand-built blocks for events 918 / 460 / 2591 / 2675 (Oct 2026) are
the shape reference; this tool drafts that shape mechanically so the
per-game hand work stops. Logos are NEVER invented: the model may only
pick basenames from the operator-supplied library list (--logos), else
null. Numbers are validated: a records W-L mark counts only when the
source states it as a post-game record ("moved to / improved to / now
stands at / falls to"), and note-body numbers must literally appear
in the source text or the supplied score — a field that fails
validation is dropped, never the draft.

Usage:
  game_summary_draft.py --url <source page> --home "Southern Maine" \
      --away "Plymouth State" --home-mascot HUSKIES --away-mascot PANTHERS \
      --score "2 - 1" --logos logo-huskies-profile.png,logo-panthers.png \
      --models muse-spark-1.3-contributor --out <dir>
  (or --file <text file> instead of --url)

Writes summary-<model>.json + report.json into <dir>.
Exit 2 on Meta API rate limit (house convention).
"""
import argparse, json, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sweep_extract import fetch, clean_html  # noqa: E402
sys.path.insert(0, os.path.expanduser("~/workspace/custom-connectors/custom.meta-model-api/bin"))
import meta_api  # noqa: E402

SYSTEM = """You draft the game_summary block for ONE finished game in the Joinaroo events database, from the source text supplied. Return ONLY a JSON object — no prose, no code fences — with exactly this shape:
{"records": [{"label": str, "value": str, "sub": str}] | null,
 "note": {"title": str, "body": str} | null,
 "next": {"title": "What's Next", "subtitle": str, "rows": [{"stage": str, "date": str, "time": str, "place": str, "detail": str, "badge": str|null}]} | null,
 "home_logo": str|null, "away_logo": str|null, "records_logo": str|null, "rail_logo": str|null}

Rules:
- Extract ONLY from the source text and the operator facts in the task. Invent nothing.
- "records": the HOME team's season record first, then its conference record, POST-GAME — i.e. AFTER this result is counted. Sources often print the PRE-game record in a matchup line ("Maine (7-8, 2-2) hosts Vermont") and the post-game mark in the body ("the victory moved Maine to 3-2 in conference play"). ALWAYS use the post-game mark: prefer explicit post-game statements ("moved to", "improved to", "now stands at"); never copy the pre-game matchup line; if the source states ONLY a pre-game record and never updates it, return records null rather than the stale line. label like "USM SEASON RECORD" or "MAINE SEASON RECORD" (home team short name + SEASON RECORD), conference label = the conference name in caps. value format "W - L" or "W - L - T" exactly as the source supports. sub: "Wins Losses" or "Wins Losses Ties" to match. Null when the source states no records.
- "note": only when the source supports a real milestone (title clinched, seed earned, season complete, streak, first/only facts the source states). title short (under 6 words). body 1-3 sentences built ONLY from source facts. Null when nothing notable is sourced — never manufacture a storyline.
- "next": only when the source states what comes next for the home team (tournament rounds, next fixture). Rows in playing order; stage as named ("Quarterfinal", "Semifinal (if advance)"); date in the form "Sat, Oct 31, 2026" using the year the source supports; time as printed or "Time TBA"; place as printed (venue · city) or "At higher seed"; detail = opponent or "Opponent TBA" / "Location TBA"; badge "UP NEXT" on the first row only, null elsewhere. subtitle = the competition name (e.g. "Little East Conference Tournament"). Null when the source names no next step (e.g. season over with no tournament).
- Logos: pick ONLY from the allowed logo basenames given in the task, choosing the file that depicts each team's mascot; home_logo/away_logo are the score-header logos, records_logo the records-strip logo, rail_logo the rail logo (may repeat the header choice). Null for any slot you cannot match confidently from the list. NEVER output a filename not in the list.
- Maine is America/New_York. Dates in the source are authoritative — copy them exactly; do not shift days or years."""


def numbers_in(text):
    return set(re.findall(r"\d+(?:\.\d+)?", text or ""))


def atomic_json_dump(obj, path, **kw):
    """Write JSON via temp file + os.replace so a killed run never
    leaves a truncated file behind."""
    tmp = path + ".tmp"
    with open(tmp, "w") as fh:
        json.dump(obj, fh, **kw)
        fh.flush()
        os.fsync(fh.fileno())
    os.replace(tmp, path)


RECORD_CONTEXT = re.compile(
    r"(?:(?:moved|moves|improved|improves|falls|fell) to|now stands at)\s+"
    r"(\d+)\s*-\s*(\d+)(?:\s*-\s*(\d+))?", re.I)


def context_record_marks(source_text):
    """W-L(-T) marks the source states as a POST-GAME record ('moved
    to 10-2'). Only these validate a drafted record — a mark appearing
    anywhere else in the text (pre-game matchup lines, dates, stat
    lines) proves nothing."""
    marks = set()
    for m in RECORD_CONTEXT.finditer(source_text or ""):
        marks.add("-".join(g for g in m.groups() if g is not None))
    return marks


def validate(draft, source_text, score, logos_allowed):
    """Drop fields whose numbers are not in the source/score; null bad logos."""
    allowed_numbers = numbers_in(source_text) | numbers_in(score or "")
    issues = []
    if draft.get("records"):
        ctx_marks = context_record_marks(source_text)
        kept = []
        for r in draft["records"]:
            mark = re.sub(r"\s+", "", r.get("value", ""))
            if mark and mark in ctx_marks:
                kept.append(r)
            else:
                issues.append(f"records '{r.get('label')}' value '{r.get('value')}' not stated in a post-game context (moved to / improved to / now stands at / falls to) — dropped, human check")
        draft["records"] = kept or None
    if draft.get("note"):
        bad = numbers_in(draft["note"].get("body", "")) - allowed_numbers
        if bad:
            issues.append(f"note body has unsourced numbers {sorted(bad)} — dropped")
            draft["note"] = None
    for slot in ("home_logo", "away_logo", "records_logo", "rail_logo"):
        v = draft.get(slot)
        if v is not None and v not in logos_allowed:
            issues.append(f"{slot} '{v}' not in allowed library — nulled")
            draft[slot] = None
    # Consistency: if the note body states a W-L mark that contradicts a
    # records value, the records are likely the stale pre-game line.
    if draft.get("note") and draft.get("records"):
        def norm(s):
            return re.sub(r"\s+", "", s or "")
        note_marks = {norm(m) for m in re.findall(r"\d+\s*-\s*\d+(?:\s*-\s*\d+)?", draft["note"].get("body", ""))}
        if score:
            note_marks.discard(norm(score))
        rec_marks = {norm(r.get("value", "")) for r in draft["records"]}
        clash = {m for m in note_marks if m not in rec_marks}
        if clash:
            issues.append(f"note states record mark(s) {sorted(clash)} not in records values — possible stale pre-game line, operator check")
    return draft, issues


def assemble(draft, home, away, home_mascot, away_mascot):
    def logo_path(b):
        return f"/icons/games/{b}" if b else None
    out = {
        "home": {"name": home, "mascot": home_mascot, "logo": logo_path(draft.get("home_logo"))},
        "away": {"name": away, "mascot": away_mascot, "logo": logo_path(draft.get("away_logo"))},
    }
    if draft.get("records_logo"):
        out["records_logo"] = logo_path(draft["records_logo"])
    if draft.get("records"):
        out["records"] = draft["records"]
    if draft.get("note"):
        out["note"] = draft["note"]
    if draft.get("next"):
        out["next"] = draft["next"]
    if draft.get("rail_logo"):
        out["rail_logo"] = logo_path(draft["rail_logo"])
    return out


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
    ap.add_argument("--url")
    ap.add_argument("--file")
    ap.add_argument("--home", required=True)
    ap.add_argument("--away", required=True)
    ap.add_argument("--home-mascot")
    ap.add_argument("--away-mascot")
    ap.add_argument("--score", help='final score, home - away, e.g. "2 - 1"')
    ap.add_argument("--logos", default="", help="comma-separated allowed logo basenames")
    ap.add_argument("--models", default="muse-spark-1.3-contributor")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    if args.url:
        raw = fetch(args.url)
        text = clean_html(raw)
        with open(os.path.join(args.out, "source.html"), "w") as f:
            f.write(raw)
    else:
        text = open(args.file).read()
    with open(os.path.join(args.out, "input.txt"), "w") as f:
        f.write(text)

    logos_allowed = [s.strip() for s in args.logos.split(",") if s.strip()]
    task = (
        f"OPERATOR FACTS: home team {args.home} (mascot {args.home_mascot or 'unknown'}), "
        f"away team {args.away} (mascot {args.away_mascot or 'unknown'}), "
        f"final score home - away: {args.score or 'not supplied'}.\n"
        f"ALLOWED LOGO BASENAMES: {', '.join(logos_allowed) or '(none — all logo slots null)'}\n\n"
        f"SOURCE TEXT:\n{text[:60000]}"
    )

    totals = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
    report = {"models": {}, "usage": totals}
    for model in [m.strip() for m in args.models.split(",") if m.strip()]:
        body = {"model": model, "temperature": 0, "max_tokens": 16000,
                "messages": [{"role": "system", "content": SYSTEM},
                             {"role": "user", "content": task}]}
        status, payload = meta_api.call("POST", "/chat/completions", body)
        if status == 429 or (status != 200 and "rate" in json.dumps(payload).lower()):
            print("RATE LIMIT — HALTING")
            return 2
        if status != 200:
            report["models"][model] = {"error": f"HTTP {status}"}
            continue
        u = payload.get("usage", {})
        for k in totals:
            totals[k] += u.get(k, 0)
        choice = payload["choices"][0]
        content = (choice["message"].get("content") or "").strip()
        if not content:
            report["models"][model] = {
                "error": "empty content",
                "finish_reason": choice.get("finish_reason"),
                "usage": u,
            }
            continue
        draft = parse_json(content)
        if draft is None:
            report["models"][model] = {"error": "unparseable JSON"}
            continue
        draft, issues = validate(draft, text, args.score, logos_allowed)
        summary = assemble(draft, args.home, args.away, args.home_mascot, args.away_mascot)
        name = f"summary-{model}.json"
        atomic_json_dump(summary, os.path.join(args.out, name), indent=1)
        report["models"][model] = {"file": name, "issues": issues}
        print(f"{model}: wrote {name}; issues: {issues or 'none'}")
    atomic_json_dump(report, os.path.join(args.out, "report.json"), indent=1)
    print("usage:", totals)
    return 0


if __name__ == "__main__":
    sys.exit(main())
