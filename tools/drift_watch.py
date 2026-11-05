#!/usr/bin/env python3
"""Listing drift watch — deterministic diff + Meta Model API arbitration.

Compares a FRESH listing extraction (sweep_extract.py output) against the
production catalog for one source and flags drift: times that moved,
costs that changed, and — the high-value case — upcoming events that have
vanished from their own listing (possible cancellations). Flags only;
nothing is edited. In production the sweep runs this per extracted source
with yesterday's catalog state as the baseline.

Usage:
  drift_watch.py --fresh <events-muse-spark-1.3-contributor.json> --prod <events.tsv> \
      --venue-filter "SPACE" --today 2026-10-27 --out <dir>
"""
import argparse, itertools, json, os, re, sys

sys.path.insert(0, os.path.expanduser("~/workspace/custom-connectors/custom.meta-model-api/bin"))
import meta_api  # noqa: E402

STOP = {"the", "at", "a", "an", "of", "and", "with", "in", "on", "for", "to"}


def toks(s):
    return {t for t in re.split(r"[^a-z0-9]+", (s or "").lower()) if t and t not in STOP}


def jac(a, b):
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


SYSTEM = """You arbitrate drift candidates between a fresh event listing extraction and a production events catalog. Answer with ONLY a JSON array, one object per item, in order: {"item": <index>, "verdict": ..., "evidence": "<one short sentence citing the decisive facts>"}

For "pair" items (a catalog record and a listing record that may be the same event), verdict is one of:
- "same_changed": same event, and a material field differs (start time, date, cost) — name the field in evidence.
- "same_unchanged": same event, no material difference.
- "different": not the same event.

For "vanished" items (an upcoming catalog record whose venue matches this source but which has NO counterpart in the fresh listing — the listing's titles are provided), verdict is one of:
- "likely_removed": no plausible counterpart in the listing; the event appears to have been removed or cancelled from its own listing.
- "counterpart_exists": a listing title plausibly IS this event under different wording — name it.
- "not_this_listing": the event likely never belonged to this listing page (different series, off-site venue, or a one-off the listing does not carry).
Judge only from the records given; do not invent facts."""


def call_batch(model, items):
    lines = []
    for i, it in enumerate(items):
        lines.append(f"ITEM {i} [{it['type']}]\n{json.dumps(it['payload'])}")
    body = {"model": model, "temperature": 0, "max_tokens": 8000,
            "messages": [{"role": "system", "content": SYSTEM},
                         {"role": "user", "content": "\n\n".join(lines)}]}
    status, payload = meta_api.call("POST", "/chat/completions", body)
    if status != 200:
        return None, payload
    content = (payload["choices"][0]["message"].get("content") or "").strip()
    if not content or "[" not in content:
        return None, {"empty_content": True}
    try:
        return json.loads(content[content.find("["):content.rfind("]") + 1]), payload.get("usage", {})
    except Exception:
        return None, {"unparseable_content": True}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fresh", required=True)
    ap.add_argument("--prod", required=True)
    ap.add_argument("--venue-filter", required=True)
    ap.add_argument("--today", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--model", default="muse-spark-1.3-contributor")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    fresh = json.load(open(args.fresh))
    prod = []
    for line in open(args.prod, encoding="utf-8"):
        p = line.rstrip("\n").split("\t")
        if len(p) >= 6:
            prod.append({"id": int(p[0]), "title": p[1], "starts_at": p[2],
                         "venue": p[4], "city": p[5]})

    matched, changed, used_prod = [], [], set()
    fresh_left = []
    for f in fresh:
        best, best_j = None, 0.0
        for pr in prod:
            if pr["id"] in used_prod or pr["starts_at"][:10] != f["starts_at"][:10]:
                continue
            j = jac(toks(f["title"]), toks(pr["title"]))
            if j > best_j:
                best, best_j = pr, j
        if best is not None and best_j >= 0.75:
            used_prod.add(best["id"])
            diffs = []
            if f["starts_at"] != best["starts_at"]:
                diffs.append(f"starts_at listing={f['starts_at']} catalog={best['starts_at']}")
            matched.append({"fresh": f["title"], "prod_id": best["id"], "jaccard": round(best_j, 2)})
            if diffs:
                changed.append({"fresh": f["title"], "prod_id": best["id"], "diffs": diffs})
        else:
            fresh_left.append(f)

    items = []
    # fuzzy pairs: unmatched fresh vs unmatched prod with title overlap
    paired_prod = set()
    for f in fresh_left:
        cands = []
        for pr in prod:
            if pr["id"] in used_prod or pr["id"] in paired_prod:
                continue
            j = jac(toks(f["title"]), toks(pr["title"]))
            if j >= 0.4:
                cands.append((j, pr))
        if cands:
            cands.sort(reverse=True)
            j, pr = cands[0]
            paired_prod.add(pr["id"])
            items.append({"type": "pair", "payload": {
                "catalog": {"id": pr["id"], "title": pr["title"], "starts_at": pr["starts_at"], "venue": pr["venue"]},
                "listing": {"title": f["title"], "starts_at": f["starts_at"], "cost_text": f.get("cost_text")},
                "title_jaccard": round(j, 2)}})
    appeared = [f["title"] for f in fresh_left
                if not any(it["type"] == "pair" and it["payload"]["listing"]["title"] == f["title"] for it in items)]

    # vanished: upcoming catalog rows at this venue, unused and unpaired
    fresh_titles = [f["title"] for f in fresh]
    # Word-boundary venue match: a plain substring filter false-hits
    # "Makerspace"/"BookSpace" for the filter "SPACE" (pilot, Oct 27).
    venue_re = re.compile(r"\b" + re.escape(args.venue_filter) + r"\b", re.I)
    vanished = [pr for pr in prod
                if venue_re.search(pr["venue"])
                and pr["starts_at"][:10] >= args.today
                and pr["id"] not in used_prod and pr["id"] not in paired_prod]
    for pr in vanished:
        items.append({"type": "vanished", "payload": {
            "catalog": {"id": pr["id"], "title": pr["title"], "starts_at": pr["starts_at"], "venue": pr["venue"]},
            "listing_titles": fresh_titles}})

    totals = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
    verdicts = []
    for s in range(0, len(items), 8):
        batch = items[s:s + 8]
        out, usage = call_batch(args.model, batch)
        if out is None:
            print(f"batch at {s} FAILED: {json.dumps(usage)[:160]}")
            continue
        if isinstance(usage, dict):
            for k in totals:
                totals[k] += usage.get(k, 0)
        by_idx = {o["item"]: o for o in out}
        for i, it in enumerate(batch):
            o = by_idx.get(i, {})
            verdicts.append({**it, "verdict": o.get("verdict"), "evidence": o.get("evidence")})

    report = {"matched": matched, "changed_deterministic": changed, "appeared": appeared,
              "vanished_candidates": [v["id"] for v in vanished],
              "verdicts": verdicts, "token_totals": totals}
    json.dump(report, open(os.path.join(args.out, "drift.json"), "w"), indent=1)
    print(f"matched {len(matched)} | changed {len(changed)} | appeared {len(appeared)} | "
          f"vanished candidates {len(vanished)} | model items {len(items)}")
    for v in verdicts:
        print(f"  [{v['type']}] {v['verdict']}: {v['evidence']}")
    print("tokens:", totals)


if __name__ == "__main__":
    raise SystemExit(main())
