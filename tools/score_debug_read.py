#!/usr/bin/env python3
"""Score-debug capture reader: a flag-only Meta read of the score
poller's debug captures (/opt/smevents/api/score-debug/ on the box).

The SIDEARM-fed listings are finals-verified only — their IN-GAME page
format has never been observed. When an in-window game produces no
parsed final, the poller drops the page header there. This tool reads
those captures and answers: is there a scoreboard in this page, what
does it say, and what would a parser need to read it live? It edits
nothing; parser changes stay Angelo's call, made by hand.

Usage:
  score_debug_read.py --dir <captures dir> --out <run dir>
      [--context <json: filename -> {event_id, title}>]
Reads every .html/.htm/.txt/.json file in the dir.
"""
import argparse, html, json, os, re, sys

sys.path.insert(0, os.path.expanduser("~/workspace/custom-connectors/custom.meta-model-api/bin"))
import meta_api  # noqa: E402

SYSTEM = """You read raw page captures saved by a sports score poller that could not parse a score from them. For each capture, report what a scoreboard in the page says and how it is represented.

For each capture return:
- scoreboard_found: true if the page contains a score for the game (live, final, or scheduled with no score yet — say which).
- home_team / away_team: as printed, or null.
- home_score / away_score: integers, or null if not present.
- status_text: the period / clock / FINAL / scheduled text near the score, verbatim, or null.
- evidence: one short verbatim quote containing the score.
- parser_notes: <= 30 words on WHERE the score lives in the markup/text (element class, table shape, JSON blob, ordering) — what a regex or DOM parser would key on. If text was stripped before you saw it, say what the visible text structure implies.

Judge only from the capture text given. Do not invent scores.

Answer with ONLY a JSON object:
{"results": [{"file": "<filename>", "scoreboard_found": true|false, "home_team": ..., "away_team": ..., "home_score": ..., "away_score": ..., "status_text": ..., "evidence": "...", "parser_notes": "..."}]}"""


def strip_markup(raw):
    raw = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", raw)
    text = re.sub(r"(?s)<[^>]+>", "\n", raw)
    text = html.unescape(text)
    lines = [ln.strip() for ln in text.splitlines()]
    return "\n".join(ln for ln in lines if ln)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--context", default=None)
    ap.add_argument("--model", default="muse-spark-1.3")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    context = json.load(open(args.context)) if args.context else {}
    files = sorted(f for f in os.listdir(args.dir) if f.lower().endswith((".html", ".htm", ".txt", ".json")))
    results, tokens = [], {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
    for s in range(0, len(files), 4):
        batch = files[s:s + 4]
        parts = []
        for f in batch:
            raw = open(os.path.join(args.dir, f), encoding="utf-8", errors="ignore").read()
            text = strip_markup(raw)[:9000]
            ctx = context.get(f, {})
            parts.append(f"FILE {f} (event: {ctx.get('title', 'unknown')})\n{text}")
        body = {"model": args.model, "max_tokens": 12000,
                "messages": [{"role": "system", "content": SYSTEM},
                             {"role": "user", "content": "Read these captures:\n\n" + "\n\n=====\n\n".join(parts)}]}
        status, payload = meta_api.call("POST", "/chat/completions", body)
        if status == 429:
            print("HALTED on 429", flush=True)
            break
        if status != 200:
            print(f"batch at {s}: api {status}", flush=True)
            continue
        usage = payload.get("usage") or {}
        for k in tokens:
            tokens[k] += int(usage.get(k, 0) or 0)
        content = payload["choices"][0]["message"].get("content") or ""
        try:
            results.extend(json.loads(content[content.index("{"):content.rindex("}") + 1])["results"])
        except Exception as exc:
            print(f"batch at {s}: unparseable ({exc})", flush=True)
    with open(os.path.join(args.out, "reads.json"), "w") as fh:
        json.dump({"results": results, "token_totals": tokens}, fh, indent=1)
    print(f"done: {len(results)} captures read of {len(files)} | tokens: {tokens}")


if __name__ == "__main__":
    main()
