#!/usr/bin/env python3
"""Golden-set regression harness for the Meta-offloaded tools (Oct 27 2026).

Ten model-dependent tools now run unattended; a silent model update
could degrade one for weeks before anyone notices. This harness re-runs
four of them against the exact inputs they were validated on and
compares the DECISION fields against the golden outputs captured at
validation time. Drift beyond tolerance = a named failure, so a tool
change (ours or Meta's) gets caught the day it happens.

Checks:
  captions     caption_credits.py on the 9-caption validation set;
               per ref: credit (handle, role) set, repost_source,
               poster_is_photographer must equal golden.
  flyers       flyer_read.py on the 13 Geno's flyers; per file:
               starts_at DATE must equal golden; title token overlap
               >= 0.7; is_flyer equal. (Times are print-faithful and
               were validated 9/9; date equality is the hard gate.)
  image-pick   image_pick.py on the 7 pilot events with goldens;
               same picked file, same image_type, suitability |d| <= 2.
  dupe-block   dupe_flag.py blocking (deterministic, no model) on the
               pilot snapshot; the known same-pairs — including the two
               the fixed blocking was built to surface — must appear.

Usage: tool_regression.py --out <run dir>
Exit code: number of drifted checks (0 = all pass).
"""
import argparse, importlib.util, json, os, subprocess, sys

H = os.path.expanduser("~/workspace/goals/southern-maine-events-app-build/hidden_files")
TOOLS = os.path.expanduser("~/workspace/smevents/tools")


def run_tool(argv, cwd=TOOLS):
    r = subprocess.run([sys.executable] + argv, capture_output=True, text=True, cwd=cwd, timeout=1800)
    return r


def check_captions(out):
    golden = json.load(open(f"{H}/caption-credits-validation/run-1/credits.json"))["results"]
    run_dir = os.path.join(out, "captions")
    run_tool(["caption_credits.py", "--captions", f"{H}/caption-credits-validation/captions.json", "--out", run_dir])
    new = json.load(open(os.path.join(run_dir, "credits.json")))
    newmap = {r["ref"]: r for r in new["results"]}
    drifts = []
    for g in golden:
        n = newmap.get(g["ref"])
        if not n:
            drifts.append(f"{g['ref']}: missing")
            continue
        gs = sorted((c["handle"], c["role"]) for c in g["credits"])
        ns = sorted((c["handle"], c["role"]) for c in n["credits"])
        if gs != ns or g["repost_source"] != n["repost_source"] or g["poster_is_photographer"] != n["poster_is_photographer"]:
            drifts.append(f"{g['ref']}: golden {gs}/{g['repost_source']}/{g['poster_is_photographer']} vs new {ns}/{n['repost_source']}/{n['poster_is_photographer']}")
    return drifts, new.get("token_totals", {}).get("total_tokens", 0)


def check_flyers(out):
    golden = {r["file"]: r["flyer"] for r in json.load(open(f"{H}/flyer-reader-validation/run-1/report.json"))["records"]}
    overrides_path = f"{H}/tool-regression/golden-overrides.json"
    if os.path.exists(overrides_path):
        for fname, ov in json.load(open(overrides_path)).items():
            if fname in golden and "starts_at" in ov:
                golden[fname] = dict(golden[fname], starts_at=ov["starts_at"])
    run_dir = os.path.join(out, "flyers")
    run_tool(["flyer_read.py", "--dir", f"{H}/flyer-reader-validation/genos-13", "--out", run_dir])
    rep = json.load(open(os.path.join(run_dir, "report.json")))
    drifts = []
    for rec in rep["records"]:
        g = golden.get(rec["file"])
        if not g:
            continue
        f = rec.get("flyer") or {}
        gdate = (g.get("starts_at") or "")[:10]
        ndate = (f.get("starts_at") or "")[:10]
        if gdate != ndate:
            drifts.append(f"{rec['file']}: date {gdate} -> {ndate}")
        gt = set((g.get("title") or "").lower().split())
        nt = set((f.get("title") or "").lower().split())
        if gt and nt and len(gt & nt) / max(len(gt | nt), 1) < 0.7:
            drifts.append(f"{rec['file']}: title drift '{g.get('title')}' -> '{f.get('title')}'")
        if g.get("is_flyer") != f.get("is_flyer"):
            drifts.append(f"{rec['file']}: is_flyer flipped")
    return drifts, rep.get("run_token_totals", {}).get("total_tokens", 0)


def check_image_pick(out):
    drifts, tokens = [], 0
    for eid in ("1800", "2312", "2351", "2384", "2410", "356", "363"):
        golden = json.load(open(f"{H}/image-pick-pilot/run/{eid}/pick.json"))
        run_dir = os.path.join(out, "image-pick", eid)
        run_tool(["image_pick.py", "--event", golden["event"], "--dir", f"{H}/image-pick-pilot/events/{eid}", "--out", run_dir])
        new = json.load(open(os.path.join(run_dir, "pick.json")))
        tokens += new.get("token_totals", {}).get("total_tokens", 0)
        gp, np_ = golden.get("pick") or {}, new.get("pick") or {}
        if gp.get("file") != np_.get("file") or gp.get("image_type") != np_.get("image_type") or abs(gp.get("suitability", 0) - np_.get("suitability", 0)) > 2:
            drifts.append(f"{eid}: golden {gp.get('file')}/{gp.get('image_type')}/{gp.get('suitability')} vs new {np_.get('file')}/{np_.get('image_type')}/{np_.get('suitability')}")
    return drifts, tokens


def check_dupe_block(out):
    spec = importlib.util.spec_from_file_location("dupe_flag", os.path.join(TOOLS, "dupe_flag.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    data = f"{H}/dupe-flag-pilot"
    events = [{"id": int(r[0]), "title": r[1], "starts_at": r[2], "venue_id": r[3], "venue": r[4], "city": r[5]}
              for r in mod.read_tsv(os.path.join(data, "events.tsv"), 6)]
    pairs = mod.block_events(events)
    have = {tuple(sorted((p["a"]["id"], p["b"]["id"]))) for p in pairs}
    known = [(916, 1473), (941, 218), (717, 1459), (2, 1178), (480, 1230)]
    drifts = [f"pair {a}/{b} not surfaced by blocking" for a, b in known if tuple(sorted((a, b))) not in have]
    return drifts, 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    checks = [("captions", check_captions), ("flyers", check_flyers),
              ("image-pick", check_image_pick), ("dupe-block", check_dupe_block)]
    summary, total_tokens, failed = {}, 0, 0
    for name, fn in checks:
        try:
            drifts, tokens = fn(args.out)
        except Exception as exc:
            drifts, tokens = [f"check errored: {exc}"], 0
        total_tokens += tokens
        summary[name] = {"status": "PASS" if not drifts else "DRIFT", "drifts": drifts, "tokens": tokens}
        failed += 0 if not drifts else 1
        print(f"{name}: {'PASS' if not drifts else 'DRIFT'} ({tokens} tokens)")
        for d in drifts:
            print(f"   - {d}")
    summary["total_tokens"] = total_tokens
    json.dump(summary, open(os.path.join(args.out, "summary.json"), "w"), indent=1)
    print(f"total: {total_tokens} tokens | drifted checks: {failed}")
    sys.exit(min(failed, 125))


if __name__ == "__main__":
    main()
