#!/usr/bin/env python3
"""Dupe flagging — deterministic blocking + Meta Model API verdicts.

Mines a prod snapshot (events / venues / photo_sources TSVs) for candidate
duplicate pairs with cheap token-similarity blocking, then asks
muse-spark-1.3-contributor to verdict each pair: same entity or not, with evidence.
Flags only — this tool never merges, edits, or deletes anything.

Usage:
  dupe_flag.py --data <dir with events.tsv venues.tsv sources.tsv> --out <dir>

Writes candidates.json (blocked pairs), verdicts.jsonl (resumable), and
flags.json (same-verdict pairs with evidence) into <out>.
"""
import argparse, itertools, json, os, re, sys

sys.path.insert(0, os.path.expanduser("~/workspace/custom-connectors/custom.meta-model-api/bin"))
import meta_api  # noqa: E402

STOP = {"the", "at", "a", "an", "of", "and", "with", "in", "on", "for", "to"}


ABBREV = {"oob": ("old", "orchard", "beach"), "umaine": ("university", "maine")}


def toks(s):
    out = {t for t in re.split(r"[^a-z0-9]+", (s or "").lower()) if t and t not in STOP}
    for ab, expansion in ABBREV.items():
        if ab in out:
            out |= set(expansion)
    return out


def jac(a, b):
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def read_tsv(path, ncols):
    rows = []
    for line in open(path, encoding="utf-8"):
        parts = line.rstrip("\n").split("\t")
        if len(parts) < ncols:
            parts += [""] * (ncols - len(parts))
        rows.append(parts[:ncols])
    return rows


def block_events(events):
    by_date = {}
    for e in events:
        by_date.setdefault(e["starts_at"][:10], []).append(e)
    pairs = []
    for date, group in by_date.items():
        thr = 0.6 if len(group) > 120 else 0.45
        for x, y in itertools.combinations(group, 2):
            tx, ty = toks(x["title"]), toks(y["title"])
            j = jac(tx, ty)
            small, large = (tx, ty) if len(tx) <= len(ty) else (ty, tx)
            subset = bool(small) and small <= large and (len(small) == 1 or j >= 0.3)
            if j >= thr or subset:
                pairs.append({"kind": "event", "a": x, "b": y, "jaccard": round(j, 2)})
    return pairs


def block_venues(venues):
    pairs = []
    for x, y in itertools.combinations(venues, 2):
        if x["city"].lower().strip() != y["city"].lower().strip():
            continue
        tx, ty = toks(x["name"]), toks(y["name"])
        j = jac(tx, ty)
        if j >= 0.5 or (tx and ty and (tx <= ty or ty <= tx)):
            pairs.append({"kind": "venue", "a": x, "b": y, "jaccard": round(j, 2)})
    return pairs


def block_sources(sources):
    pairs = []
    for x, y in itertools.combinations(sources, 2):
        j = jac(toks(x["name"]), toks(y["name"]))
        shared = (x["ig"] and x["ig"] == y["ig"]) or (x["fb"] and x["fb"] == y["fb"])
        if j >= 0.8 or shared:
            pairs.append({"kind": "source", "a": x, "b": y, "jaccard": round(j, 2)})
    return pairs


SYSTEM = """You judge candidate duplicate pairs for a local events database. For each pair, decide whether the two records represent the SAME real-world entity. Answer with ONLY a JSON array, one object per pair, in order: {"pair": <index>, "verdict": "same"|"different"|"unsure", "evidence": "<the decisive matching or differing facts, one short sentence>", "note": "<for 'same': what a human should check before merging — e.g. which record carries photos/saves, or that a split is an intentional per-post credit split; else empty>"}

Rules:
- EVENTS: same event = same act/program, same date, same venue (title wording may differ). Occurrences of a recurring series on DIFFERENT dates are different events. Two records of the same game/show on the same date at the same venue are the same event even if one title is fuller. Different acts sharing a bill on the same night at the same venue are one event if both records describe the whole bill; different if each names a different single act.
- VENUES: same building/place under variant names is "same" (e.g. an arena name with and without 'Sports'). A field/stadium and an arena with similar names are different venues if they are different facilities.
- PHOTO SOURCES: same person/organization under variant or repeated rows is "same" — including per-post splits of one fan (note that the split looks per-post); an organization and a person's personal account are different."""


def verdict_batch(model, batch):
    lines = []
    for i, p in enumerate(batch):
        lines.append(f"PAIR {i} [{p['kind']}] title-jaccard {p['jaccard']}\nA: {json.dumps(p['a'])}\nB: {json.dumps(p['b'])}")
    body = {"model": model, "temperature": 0, "max_tokens": 8000,
            "messages": [{"role": "system", "content": SYSTEM},
                         {"role": "user", "content": "\n\n".join(lines)}]}
    status, payload = meta_api.call("POST", "/chat/completions", body)
    if status == 429:
        return None, payload
    if status != 200:
        return None, payload
    content = (payload["choices"][0]["message"].get("content") or "").strip()
    if not content or "[" not in content:
        return None, {"empty_content": True}
    content = content[content.find("["):content.rfind("]") + 1]
    try:
        return (json.loads(content), payload.get("usage", {}))
    except Exception:
        return None, {"unparseable_content": True}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--model", default="muse-spark-1.3-contributor")
    ap.add_argument("--batch", type=int, default=8)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    events = [{"id": int(r[0]), "title": r[1], "starts_at": r[2],
               "venue_id": r[3], "venue": r[4], "city": r[5]}
              for r in read_tsv(os.path.join(args.data, "events.tsv"), 6)]
    venues = [{"id": int(r[0]), "name": r[1], "city": r[2], "address": r[3]}
              for r in read_tsv(os.path.join(args.data, "venues.tsv"), 4)]
    sources = [{"id": int(r[0]), "name": r[1], "business": r[2], "ig": r[3], "fb": r[4]}
               for r in read_tsv(os.path.join(args.data, "sources.tsv"), 6)]

    pairs = block_events(events) + block_venues(venues) + block_sources(sources)
    for i, p in enumerate(pairs):
        p["pair_id"] = f"{p['kind']}-{p['a']['id']}-{p['b']['id']}"
    json.dump(pairs, open(os.path.join(args.out, "candidates.json"), "w"), indent=1)
    kinds = {}
    for p in pairs:
        kinds[p["kind"]] = kinds.get(p["kind"], 0) + 1
    print(f"candidates: {len(pairs)} {kinds}")

    vpath = os.path.join(args.out, "verdicts.jsonl")
    done = {}
    if os.path.exists(vpath):
        for line in open(vpath):
            try:
                r = json.loads(line)
                done[r["pair_id"]] = r
            except Exception:
                pass
    todo = [p for p in pairs if p["pair_id"] not in done]
    print(f"to verdict: {len(todo)}")
    totals = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
    for s in range(0, len(todo), args.batch):
        batch = todo[s:s + args.batch]
        out, usage = verdict_batch(args.model, batch)
        if out is None:
            print(f"batch at {s}: FAILED {json.dumps(usage)[:200]}")
            if isinstance(usage, dict) and usage.get("error", {}).get("type") == "rate_limit_error":
                print("RATE LIMIT — HALTING"); return 2
            continue
        if isinstance(usage, dict):
            for k in totals:
                totals[k] += usage.get(k, 0)
        by_idx = {o["pair"]: o for o in out}
        with open(vpath, "a") as f:
            for i, p in enumerate(batch):
                o = by_idx.get(i, {})
                rec = {"pair_id": p["pair_id"], "kind": p["kind"],
                       "a_id": p["a"]["id"], "b_id": p["b"]["id"],
                       "verdict": o.get("verdict"), "evidence": o.get("evidence"),
                       "note": o.get("note")}
                f.write(json.dumps(rec) + "\n")
                done[p["pair_id"]] = rec
        print(f"  batch {s // args.batch + 1}: {len(batch)} pairs verdicted")

    flags = [r for r in done.values() if r.get("verdict") == "same"]
    unsure = [r for r in done.values() if r.get("verdict") == "unsure"]
    json.dump({"flags_same": flags, "unsure": unsure, "token_totals": totals},
              open(os.path.join(args.out, "flags.json"), "w"), indent=1)
    print(f"same: {len(flags)} | unsure: {len(unsure)} | tokens: {totals}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
