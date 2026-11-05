#!/usr/bin/env python3
"""Description drafting: draft Joinaroo descriptions for events whose
description is null or thin, from the event's own page text.

Draft-only by design (Angelo's candidate, Oct 27 2026): nothing here
writes to the catalog. A draft is a proposal a human/agent reviews.

Rules baked into the prompt (the standing description rules):
- ONLY details not already in the structured fields — never restate the
  date, time, venue, or price.
- ONLY facts present in the supplied page text — no invented lineups,
  histories, or color. If the page holds nothing usable, say so (null).
- 1-3 sentences, plain voice. Gold standard: the Michael Jackson
  HIStory Show listing (what the show IS + how to get tickets).

Usage:
  python3 description_draft.py --events <events.json> --out <run dir>
events.json: [{"id","title","starts_at","venue","city","category",
               "cost_text","description","url"}]
Fetches each event's url, extracts readable text, drafts with Spark.
"""
import argparse, html, json, os, re, sys, urllib.request

sys.path.insert(0, os.path.expanduser("~/workspace/custom-connectors/custom.meta-model-api/bin"))
import meta_api  # noqa: E402

SYSTEM = """You draft event descriptions for Joinaroo, a Maine events guide. You get one event's structured facts (title, venue, city, category, cost) plus text from the event's own page.

Write a description of 1-3 sentences that tells a reader what this event IS — the act, the format, the experience — using ONLY facts present in the page text.

HARD RULES:
- Never restate the date, time, venue name, city, or price — those live in structured fields on the page already.
- Never invent anything: no lineups, guests, histories, reviews, or superlatives the page text does not state.
- If the page text holds nothing usable about what the event is, return null for the draft.
- Plain, specific voice. No hype words ("unforgettable", "don't miss"), no exclamation points.

Answer with ONLY a JSON object:
{"draft": "<the description, or null>", "facts_used": ["<short literal facts from the page text the draft rests on>"]}"""


STOP = {"the", "a", "an", "of", "at", "in", "on", "vs", "and", "&", "with", "for", "to"}


def gate(draft, title):
    """Mechanical quality gates (Angelo's wiring conditions, Oct 27 2026).
    Returns (ok, reason). Rejects title-restating tautologies and stubs."""
    if not draft:
        return False, "model returned null"
    words = [w for w in __import__("re").split(r"[^a-z0-9']+", draft.lower()) if w]
    if len(words) < 12:
        return False, f"too thin ({len(words)} words)"
    content = {w for w in words if w not in STOP}
    title_words = {w for w in __import__("re").split(r"[^a-z0-9']+", (title or "").lower()) if w and w not in STOP}
    if content and title_words and len(content & title_words) / len(content) >= 0.7:
        return False, "restates the title"
    return True, ""


def page_text(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36"})
    with urllib.request.urlopen(req, timeout=25) as resp:
        raw = resp.read().decode("utf-8", "ignore")
    raw = re.sub(r"(?is)<(script|style|noscript)[^>]*>.*?</\1>", " ", raw)
    raw = re.sub(r"(?s)<!--.*?-->", " ", raw)
    text = re.sub(r"(?s)<[^>]+>", " ", raw)
    text = html.unescape(re.sub(r"\s+", " ", text)).strip()
    return text


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--events", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--model", default="muse-spark-1.3-contributor")
    ap.add_argument("--max-page-chars", type=int, default=6000)
    ap.add_argument("--only-null", action="store_true",
                    help="skip events that already have a description (the wiring rule: never replace an existing line)")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    events = json.load(open(args.events))
    if args.only_null:
        events = [e for e in events if not (e.get("description") or "").strip()]
    results, tokens = [], {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
    for e in events:
        try:
            text = page_text(e["url"])[: args.max_page_chars] if e.get("url") else ""
        except Exception as exc:
            text = ""
            print(f"  {e['id']}: fetch failed ({exc})", flush=True)
        user = (f"Title: {e['title']}\nVenue: {e.get('venue','')} ({e.get('city','')})\n"
                f"Category: {e.get('category','')}\nCost: {e.get('cost_text') or 'not listed'}\n"
                f"Current description: {e.get('description') or '(none)'}\n\nPage text:\n{text}")
        body = {"model": args.model, "max_tokens": 12000,
                "messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": user}]}
        status, payload = meta_api.call("POST", "/chat/completions", body)
        if status == 429:
            print("HALTED on 429", flush=True)
            break
        if status != 200:
            print(f"  {e['id']}: api {status}", flush=True)
            continue
        usage = payload.get("usage") or {}
        for k in tokens:
            tokens[k] += int(usage.get(k, 0) or 0)
        content = payload["choices"][0]["message"].get("content") or ""
        try:
            parsed = json.loads(content[content.index("{"):content.rindex("}") + 1])
        except Exception:
            parsed = {"draft": None, "facts_used": [], "parse_error": True}
        ok, reason = gate(parsed.get("draft"), e["title"])
        results.append({"id": e["id"], "title": e["title"], "url": e.get("url"),
                        "current": e.get("description"), "page_chars": len(text),
                        "draft": parsed.get("draft") if ok else None,
                        "rejected_draft": None if ok else parsed.get("draft"),
                        "gate_reason": reason,
                        "facts_used": parsed.get("facts_used", [])})
        print(f"  {e['id']}: {'drafted' if ok else 'rejected: ' + reason} ({len(text)} page chars)", flush=True)
    with open(os.path.join(args.out, "drafts.json"), "w") as fh:
        json.dump({"results": results, "token_totals": tokens}, fh, indent=1)
    print(f"done: {sum(1 for r in results if r['draft'])} drafts of {len(results)} | tokens: {tokens}")


if __name__ == "__main__":
    main()
