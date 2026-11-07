#!/usr/bin/env python3
"""Backlog burn runner (Oct 27 2026): for events that HAVE a url but no
image, pull image candidates from the event's own page (raw HTML —
og:image / twitter:image / content imgs), pre-filter obvious junk,
score the survivors with image_pick.py, and emit an apply plan of the
picks that clear the wired Phase-2 bar (suitability >= 5 AND type in
{event promo or flyer, event-related photo, performer photo, venue
photo}). Applies nothing itself — the plan is applied separately after
review, via the sync-identity PATCH pattern.

Usage:
  backlog_burn.py --targets <targets.tsv> --work <work dir>
targets.tsv rows: id, title, starts_at, url, image_url (tab-separated).
"""
import argparse, json, os, re, subprocess, sys, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor

REJECT = re.compile(r"logo|icon|button|og-default|social-share|fallback|@seo-|dbimages|/dam/c/|\.svg($|\?)", re.I)
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36"}
ALLOWED_TYPES = {"event promo or flyer", "event-related photo", "performer photo", "venue photo"}


def atomic_json_dump(obj, path, **kw):
    """Write JSON via temp file + os.replace so a killed run never
    leaves a truncated file behind."""
    tmp = path + ".tmp"
    with open(tmp, "w") as fh:
        json.dump(obj, fh, **kw)
        fh.flush()
        os.fsync(fh.fileno())
    os.replace(tmp, path)


def fetch(url, timeout=20):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", "ignore"), resp.geturl()


def candidates(html_text, base):
    found = []
    for pat in (r'property="og:image"\s+content="([^"]+)"', r'content="([^"]+)"\s+property="og:image"',
                r'name="twitter:image"\s+content="([^"]+)"', r'content="([^"]+)"\s+name="twitter:image"'):
        m = re.search(pat, html_text)
        if m:
            found.append(m.group(1))
    for m in re.finditer(r'<img[^>]+src="([^"]+)"', html_text):
        found.append(m.group(1))
    out = []
    for u in found:
        u = urllib.parse.urljoin(base, u.strip())
        if not u.startswith("http") or REJECT.search(u) or u in out:
            continue
        out.append(u)
        if len(out) >= 5:
            break
    return out


def download(url, path):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=20) as resp:
        data = resp.read()
    if len(data) < 4000:  # sub-4KB is a placeholder/icon, not a photo
        return False
    with open(path, "wb") as fh:
        fh.write(data)
    return True


def process(t, work):
    eid = t["id"]
    edir = os.path.join(work, "events", str(eid))
    os.makedirs(edir, exist_ok=True)
    try:
        html_text, final_url = fetch(t["url"])
    except Exception as exc:
        return {"id": eid, "outcome": f"fetch failed: {exc}"}
    cands = candidates(html_text, final_url)
    manifest, kept = {}, 0
    for i, u in enumerate(cands):
        ext = os.path.splitext(urllib.parse.urlparse(u).path)[1].lower() or ".jpg"
        if ext not in (".jpg", ".jpeg", ".png", ".webp"):
            ext = ".jpg"
        fname = f"cand-{i}{ext}"
        try:
            if download(u, os.path.join(edir, fname)):
                manifest[fname] = u
                kept += 1
        except Exception:
            pass
    if not kept:
        return {"id": eid, "outcome": "no usable candidates on page"}
    atomic_json_dump(manifest, os.path.join(edir, "manifest.json"), indent=1)
    out_dir = os.path.join(edir, "gate")
    r = subprocess.run([sys.executable, os.path.expanduser("~/workspace/smevents/tools/image_pick.py"),
                        "--event", f"{t['title']} ({t['starts_at'][:10]})", "--dir", edir, "--out", out_dir],
                       capture_output=True, text=True, timeout=600)
    pick_path = os.path.join(out_dir, "pick.json")
    if not os.path.exists(pick_path):
        return {"id": eid, "outcome": f"gate failed: {r.stdout[-120:]} {r.stderr[-120:]}"}
    pick_data = json.load(open(pick_path))
    pick = pick_data.get("pick") or {}
    tokens = pick_data.get("token_totals", {}).get("total_tokens", 0)
    if pick.get("file") not in manifest:
        # A pick whose file is not in this run's manifest (hallucinated
        # or stale-resumed filename) can never apply — its URL would
        # resolve to None and wipe/crash the image field downstream.
        return {"id": eid, "outcome": f"below bar (pick file {pick.get('file')!r} not in manifest)",
                "tokens": tokens}
    if pick.get("suitability", 0) >= 5 and pick.get("image_type") in ALLOWED_TYPES:
        return {"id": eid, "outcome": "apply", "image_url": manifest.get(pick["file"]),
                "suitability": pick["suitability"], "type": pick["image_type"],
                "evidence": pick.get("evidence", ""), "tokens": tokens}
    return {"id": eid, "outcome": f"below bar (best: {pick.get('image_type')}, {pick.get('suitability')})", "tokens": tokens}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--targets", required=True)
    ap.add_argument("--work", required=True)
    args = ap.parse_args()
    os.makedirs(args.work, exist_ok=True)
    targets = []
    for line in open(args.targets, encoding="utf-8"):
        p = line.rstrip("\n").split("\t")
        if len(p) >= 5 and p[0].isdigit() and p[3] and not p[4]:
            targets.append({"id": int(p[0]), "title": p[1], "starts_at": p[2], "url": p[3]})
    print(f"targets with url, no image: {len(targets)}", flush=True)
    results = []
    with ThreadPoolExecutor(max_workers=4) as ex:
        for res in ex.map(lambda t: process(t, args.work), targets):
            results.append(res)
            print(f"  {res['id']}: {res['outcome']}", flush=True)
    plan = [r for r in results if r["outcome"] == "apply"]
    atomic_json_dump({"plan": plan, "results": results,
                      "gate_tokens": sum(r.get("tokens", 0) for r in results)},
                     os.path.join(args.work, "apply-plan.json"), indent=1)
    print(f"plan: {len(plan)} applies of {len(results)} | gate tokens: {sum(r.get('tokens', 0) for r in results)}")


if __name__ == "__main__":
    main()
