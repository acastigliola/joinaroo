#!/usr/bin/env python3
"""Caption credit pre-extraction for the Event Photo Finder.

Reads post captions the finder worker has already retrieved and extracts
CANDIDATE photo credits — the "📸 @handle" lines — for the worker to
verify against the post before anything is uploaded. This is a second
pair of eyes on the one step where a mistake misattributes someone's
work. It never makes the credit decision: the finder's credit rules
(credit from the source post/caption, verified by the worker) govern.

Usage:
  python3 caption_credits.py --captions <captions.json> --out <run dir>
captions.json: [{"ref": "<scan-local id>", "platform": "instagram|facebook|x",
                 "poster": "<poster name/handle>", "caption": "<full caption>"}]
Output credits.json: per caption {ref, credits: [{handle, name, role,
evidence}], repost_source, poster_is_photographer, notes} + token totals.
"""
import argparse, json, os, sys

sys.path.insert(0, os.path.expanduser("~/workspace/custom-connectors/custom.meta-model-api/bin"))
import meta_api  # noqa: E402

SYSTEM = """You extract candidate photo credits from social-media post captions for an event-photo finder. For each caption, identify who is credited with TAKING the photos.

RULES:
- A handle or name is a credit ONLY when the caption ties it to photography: a camera emoji (📸 📷 📸), "photos by", "photo by", "shot by", "captured by", "pics by", "credit:", "pc:", "thank you @x for the photos/capturing", or a name/handle in a "Photos courtesy of <name>" line.
- Plain mentions and tags are NOT credits: tagged venues, bands, friends, ticket links, "via @x" (that is a repost source — record it as repost_source, never as a photographer credit).
- The poster is not the photographer by default. Set poster_is_photographer true ONLY when the caption itself shows the poster took the photos (e.g. "my shots from last night", "full set on my site" on a photographer's own post, a first-person shooting account). Otherwise false when the credit clearly points elsewhere, null when unknown.
- Multiple credits are possible (photo and video). Roles: photographer, videographer, unknown.
- Evidence must quote the literal caption fragment that carries the credit.

Answer with ONLY a JSON object:
{"results": [{"ref": "<ref>", "credits": [{"handle": "<@handle or null>", "name": "<display name or null>", "role": "photographer|videographer|unknown", "evidence": "<literal fragment>"}], "repost_source": "<@handle/name or null>", "poster_is_photographer": true|false|null, "notes": "<= 15 words"}]}
One result per caption, refs exactly as given."""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--captions", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--model", default="muse-spark-1.3-contributor")
    ap.add_argument("--batch", type=int, default=8)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    caps = json.load(open(args.captions))
    results, tokens = [], {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
    for s in range(0, len(caps), args.batch):
        batch = caps[s:s + args.batch]
        lines = [f"[{c['ref']}] platform={c.get('platform','')} poster={c.get('poster','')}\ncaption: {c.get('caption','')}" for c in batch]
        body = {"model": args.model, "max_tokens": 12000,
                "messages": [{"role": "system", "content": SYSTEM},
                             {"role": "user", "content": "Extract candidate credits:\n\n" + "\n\n".join(lines)}]}
        status, payload = meta_api.call("POST", "/chat/completions", body)
        if status == 429:
            print("HALTED on 429 — partial results saved", flush=True)
            break
        if status != 200:
            print(f"batch at {s}: api {status}", flush=True)
            continue
        usage = payload.get("usage") or {}
        for k in tokens:
            tokens[k] += int(usage.get(k, 0) or 0)
        content = payload["choices"][0]["message"].get("content") or ""
        try:
            parsed = json.loads(content[content.index("{"):content.rindex("}") + 1])
            results.extend(parsed["results"])
        except Exception as exc:
            print(f"batch at {s}: unparseable ({exc})", flush=True)
    with open(os.path.join(args.out, "credits.json"), "w") as fh:
        json.dump({"results": results, "token_totals": tokens}, fh, indent=1)
    print(f"done: {len(results)} captions | tokens: {tokens}")


if __name__ == "__main__":
    main()
