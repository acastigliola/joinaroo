# Meta Model API — spend ledger

Standing instruction (Angelo, Oct 27, 2026): track the cash cost of every
task/function offloaded to the Meta Model API. Credit balance per Angelo's
dev.meta.ai dashboard: **$145 remaining (Oct 27, 2026)** — the dashboard is
the authority; this ledger is the per-task breakdown that decides what
stays wired. Policy: tasks that cost pennies stay on Meta; a task that
proves expensive versus the weekly Muse session-token pool gets flagged
here and unwired. Dollar figures below are ESTIMATES from token counts at
observed blended rates (Spark ≈ $2.6/1M tokens, Wonder ≈ $16.8/1M);
token counts are metered truth from the API's usage objects.

## Backfill — through Oct 27, 2026 (~11:00 AM)

| Date | Task / function | Tool | Tokens | Est. $ |
|---|---|---|---|---|
| Oct 26 | Benchmark session (Wonder-heavy testing) | meta_api.py | ~20,200 | ~0.34 |
| Oct 27 | Finder photo screening — pilot (Hearts pool) | finder_screen.py | 61,672 | ~0.16 |
| Oct 27 | Finder photo screening — batch finishers + batch 2 + top-up slate | finder_screen.py | 471,492 | ~1.23 |
| Oct 27 | Sweep listing extraction — pilot (SPACE + Geno's, both models) | sweep_extract.py | 54,300 | ~0.55 |
| Oct 27 | Flyer reader — build validation (13 Geno's flyers + fix re-run) | flyer_read.py | 55,741 | ~0.15 |
| Oct 27 | Detail-page extraction — pilot (6 pages, both models) | detail_extract.py | 163,086 | ~0.90 |
| Oct 27 | Image gate — pilot (17 candidates) | image_pick.py | 25,908 | ~0.07 |
| Oct 27 | Dupe flagging — pilot run (in progress at backfill time) | dupe_flag.py | pending | pending |
| Oct 27 | Drift watch — pilot (2 extractions + arbitration) | drift_watch.py | 30,074 | ~0.10 |

Itemized total (excl. dupe run): ≈ 882,000 tokens ≈ **$3.50** estimated.
Reconciles with the dashboard: ~$150 start − ~$0.36 (Oct 26–27 early use)
− today's pilots ≈ $145 remaining per Angelo.

## Cost watch — the lines that could stop being pennies
- **Detail extraction on un-trimmed Wix pages: ~25k tokens/page** (vs
  ~3.5k on clean pages) until the embedded-JSON fallback trims them.
  At ~120 new events/day worst case this is the biggest wired exposure.
- **Wonder usage anywhere**: ~6.5× Spark's rate. Wonder is escalation/
  arbitration only; if agreement logging shows Wonder calls growing,
  that is the first unwire candidate.
- **Listing extraction on large listing pages** scales with page size;
  per-source totals land here daily from the sweep.

## Run lines (appended per run from Oct 27 onward)
<!-- format: YYYY-MM-DD | task | tool | model | total_tokens | notes -->
2026-10-27 | dupe-flagging pilot (282 pairs verdicted) | dupe_flag.py | muse-spark-1.3 | ~254,000 | 165,813 metered in resumed run; ~88k unmetered in crashed first attempt (est.)
2026-10-27 | category audit pilot (full catalog, 2,524 events, 3 passes) | category_audit.py | muse-spark-1.3 | 978,504 | ~40% wasted on reasoning-overflow retries before the max_tokens fix (3000 -> 12000); steady-state cost ~590k/run
2026-10-27 | description drafting samples (12 events) | description_draft.py | muse-spark-1.3 | 29,897 | 5 drafts, 7 nulls (fetch shells + prose-free pages)
2026-10-27 | caption credit pre-extraction validation (9 captions) | caption_credits.py | muse-spark-1.3 | 7,369 | 9/9 correct incl. both traps; wired into finder skill same day
| 2026-10-27 | backlog burn gate (63 events) | image_pick.py (via backlog_burn.py) | muse-spark-1.3 | 201,774 |
| 2026-10-27 | score-debug reader smoke test | score_debug_read.py | muse-spark-1.3 | 4,722 |
| 2026-10-27 | backlog burn mini (URLs-first, 2 events) | image_pick.py (via backlog_burn.py) | muse-spark-1.3 | 7,758 |
| 2026-10-27 | tool regression baseline (4 checks + flyer re-run) | tool_regression.py | muse-spark-1.3 | 136,509 |
| 2026-10-28 | sweep E UMaine calendar p2 extraction | sweep_extract.py | muse-spark-1.3 | 12,288 |
| 2026-10-28 | sweep E UMaine calendar p2 extraction | sweep_extract.py | muse-wonder-1.0 | 12,317 |
| 2026-10-28 | sweep C Public Theatre season page extraction (FAILED: JSON parse error both models, no candidates produced) | sweep_extract.py | muse-wonder-1.0 | 19,995 |
| 2026-10-28 | sweep C Public Theatre season page extraction (FAILED: JSON parse error both models, no candidates produced) | sweep_extract.py | muse-spark-1.3 | 19,995 |
2026-10-28 | sweep listing extraction SPACE (sync from Spark) | sweep_extract.py | muse-spark-1.3 | 13,407 | report.json metered; validation clean, agreed with Wonder on all 29
2026-10-28 | sweep listing extraction SPACE (arbitration) | sweep_extract.py | muse-wonder-1.0 | 12,856 | report.json metered
2026-10-28 | sweep listing extraction Geno's (sync from Wonder; Spark attempt failed JSON parse) | sweep_extract.py | muse-wonder-1.0 | 31,900 | agent-reported, no report.json written; Wix embedded-JSON page
2026-10-28 | drift watch SPACE | drift_watch.py | muse-spark-1.3 | 1,845 |
2026-10-28 | drift watch Geno's | drift_watch.py | muse-spark-1.3 | 1,735 |
2026-10-28 | finder warm-up salvage screening — UMaine Football set (event 916) | finder_screen.py | muse-spark-1.3 | 31,452 |
2026-10-28 | finder warm-up salvage screening — Bangor Dog Park set (event 2130) | finder_screen.py | muse-spark-1.3 | 90,355 |
| 2026-10-28 | hero-photo burn — image gate over 243 with-URL events missing image_url (53 applies) | backlog_burn.py / image_pick.py | muse-spark-1.3 | 808,607 |
| 2026-10-28 | card subject measurement — golden validation (4 goldens + 1 diagnostic re-run; 0/4 passed as prompted — see report) | card_measure.py | muse-spark-1.3 | 12,030 |
| 2026-10-29 | sweep E UMaine calendar p3 extraction (FAILED: Meta API 429 rate limit, terminal_for_attempt — no output produced, manual reading used) | sweep_extract.py | muse-spark-1.3 | ERROR 429 |
| 2026-10-29 | daily sweep listing extraction attempts — SPACE, Geno's (parent), Graves Library (sweep C), Boothbay Opera House (sweep D) — all FAILED at page fetch (sandbox egress URLError timeouts, before any Meta API call) | sweep_extract.py | muse-spark-1.3 + muse-wonder-1.0 | 0 |
| 2026-10-30 | daily sweep listing extraction attempts — SPACE, Geno's (parent) — both FAILED at page fetch (sandbox egress URLError timeouts, before any Meta API call); manual listing comparison used instead | sweep_extract.py | muse-spark-1.3 + muse-wonder-1.0 | 0 |
| 2026-10-30 | game summary drafting — new tool build + test vs event 2591 hand-built block (2 metered runs; records matched verified 8-8 / 3-2 after post-game rule fix) | game_summary_draft.py | muse-spark-1.3 | 31,695 |
| 2026-10-30 | community block mining — new tool build + tests (3 targets on scene-thread comments; MORTAR + Weakened Friends matched human picks, absent act correctly null) | community_mine.py | muse-spark-1.3 | 20,783 |
| 2026-10-30 | card verdict — new tool build + golden validation (24 events from catalog pass outcomes; binary agreement 70.8% vs 85% bar — FAILED, not wired) | card_verdict.py | muse-spark-1.3 | 65,186 |
| 2026-10-30 | finder screening — Trunk or Treat Westbrook Crossing (event 1507), 1 file screened, belongs=false (arena vendor photo, not this event) | finder_screen.py | muse-spark-1.3 | 1,849 |
| 2026-10-30 | finder caption-credit pre-extraction — Touch A Truck & Treat (event 1635), 2 captions, no credits found | caption_credits.py | muse-spark-1.3 | 1,268 |
| 2026-10-30 | finder screening — Touch A Truck & Treat (event 1635), 2 files screened, both belongs=true | finder_screen.py | muse-spark-1.3 | 3,854 |
| 2026-10-30 | finder screening — Trunk or Treat at Brewer Center (event 2585), 6 files screened, 5 belongs=true (6th uploaded on post-membership verification, disagreement logged) | finder_screen.py | muse-spark-1.3 | 13,064 |
| 2026-10-30 | finder caption-credit pre-extraction — Trunk or Treat at Brewer Center (event 2585), 1 caption, no credits found (org credit) | caption_credits.py | muse-spark-1.3 | 950 |
| 2026-10-30 | finder screening — OOB vs Maranacook playoff football (event 2467), 1 file screened, belongs=true | finder_screen.py | muse-spark-1.3 | 2,275 |
| 2026-10-30 | finder caption-credit pre-extraction — OOB vs Maranacook playoff football (event 2467), 1 caption, no credits found (fan credit to poster) | caption_credits.py | muse-spark-1.3 | 1,316 |
| 2026-10-30 | phase2 backfill hero gating — 20 events, 31 candidates scored, 15 applied | image_pick.py | muse-spark-1.3 | 37053 | standalone backfill run |
| 2026-10-31 | finder screening (manual Thriller pickup, 1 img) | finder_screen.py | muse-spark-1.3 | 1994 | belongs=true; uploaded as photo 873 |
| 2026-10-31 | finder screening (Thriller re-check pickup, 5 imgs) | finder_screen.py | muse-spark-1.3 | 11238 | all belongs=true; uploaded photos 874-878 |
| 2026-10-31 | finder screening (Thriller IG pickup, 16 imgs) | finder_screen.py | muse-spark-1.3 | 39141 | 15 belongs, 1 rejected (makeup selfie, no event markers) |
| 2026-10-31 | score-debug read | score_debug_read.py | muse-spark-1.3 | 3367 |
| 2026-10-31 | daily sweep listing extraction attempt — SPACE (parent) — FAILED at page fetch (sandbox egress URLError timeout, before any Meta API call); manual listing comparison via sweep A instead | sweep_extract.py | muse-spark-1.3 + muse-wonder-1.0 | 0 |
| 2026-10-31 | finder caption-credit pre-extraction — Halloween at Old York (event 206), 1 caption, no credits found (fan credit to poster) | caption_credits.py | muse-spark-1.3 | 910 |
| 2026-10-31 | finder screening — Halloween at Old York (event 206), 11 images, 10 kept / 1 rejected | finder_screen.py | muse-spark-1.3 | 22651 |
| 2026-10-31 | finder screening — Motorsports Classic Sat (event 2203) pickup, first 3 images, 3 kept / 0 rejected (scan run itself) | finder_screen.py | muse-spark-1.3 | 5812 |
| 2026-10-31 | finder screening — Motorsports Classic Sat (event 2203) pickup by parent, 6 images, 4 kept / 2 rejected | finder_screen.py | muse-spark-1.3 | 16254 |
| 2026-10-31 | finder screening — Motorsports Classic Sat (event 2203) pickup by parent, 8 extra session-pool files, 0 kept / 8 rejected (6 were Trick or Trail photos from the shared download pool, 2 strays) | finder_screen.py | muse-spark-1.3 | 16416 |
| 2026-10-31 | finder screening — Creepy Crawl (event 31), timed-out run's screening, 7 images, 4 kept / 3 rejected | finder_screen.py | muse-spark-1.3 | 18280 |
| 2026-11-01 | finder screening — Bangor Boo Ball (event 495) parent pickup, 26 images, 17 kept by screen / 9 rejected (2 rejects overturned on parent visual check: moulton-5, moulton-10) | finder_screen.py | muse-spark-1.3 | 56466 |
| 2026-11-01 | daily sweep listing extraction attempts — SPACE, Geno's (parent) — both FAILED at page fetch (sandbox egress URLError timeouts, before any Meta API call); manual listing reading used instead | sweep_extract.py | muse-spark-1.3 + muse-wonder-1.0 | 0 |
| 2026-11-01 | phase2 backfill image gating — 4 events (2771, 2868, 2780, 2885), 1 candidate each, all passed >=8 | image_pick.py | muse-spark-1.3 | 8448 |
| 2026-11-01 | phase2 backfill image gating round 2 — 2 events (2891, 2894), 1 candidate each, both passed at 8 | image_pick.py | muse-spark-1.3 | 3035 |
| 2026-11-01 | finder screening — I Heart Biddeford 5K re-check (event 2233), 10 images, 7 kept / 3 rejected (ledgered by parent at pickup; the timed-out run had not) | finder_screen.py | muse-spark-1.3 | 20284 |
| 2026-11-01 | finder screening — Great Pumpkin Ball recap pickup (event 1348), 21 images, 18 kept / 3 rejected (rejects upheld on parent visual check: at-home getting-ready frames) | finder_screen.py | muse-spark-1.3 | 44100 |
| 2026-11-01 | finder screening — A Very Jerry rescan pickup (event 2352), 13 images, 9 kept / 4 rejected (Suzannah Wells home-interior set; keeps upheld on parent visual check incl. Craig Herrick venue signage) | finder_screen.py | muse-spark-1.3 | 27872 |
| 2026-11-01 | finder screening — Biddeford Rec Trunk or Treat rescan (event 2230), 2 images, 2 kept / 0 rejected | finder_screen.py | muse-spark-1.3 | 3937 |
| 2026-11-01 | finder caption-credit pre-extraction — Biddeford Rec Trunk or Treat rescan (event 2230), 1 caption, no credits found (fan credit to poster) | caption_credits.py | muse-spark-1.3 | 855 |
| 2026-11-01 | finder screening — Halloween After Dark Orono rescan (event 2136), 3 images, 3 kept / 0 rejected | finder_screen.py | muse-spark-1.3 | 5888 |
| 2026-11-01 | finder caption-credit pre-extraction — Halloween After Dark Orono rescan (event 2136), 2 captions, no credits found (fan credit to poster) | caption_credits.py | muse-spark-1.3 | 1183 |
| 2026-11-01 | finder screening — SPACE Halloween rescan (event 2080), 2 story stills screened, both belongs=true (held out: story-only, not uploaded) | finder_screen.py | muse-spark-1.3 | 5354 |
| 2026-11-01 | finder caption-credit pre-extraction — Red Eye rescan (event 2334), 1 caption, photographer credit found (Hannah Cormier) | caption_credits.py | muse-spark-1.3 | 4116 |
| 2026-11-01 | finder screening — Red Eye rescan (event 2334), 8 images, 6 kept / 2 rejected (both identifier-absence only; parent-verified, uploaded under set-level provenance) | finder_screen.py | muse-spark-1.3 | 22781 |
| 2026-11-01 | moltbook sparring test — Spark critique of verified-empty position + tomorrow post question (first Moltbook-freedom Meta spend, Angelo grant Nov 1) | meta_api.py chat (manual) | muse-spark-1.3 | 1879 |
| 2026-11-01 | finder screening + caption-credit pre-extraction — Jeff Tweedy scan (event 753), 1 image belongs=true, 1 caption no credit (fan credit to poster) | finder_screen.py + caption_credits.py | muse-spark-1.3 | 3069 |
| 2026-11-01 | finder screening — Pumpkinhead Halloween Rave rescan (event 2845), 5 images, 4 kept / 1 rejected (home-interior frame) | finder_screen.py | muse-spark-1.3 | 13946 |
| 2026-11-01 | finder caption-credit pre-extraction — Pumpkinhead Halloween Rave rescan (event 2845), 2 captions, no credits found (fan credit to posters) | caption_credits.py | muse-spark-1.3 | 1418 |
| 2026-11-02 | finder screening — Motorsports Classic Sun (event 2204), 7 images, 5 kept by screen (4 arena photos + 1 flyer, flyer excluded as promo) / 2 rejected (outdoor at-home car shots); 4 uploaded | finder_screen.py | muse-spark-1.3 | 14935 |
| 2026-11-02 | finder caption-credit pre-extraction — Motorsports Classic Sun (event 2204), 1 caption, no credits found (fan credit to poster) | caption_credits.py | muse-spark-1.3 | 1293 |
| 2026-11-02 | finder screening — Pause For Pets (event 2108), 4 images, 4 kept / 0 rejected | finder_screen.py | muse-spark-1.3 | 9281 |
| 2026-11-02 | finder caption-credit pre-extraction — Pause For Pets (event 2108), 2 captions, no credits found (fan/vendor credit to posters) | caption_credits.py | muse-spark-1.3 | 1453 |
| 2026-11-02 | sparring consult — Spark on breaking the bounce user life cycle without friction (Angelo-requested); answer: peephole live strip + "will this be lame?" proof/timed promise | direct chat call | muse-spark-1.3 | 6895 |
| 2026-11-02 | sparring consult — Spark verdict on venue-level idea 2 scoped to State Theatre (proof teaser + computed photo prediction); answer: conditional GO, 7/10 as drafted, 8.5 with fixes | direct chat call | muse-spark-1.3 | 7104 |
| 2026-11-02 | sparring consult — Spark review of shipped Room Proof implementation (screenshot attached) | direct chat call | muse-spark-1.3 | 7323 |
| 2026-11-02 | sparring consult — Spark re-review of Room Proof after spec fixes (screenshot attached) | direct chat call | muse-spark-1.3 | 5585 |
| 2026-11-02 | sparring consult — Spark on Photos-empty-state vs Room Proof section order | direct chat call | muse-spark-1.3 | 5071 |
| 2026-11-02 | sparring consult — Spark review of shipped Peephole pilot on Blue October page (mechanics + both deviations + current Saturday/Halloween render stated up front); answer: 6.5/10, six fix-before-ungating items | direct chat call | muse-spark-1.3 | 8884 |
| 2026-11-02 | sparring consult — Spark re-review of Peephole after the six fixes (mechanics + stumble + Monument Square question stated up front); answer: 8.0/10, four new fix-before-ungating items | direct chat call | muse-spark-1.3 | 9636 |
| 2026-11-02 | sparring consult — Spark third Peephole review with Angelo's screenshot of the current render; answer: 8.4/10, one fix-before (finish re-stamp, freeze Saturday counts) then 8.6 + ungate pass | direct chat call | muse-spark-1.3 | 5775 |
| 2026-11-02 | peephole people-gate stamping (15-min cron) | photo_people_stamp.py | muse-spark-1.3 | 265597 |
| 2026-11-02 | sparring consult — Spark review of the Community Pick event page (Angelo's full-page screenshot); answer: 4/10, merge the three thread modules into one compact card after the facts, related bands below tickets | direct chat call | muse-spark-1.3 | 4153 |
| 2026-11-02 | sparring consult — Spark re-grade of the rebuilt Community Pick page (Angelo's screenshot); answer: 9/10 ship it, nothing fix-before; watch-after: lone thin highlight bar + wordy band subcopy | direct chat call | muse-spark-1.3 | 3654 |
| 2026-11-02 | sparring consult — Spark critique of the ended listing-with-photos page (Thundercat screenshot); answer: 4/10, de-lie the people panel (kill 'Checked in' + Message on finder-sourced people), ended banner up top, no peephole on ended pages | direct chat call | muse-spark-1.3 | 4141 |
| 2026-11-02 | sparring consult — Angelo's pushback on Spark's #1/#2 (check-in framing + Message) run by Spark with the new banner screenshot; answer: moved on copy/audience/aggregator points, holds on active-voice 'Checked in' + solicitation-without-consent, offers provenance compromise | direct chat call | muse-spark-1.3 | 6156 |
2026-11-02 | sweep A daily watch — SPACE listing extraction attempt | sweep_extract.py | muse-spark-1.3 | 0 | FAILED at page fetch (egress proxy timeout, same as Nov 1); manual read used
2026-11-02 | sweep A daily watch — Geno's listing extraction attempt | sweep_extract.py | muse-spark-1.3 | 0 | FAILED at page fetch (egress proxy timeout); manual read used
| 2026-11-02 | sparring consult — Angelo's round-2 pushback on people panel (public profiles, aggregation value, govern-on-abuse, retention-over-bounce) run by Spark; answer: big concessions (no secrets, value non-replaceable, retention frame right), holds on aggregation-as-new-context, 'Checked in' false about agency, govern-later is blind to off-platform harm | direct chat call | muse-spark-1.3 | 6093 |
| 2026-11-02 | finder screening — Aerial Arts re-check (event 1002), 2 images, 2 kept / 0 rejected | finder_screen.py | muse-spark-1.3 | 4057 |
| 2026-11-02 | finder caption-credit pre-extraction — Aerial Arts re-check (event 1002), 1 caption, no credits found (poster credit to Aerial Jade) | caption_credits.py | muse-spark-1.3 | 1684 |
| 2026-11-02 | peephole people-gate stamping (15-min cron) | photo_people_stamp.py | muse-spark-1.3 | 9431 |
| 2026-11-02 | dupe-flag weekly | dupe_flag.py | muse-spark-1.3 | 178698 |
| 2026-11-02 | category audit weekly | category_audit.py | muse-spark-1.3 | 1146076 |
| 2026-11-02 | finder screening — Pause For Pets pickup batch 1 (event 2108), 21 images, 17 kept / 4 rejected (all 4 identifier-absence only; parent visual check upheld 2 sampled + set-level provenance — all 21 uploaded) | finder_screen.py | muse-spark-1.3 | 57519 |
| 2026-11-02 | peephole people-gate stamping (15-min cron) | photo_people_stamp.py | muse-spark-1.3 | 94581 |
| 2026-11-02 | finder screening — Pause For Pets pickup batch 2 (event 2108), 20 images, 8 kept / 12 rejected (all 12 identifier-absence only; parent visual check upheld sampled rejects + set-level provenance — all 20 uploaded) | finder_screen.py | muse-spark-1.3 | 52668 |
| 2026-11-02 | peephole people-gate stamping (15-min cron) | photo_people_stamp.py | muse-spark-1.3 | 88565 |
| 2026-11-02 | Spark critique of the submitted hackathon demo video (12 sampled frames + full transcript; judge's-eye critique + polish shot list) | spark_critique.py (demo-video) | muse-spark-1.3 | 17213 |
| 2026-11-02 | Muse Image polish assets for the demo per Spark's shot list (opening title card, end card, YouTube thumbnail) | gen_images.py (demo-video) | muse-image-1.0 | 42016 |
| 2026-11-02 | Spark critique of Angelo's reworked hackathon Project Description (full context brief: rubric, gatekeeper dynamic, product facts; scored + slop/specificity audits) | spark_pitch_critique.py (demo-video) | muse-spark-1.3 | 7967 |
| 2026-11-02 | Spark WROTE the replacement hackathon Project Description pitch (per its own critique; facts-only brief; self-score + fact list + cut list returned) | spark_pitch_write.py (demo-video) | muse-spark-1.3 | 15790 |
| 2026-11-02 | Spark WROTE the 'Describe your use of Meta products' submission section (three levels: Model API tools inventory, IG/FB ground, built-with-Muse; criteria 2+3 targeting) | spark_meta_write.py (demo-video) | muse-spark-1.3 | 10273 |
| 2026-11-02 | Spark WROTE the 'Why are Meta's models important' submission section (counterfactual argument: compute, consultant, build partner; criterion 2) | spark_why_write.py (demo-video) | muse-spark-1.3 | 11543 |
| 2026-11-03 | Smoke test: Spark Contributor vision call after wiring contributor as the default for production tools | smoke test (demo frame) | muse-spark-1.3-contributor | 1321 |
| 2026-11-03 | finder screening — Osher Youth Ensembles (event 1158), 1 image, 1 kept / 0 rejected | finder_screen.py | muse-spark-1.3 | 1801 |
| 2026-11-03 | peephole people-gate stamping (15-min cron) | photo_people_stamp.py | muse-spark-1.3 | 4605 |
| 2026-11-03 | Spark scored the POLISHED demo cut on the Demo rubric criterion (11 polished-cut frames + unchanged transcript; original critique as reference) | spark_demo_score.py (demo-video) | muse-spark-1.3 | 13327 |
| 2026-11-03 | Spark WROTE the full demo re-record script (timed segment table, verbatim narration 380 words, checklist, navigation flags) | spark_script_write.py (demo-video) | muse-spark-1.3 | 16032 |
| 2026-11-03 | daily sweep listing extraction — SPACE/Geno's (attribution uncertain, one run succeeded; at least one fetch-timed-out at 0 tokens) | sweep_extract.py | muse-spark-1.3 + muse-wonder-1.0 | 27102 |
| 2026-11-03 | phase2 backfill image gating — 25 events (22 applied incl. Wells Reserve series pair, 2 generic-stock proposals not applied, 2 logo picks rejected) | image_pick.py | muse-spark-1.3-contributor | 49012 |
2026-11-03 | tool regression monthly | tool_regression.py | muse-spark-1.3 | 89193
| 2026-11-03 | gap backfill hero photos — image gating batch 1 (18 events) | image_pick.py | muse-spark-1.3-contributor | 42545 |
| 2026-11-03 | gap backfill hero photos — image gating batch 2 (19 events) | image_pick.py | muse-spark-1.3-contributor | 47723 |
| 2026-11-03 | gap backfill hero photos — image gating re-runs (2728/2879/2880/2920/2926/2928/2939/2954 with added candidates) | image_pick.py | muse-spark-1.3-contributor | 44159 |
| 2026-11-03 | gap backfill hero photos — image gating single re-runs/resumes (2723 dining photo, 2920, 2928, 2921) | image_pick.py | muse-spark-1.3-contributor | 16139 |
| 2026-11-03 | finder screening — Fiddle-icious at the Franco re-check (event 748), 3 images, 2 kept / 1 rejected | finder_screen.py | muse-spark-1.3-contributor | 5880 |
| 2026-11-03 | peephole people-gate stamping (15-min cron) | photo_people_stamp.py | muse-spark-1.3 | 7007 |
| 2026-11-03 | finder screening — Blue October (event 1349), 2 images, 1 kept / 1 rejected | finder_screen.py | muse-spark-1.3-contributor | 4909 |
| 2026-11-03 | finder screening — Blue October RE-CHECK (event 1349), 1 image, 1 kept / 0 rejected | finder_screen.py | muse-spark-1.3-contributor | 2023 |
| 2026-11-04 | Spark consult: scraper monetization analysis (Angelo request) | spark_scraper_monetization.py | muse-spark-1.3 | 9673 |
| 2026-11-04 | Spark consult #2: scraper attribution (Angelo request) | spark_scraper_attribution.py | muse-spark-1.3 | 10979 |
| 2026-11-04 | scraper reassessment consult (post-block evidence; standard - consult) | spark_scraper_reassessment.py | muse-spark-1.3 | 7393 |
| 2026-11-04 | amazonbot block review consult (standard - consult) | spark_amazonbot_review.py | muse-spark-1.3 | 8176 |
| 2026-11-04 | azure-amazon link consult (standard - consult) | spark_azure_amazon_link.py | muse-spark-1.3 | 10066 |
| 2026-11-04 | db growth/normalization consult (standard - consult) | spark_db_growth.py | muse-spark-1.3 | 12367 |
| 2026-11-04 | moltbook smoke test — contributor chat endpoint check after Angelo directed Moltbook Meta spend to Contributor | meta_api.py chat (manual) | muse-spark-1.3-contributor | 734 |
| 2026-11-04 | chatgpt traffic model consult (standard - consult) | spark_chatgpt_traffic_model.py | muse-spark-1.3 | 7326 |
| 2026-11-04 | chatgpt rebuttal consult (standard - consult) | spark_chatgpt_rebuttal.py | muse-spark-1.3 | 6399 |
| 2026-11-04 | chatgpt starvation argument consult (standard - consult) | spark_chatgpt_starvation.py | muse-spark-1.3 | 6460 |
| 2026-11-04 | image gate — lead-sheet ingest: Mindful Wellness Walk | image_pick.py | muse-spark-1.3-contributor | 3345 |
| 2026-11-04 | image gate — lead-sheet ingest: Pub Run Hardshore | image_pick.py | muse-spark-1.3-contributor | 2337 |
| 2026-11-04 | image gate — lead-sheet ingest: Danielle Dior Trivia | image_pick.py | muse-spark-1.3-contributor | 4155 |
| 2026-11-04 | image gate — lead-sheet ingest: Fall With the Flowmies | image_pick.py | muse-spark-1.3-contributor | 1830 |
| 2026-11-04 | image gate — lead-sheet ingest: All Genres Book Club | image_pick.py | muse-spark-1.3-contributor | 2865 |
| 2026-11-04 | image gate — lead-sheet ingest: 82Parris First Friday opening | image_pick.py | muse-spark-1.3-contributor | 3607 |
| 2026-11-04 | image gate — lead-sheet ingest: Maine Irish Song Project | image_pick.py | muse-spark-1.3-contributor | 1486 |
| 2026-11-04 | image gate — lead-sheet ingest: A Backwards Bloom | image_pick.py | muse-spark-1.3-contributor | 1930 |
| 2026-11-04 | peephole people-gate stamping (15-min cron) | photo_people_stamp.py | muse-spark-1.3 | 3863 |
| 2026-11-04 | image gate — batch-2 lead-sheet ingest: Fall Cookie Decorating | image_pick.py | muse-spark-1.3-contributor | 2329 |
| 2026-11-04 | image gate — batch-2 lead-sheet ingest: Performers Showcase at Flourish | image_pick.py | muse-spark-1.3-contributor | 1520 |
| 2026-11-04 | image gate — batch-2 lead-sheet ingest: Sparrow at CLR | image_pick.py | muse-spark-1.3-contributor | 1598 |
| 2026-11-04 | image gate — batch-2 lead-sheet ingest: Time & Tide Maker Pop-Ups | image_pick.py | muse-spark-1.3-contributor | 1730 |
| 2026-11-04 | image gate — batch-2 lead-sheet ingest: Ye Olde Holiday Shoppe | image_pick.py | muse-spark-1.3-contributor | 1184 |
| 2026-11-04 | image gate — batch-2 lead-sheet ingest: Let it Snow (planetarium) | image_pick.py | muse-spark-1.3-contributor | 1537 |
| 2026-11-04 | image gate — batch-2 lead-sheet ingest: Worlds of Ice (planetarium) | image_pick.py | muse-spark-1.3-contributor | 1595 |
| 2026-11-04 | image gate — batch-2 lead-sheet ingest: Mystery of the Christmas Star | image_pick.py | muse-spark-1.3-contributor | 1182 |
| 2026-11-04 | image gate — batch-2 lead-sheet ingest: 3-2-1 Liftoff (planetarium) | image_pick.py | muse-spark-1.3-contributor | 1928 |
| 2026-11-04 | image gate — batch-2 lead-sheet ingest: David Corson | image_pick.py | muse-spark-1.3-contributor | 1255 |
| 2026-11-04 | image gate — batch-3 lead-sheet ingest: Wells Christmas Parade (pick: cand-slide1.jpg, event promo, suitability 10, applied to event 3003) | image_pick.py | muse-spark-1.3-contributor | 1328 |
| 2026-11-04 | image gate — batch-3 lead-sheet ingest: Brick Store Inside History (pick: cand-square.png, event promo, suitability 5, applied to event 3002) | image_pick.py | muse-spark-1.3-contributor | 1244 |
| 2026-11-04 | image gate — batch-3 footprint ingest: 317 Main Bluegrass Jam (pick: cand-bluegrass.png, event promo, suitability 10, applied to event 3008) | image_pick.py | muse-spark-1.3-contributor | 2514 |
2026-11-04 | list-check-2 december | dec_spark.py | muse-spark-1.3-contributor | 4269
2026-11-04 | list-check-2 january | spark_pairs.py | muse-spark-1.3-contributor | 4760
2026-11-04 | list-check-2 january | spark_pairs2.py | muse-spark-1.3-contributor | 3002
2026-11-04 | list-check-2 february | feb_spark.py | muse-spark-1.3-contributor | 3342
2026-11-04 | list-check-2 november | spark_pairs.py | muse-spark-1.3-contributor | 4358
2026-11-04 | list-check-2 march | mar_spark.py | muse-spark-1.3-contributor | 5069
2026-11-04 | batch4 celtics hero | image_pick.py | muse-spark-1.3-contributor | 8312
2026-11-04 | list-check-2 celtics-march hero gate | image_pick.py | muse-spark-1.3-contributor | 7210
2026-11-04 | batch4 longtail image gate (33rd Annual Sparkle Celebration) | image_pick.py | muse-spark-1.3-contributor | 1054
2026-11-04 | batch4 longtail image gate (2026 Gateway Holiday Market) | image_pick.py | muse-spark-1.3-contributor | 1601
2026-11-04 | batch4 longtail image gate (Lighting of the Anchorage Inn) | image_pick.py | muse-spark-1.3-contributor | 1908
2026-11-04 | batch4 longtail image gate (Nubble Lighthouse Holiday Lights) | image_pick.py | muse-spark-1.3-contributor | 1688
2026-11-04 | batch4 longtail image gate (IHC Annual Craft Fair) | image_pick.py | muse-spark-1.3-contributor | 1823
2026-11-04 | batch4 longtail image gate (Rosemont + Caravan Artist Market) | image_pick.py | muse-spark-1.3-contributor | 1257
2026-11-04 | batch4 longtail image gate (Cozy Holiday Market at Mare Brook Farm) | image_pick.py | muse-spark-1.3-contributor | 1220
2026-11-04 | batch4 longtail image gate (Mid-Coast Audubon Ecological Gardening 101) | image_pick.py | muse-spark-1.3-contributor | 3739
2026-11-04 | batch4 longtail image gate (Wild Fiber Basketry) | image_pick.py | muse-spark-1.3-contributor | 1251
2026-11-04 | batch4 longtail image gate (Walk Through Bethlehem) | image_pick.py | muse-spark-1.3-contributor | 1728
2026-11-04 | batch4 longtail image gate (STEMusic Takes Flight) | image_pick.py | muse-spark-1.3-contributor | 2113
2026-11-04 | batch4 longtail image gate (State Street Church Holiday Fair) | image_pick.py | muse-spark-1.3-contributor | 1467
2026-11-04 | batch4 longtail image gate (Annual Celtic Fair 2026) | image_pick.py | muse-spark-1.3-contributor | 1528
2026-11-04 | list-check-2 longtail jan-feb image gate (12 events) | image_pick.py | muse-spark-1.3-contributor | 24035
2026-11-04 | list-check-2 december-exhaustive | dec2_spark.py | muse-spark-1.3-contributor | 1668
2026-11-04 | list-check-2 november-exhaustive | spark_residue.py | muse-spark-1.3-contributor | 3893
2026-11-04 | list-check-2 southworth image gate (test run) | image_pick.py | muse-spark-1.3-contributor | 1709
2026-11-04 | list-check-2 southworth image gate (32 show images) | image_pick.py | muse-spark-1.3-contributor | 43842
2026-11-04 | list-check-2 southworth image gate (2 retries after null-content crashes) | image_pick.py | muse-spark-1.3-contributor | 2836
2026-11-04 | list-check-2 march longtail image gate (15 runs) | image_pick.py | muse-spark-1.3-contributor | 30677
2026-11-04 | list-check-2 january-exhaustive | spark_jan2.py | muse-spark-1.3-contributor | 2733
2026-11-04 | list-check-2 february-exhaustive | feb2_spark.py | muse-spark-1.3-contributor | 5839
2026-11-04 | list-check-2 march-exhaustive | mar2_spark.py | muse-spark-1.3-contributor | 3626
2026-11-04 | daily sweep listing extraction — SPACE (attribution: scheduled sweep run) | sweep_extract.py | muse-spark-1.3 | 0 | FAILED at page fetch (egress timeout, same as Nov 1-2); manual search read used
2026-11-04 | daily sweep listing extraction — Geno's Rock Club | sweep_extract.py | muse-spark-1.3-contributor + muse-wonder-1.0 | 15734
2026-11-04 | daily sweep drift check — Geno's Rock Club | drift_watch.py | deterministic | 0
2026-11-04 | phase2 backfill image gating — 4 events (2 applied: Danielle Dior Trivia 2973 suitability 10, Studio Expressive Art Nite 2980 suitability 9; 2971/2972 candidate downloads failed, 0 tokens) | image_pick.py | muse-spark-1.3-contributor | 3425
2026-11-04 | list-check-2 residue-november ingest — image gating, 1 candidate (Turkey Trot Tune Up RunSignup banner scored 3, logo/icon, rejected; row ships without image) | image_pick.py | muse-spark-1.3-contributor | 1455
2026-11-04 | list-check-2 residue-december ingest — image gating, 5 candidates (4 applied: Polar Express promo 10, Shen Yun promo 10, Kennerley portrait 8, Bath Old Fashioned Christmas venue photo 6; Caravan vendor-call graphic scored 2, logo/icon, rejected — Caravan rows ship without image) | image_pick.py | muse-spark-1.3-contributor | 10872
2026-11-04 | list-check-2 residue-february ingest — image gating, 5 candidates (all applied: PSO Landslide promo 10, International Folk Dance flyer 10, Bar Harbor Contra photo 10, English Country Dancing photo 8, Lewiston Contra photo 8) | image_pick.py | muse-spark-1.3-contributor | 8796
2026-11-04 | backfill gap-t3-ac image gating — event 2786 (pick: venue photo 5) | image_pick.py | muse-spark-1.3-contributor | 2266
2026-11-04 | backfill gap-t3-ac image gating — event 3107 (pick: event-related photo 9) | image_pick.py | muse-spark-1.3-contributor | 4320
2026-11-04 | backfill gap-t3-ac image gating — event 3108 (pick: event-related photo 8) | image_pick.py | muse-spark-1.3-contributor | 2953
2026-11-04 | backfill gap-t3-ac image gating — event 3109 (pick: event-related photo 8) | image_pick.py | muse-spark-1.3-contributor | 1681
2026-11-04 | backfill gap-t3-ac image gating — event 3110 (pick: event-related photo 8) | image_pick.py | muse-spark-1.3-contributor | 2217
2026-11-04 | backfill gap-t3-ac image gating — event 3111 (pick: performer photo 8) | image_pick.py | muse-spark-1.3-contributor | 2029
2026-11-04 | backfill gap-t3-ac image gating — event 3199 (pick: event-related photo 9) | image_pick.py | muse-spark-1.3-contributor | 2097
2026-11-04 | backfill gap-t3-ac image gating — event 3302 (pick: event promo or flyer 10) | image_pick.py | muse-spark-1.3-contributor | 3215
2026-11-04 | backfill gap-t3-ac image gating — event 3303 (pick: event promo or flyer 10) | image_pick.py | muse-spark-1.3-contributor | 3089
2026-11-04 | backfill gap-t3-ac image gating — event 3304 (pick: event promo or flyer 10) | image_pick.py | muse-spark-1.3-contributor | 3025
2026-11-04 | backfill gap-t3-ac image gating — event 3305 (pick: event promo or flyer 10) | image_pick.py | muse-spark-1.3-contributor | 2864
2026-11-04 | backfill gap-t3-ac image gating — event 3306 (pick: event promo or flyer 10) | image_pick.py | muse-spark-1.3-contributor | 3109
2026-11-04 | backfill gap-t3-ac image gating — event 3308 (pick: event-related photo 8) | image_pick.py | muse-spark-1.3-contributor | 3250
2026-11-04 | backfill gap-t3-ac image gating — event 3674 (pick: logo or icon 3) | image_pick.py | muse-spark-1.3-contributor | 2111
2026-11-04 | backfill gap-t3-ac image gating — event 3676 (pick: performer photo 8) | image_pick.py | muse-spark-1.3-contributor | 4821
2026-11-04 | backfill gap-t3-ac image gating — event 3677 (pick: event-related photo 8) | image_pick.py | muse-spark-1.3-contributor | 3721
2026-11-04 | backfill gap-t3-ac image gating — event 3679 (pick: performer photo 8) | image_pick.py | muse-spark-1.3-contributor | 1269
2026-11-04 | backfill gap-t3-ac image gating — event 3680 (pick: event promo or flyer 4) | image_pick.py | muse-spark-1.3-contributor | 4124
2026-11-04 | backfill gap-t3-ac image gating — event 3681 (pick: event-related photo 8) | image_pick.py | muse-spark-1.3-contributor | 2263
2026-11-04 | backfill gap-t3-ac image gating — event 3682 (pick: event-related photo 8) | image_pick.py | muse-spark-1.3-contributor | 3726
2026-11-04 | backfill gap-t3-ac image gating — event 3724 (pick: event-related photo 8) | image_pick.py | muse-spark-1.3-contributor | 1631
2026-11-04 | backfill gap-t3-ac image gating — event 3725 (pick: event-related photo 7) | image_pick.py | muse-spark-1.3-contributor | 1934
2026-11-04 | backfill gap-t3-ac image gating — event 3759 (pick: event-related photo 8) | image_pick.py | muse-spark-1.3-contributor | 1590
2026-11-04 | backfill gap-t3-ac image gating — event 3766 (pick: event-related photo 8) | image_pick.py | muse-spark-1.3-contributor | 1507
2026-11-04 | backfill gap-t3-ac image gating — event 3771 (pick: event-related photo 8) | image_pick.py | muse-spark-1.3-contributor | 8299
2026-11-04 | backfill gap-t3-ac image gating — event 3775 (pick: event promo or flyer 10) | image_pick.py | muse-spark-1.3-contributor | 5417
2026-11-04 | backfill gap-t3-ac image gating — event 3781 (pick: unrelated 0) | image_pick.py | muse-spark-1.3-contributor | 2169
2026-11-04 | backfill gap-t3-ac image gating — event 3782 (pick: event promo or flyer 8) | image_pick.py | muse-spark-1.3-contributor | 2148
2026-11-04 | backfill gap-t3-ac image gating — event 3784 (pick: event-related photo 9) | image_pick.py | muse-spark-1.3-contributor | 2160
2026-11-04 | backfill gap-t3-ac image gating — event 3786 (pick: logo or icon 3) | image_pick.py | muse-spark-1.3-contributor | 2427
2026-11-04 | backfill gap-t3-ac image gating — event 3787 (pick: event promo or flyer 10) | image_pick.py | muse-spark-1.3-contributor | 1769
2026-11-04 | backfill gap-t3-ac image gating — event 3788 (pick: event promo or flyer 10) | image_pick.py | muse-spark-1.3-contributor | 2171
2026-11-04 | backfill gap-t3-ac image gating — event 3799 (pick: performer photo 8) | image_pick.py | muse-spark-1.3-contributor | 1756
2026-11-04 | backfill gap-t3-ac image gating — event 3801 (pick: event-related photo 5) | image_pick.py | muse-spark-1.3-contributor | 2096
2026-11-04 | backfill gap-t3-ac image gating — event 3802 (pick: event-related photo 8) | image_pick.py | muse-spark-1.3-contributor | 2081
2026-11-04 | backfill gap-t3-ac image gating — event 3807 (pick: event-related photo 8) | image_pick.py | muse-spark-1.3-contributor | 1238
2026-11-04 | backfill gap-t3-ac image gating — event 3808 (pick: event-related photo 7) | image_pick.py | muse-spark-1.3-contributor | 2821
2026-11-04 | backfill gap-t3-ac image gating — event 3820 (pick: performer photo 8) | image_pick.py | muse-spark-1.3-contributor | 1888
2026-11-04 | backfill gap-t3-ac image gating — TRANCHE TOTAL (38 runs) | image_pick.py | muse-spark-1.3-contributor | 103252
2026-11-04 | backfill full-scan tranche t3-ab image gating — 27 image_pick runs (25 groups + midday-books + deffa-generic split fdb/kennebunk); applied picks >=5 for 26 groups (team photos for Bates/Colby/Bowdoin/Thomas/UNE/Husson, PortTIX show art x3, DEFFA series art, parkrun course photos, Jesup storytime photo, ArtWaves improv collage, ArtVan flyer, toboggan + railers photos); midday-books candidate gated generic stock 3, rejected | image_pick.py | muse-spark-1.3-contributor | 99837
2026-11-04 | backfill gap-t1-aa image gating — pass 1, mechanical-pull candidates (31 applied) | image_pick.py | muse-spark-1.3-contributor | 229809
2026-11-04 | backfill gap-t1-aa image gating — ladder wave 1, 20 runs (10 applied) | image_pick.py | muse-spark-1.3-contributor | 36066
2026-11-04 | backfill gap-t1-aa image gating — ladder wave 2, 16 runs (9 applied) | image_pick.py | muse-spark-1.3-contributor | 31659
2026-11-04 | backfill gap-t1-aa image gating — event 2971 re-gate with valid Eventbrite file (unrelated 2, not applied) | image_pick.py | muse-spark-1.3-contributor | 3004
2026-11-04 | backfill gap-t1-aa image gating — TRANCHE TOTAL (133 runs) | image_pick.py | muse-spark-1.3-contributor | 300538
2026-11-04 | backfill gap-t1-aa image gating — KFL venue photo re-check, events 3354+3357 (venue photo 8, both applied) | image_pick.py | muse-spark-1.3-contributor | 3894
2026-11-04 | backfill t1ab image gating — event 2915 (Learn Before You Go: Macbeth with Bob Gallon) pick=cand-0.jpg suitability=6 type=event-related photo | image_pick.py | muse-spark-1.3-contributor | 2546
2026-11-04 | backfill t1ab image gating — event 2920 (Building a Resilient Flower Farming Business) pick=cand-0.jpg suitability=5 type=generic stock | image_pick.py | muse-spark-1.3-contributor | 3494
2026-11-04 | backfill t1ab image gating — event 2954 (Green Drinks @ Maine Needs) pick=cand-1.jpg suitability=5 type=generic stock | image_pick.py | muse-spark-1.3-contributor | 2948
2026-11-04 | backfill t1ab image gating — event 2981 (Studio Expressive Art Nite at Flourish) pick=cand-0.jpg suitability=5 type=event-related photo | image_pick.py | muse-spark-1.3-contributor | 3860
2026-11-04 | backfill t1ab image gating — event 3006 (Wanderhome) pick=cand-1.jpg suitability=2 type=logo or icon | image_pick.py | muse-spark-1.3-contributor | 4437
2026-11-04 | backfill t1ab image gating — event 3007 (Youth Writing Workshop) pick=cand-0.jpg suitability=0 type=unrelated | image_pick.py | muse-spark-1.3-contributor | 3359
2026-11-04 | backfill t1ab image gating — event 3011 (Open Mic Night) pick=cand-0.png suitability=10 type=event promo or flyer | image_pick.py | muse-spark-1.3-contributor | 7355
2026-11-04 | backfill t1ab image gating — event 3013 (Note by Note Student Showcase ) pick=cand-0.jpg suitability=10 type=event promo or flyer | image_pick.py | muse-spark-1.3-contributor | 2022
2026-11-04 | backfill t1ab image gating — event 3015 (Bluegrass Jam & Community Pizza Night @ Maine Beer Company) pick=cand-2.png suitability=7 type=event-related photo | image_pick.py | muse-spark-1.3-contributor | 6612
2026-11-04 | backfill t1ab image gating — event 3021 (Graphic Novel Club) pick=cand-0.png suitability=10 type=event promo or flyer | image_pick.py | muse-spark-1.3-contributor | 1136
2026-11-04 | backfill t1ab image gating — event 3022 (Exploring the Odyssey) pick=cand-0.png suitability=10 type=event promo or flyer | image_pick.py | muse-spark-1.3-contributor | 985
2026-11-04 | backfill t1ab image gating — event 3023 (Find a Scholarship That's Right for You!) pick=cand-0.png suitability=10 type=event promo or flyer | image_pick.py | muse-spark-1.3-contributor | 901
2026-11-04 | backfill t1ab image gating — event 3032 (Friendsgiving!) pick=cand-0.jpg suitability=3 type=logo or icon | image_pick.py | muse-spark-1.3-contributor | 1043
2026-11-04 | backfill t1ab image gating — event 3062 (UMaine Augusta Men's Basketball vs Central Maine CC) pick=cand-0.jpg suitability=3 type=logo or icon | image_pick.py | muse-spark-1.3-contributor | 1748
2026-11-04 | backfill t1ab image gating — event 3134 (2026 Freedom & Opportunity Luncheon) pick=cand-0.png suitability=10 type=event promo or flyer | image_pick.py | muse-spark-1.3-contributor | 7778
2026-11-04 | backfill t1ab image gating — event 3137 (Bess Jacques & the Strays) pick=cand-0.jpg suitability=8 type=performer photo | image_pick.py | muse-spark-1.3-contributor | 3402
2026-11-04 | backfill t1ab image gating — event 3141 (Augusta's Largest Indoor Flea Market) pick=cand-0.jpg suitability=8 type=venue photo | image_pick.py | muse-spark-1.3-contributor | 1648
2026-11-04 | backfill t1ab image gating — event 3144 (Silent Book Club) pick=cand-0.png suitability=10 type=event promo or flyer | image_pick.py | muse-spark-1.3-contributor | 3696
2026-11-04 | backfill t1ab image gating — event 3146 (Wicked Funny Comedy Series: Featuring Adam Hatch and Friends) pick=cand-0.png suitability=2 type=unrelated | image_pick.py | muse-spark-1.3-contributor | 10083
2026-11-04 | backfill t1ab image gating — event 3153 (Camden Climate Conversations) pick=cand-0.png suitability=10 type=event promo or flyer | image_pick.py | muse-spark-1.3-contributor | 1183
2026-11-04 | backfill t1ab image gating — event 3165 (Crafternoons) pick=cand-0.jpg suitability=8 type=event-related photo | image_pick.py | muse-spark-1.3-contributor | 1315
2026-11-04 | backfill t1ab image gating — event 3166 (Threads & Tales) pick=cand-0.jpg suitability=6 type=event-related photo | image_pick.py | muse-spark-1.3-contributor | 2302
2026-11-04 | backfill t1ab image gating — event 3171 (Latin Dance Class) pick=cand-0.jpg suitability=2 type=logo or icon | image_pick.py | muse-spark-1.3-contributor | 1058
2026-11-04 | backfill t1ab image gating — event 3173 (You're Speaking My Language: Spanish + Filipino) pick=cand-0.jpg suitability=2 type=logo or icon | image_pick.py | muse-spark-1.3-contributor | 1123
2026-11-04 | backfill t1ab image gating — event 3331 (Beginner (PART ONE) Wheel Throwing 6-week Artist Series) pick=cand-0.jpg suitability=8 type=event-related photo | image_pick.py | muse-spark-1.3-contributor | 8172
2026-11-04 | backfill t1ab image gating — event 3332 (Metalsmithing for Beginners Tuesday 6-week Artist Series) pick=cand-0.jpg suitability=8 type=event-related photo | image_pick.py | muse-spark-1.3-contributor | 9560
2026-11-04 | backfill t1ab image gating — event 3359 (Kindness Crew) pick=cand-0.png suitability=10 type=event promo or flyer | image_pick.py | muse-spark-1.3-contributor | 3910
2026-11-04 | backfill t1ab image gating — event 3360 (Tech Talk Line) pick=cand-0.png suitability=10 type=event promo or flyer | image_pick.py | muse-spark-1.3-contributor | 2615
2026-11-04 | backfill t1ab image gating — event 3361 (In Stitches) pick=cand-0.png suitability=10 type=event promo or flyer | image_pick.py | muse-spark-1.3-contributor | 2802
2026-11-04 | backfill t1ab image gating — event 3362 (Ukulele Group) pick=cand-0.png suitability=10 type=event promo or flyer | image_pick.py | muse-spark-1.3-contributor | 3259
2026-11-04 | backfill t1ab image gating — event 3363 (Reader's Choice Evening Book Club) pick=cand-0.png suitability=1 type=logo or icon | image_pick.py | muse-spark-1.3-contributor | 1331
2026-11-04 | backfill t1ab image gating — event 3364 (Out With the Old, In With the New-Year: How to Safely Dispos) pick=cand-0.png suitability=10 type=event promo or flyer | image_pick.py | muse-spark-1.3-contributor | 4510
2026-11-04 | backfill t1ab image gating — event 3365 (Design a Native-Plant Garden) pick=cand-0.png suitability=2 type=logo or icon | image_pick.py | muse-spark-1.3-contributor | 1362
2026-11-04 | backfill t1ab image gating — event 3366 (Teen and Tween Crafting Saturday: Cat in the Leaves Scavenge) pick=cand-0.png suitability=10 type=event promo or flyer | image_pick.py | muse-spark-1.3-contributor | 2616
2026-11-04 | backfill t1ab image gating — event 3367 (The Dragon Hunters and Treasure Seekers Guild (Teen and Twee) pick=cand-0.png suitability=10 type=event promo or flyer | image_pick.py | muse-spark-1.3-contributor | 2856
2026-11-04 | backfill t1ab image gating — event 3368 (KFL's Trivia Night) pick=cand-0.png suitability=10 type=event promo or flyer | image_pick.py | muse-spark-1.3-contributor | 2852
2026-11-04 | backfill t1ab image gating — event 3374 (All Ages Storytime) pick=cand-0.png suitability=10 type=event promo or flyer | image_pick.py | muse-spark-1.3-contributor | 1066
2026-11-04 | backfill t1ab image gating — event 3375 (Baby Storytime) pick=cand-0.png suitability=10 type=event promo or flyer | image_pick.py | muse-spark-1.3-contributor | 1114
2026-11-04 | backfill t1ab image gating — event 3376 (MML Tech Desk) pick=cand-0.png suitability=10 type=event promo or flyer | image_pick.py | muse-spark-1.3-contributor | 1230
2026-11-04 | backfill t1ab image gating — event 3377 (Tom Bell : Cinemascope and The Crystal Street Bridge) pick=cand-0.png suitability=10 type=event promo or flyer | image_pick.py | muse-spark-1.3-contributor | 1020
2026-11-04 | backfill t1ab image gating — event 3378 (Author Talk with Lewis Robinson) pick=cand-0.png suitability=10 type=event promo or flyer | image_pick.py | muse-spark-1.3-contributor | 1011
2026-11-04 | backfill t1ab image gating — event 3385 (Mary Beth Keane: Whale Harbor) pick=cand-0.png suitability=10 type=event promo or flyer | image_pick.py | muse-spark-1.3-contributor | 9503
2026-11-04 | backfill t1ab image gating — event 3386 (Beginner / Intermediate Irish Session) pick=cand-0.jpg suitability=10 type=event promo or flyer | image_pick.py | muse-spark-1.3-contributor | 3750
2026-11-04 | backfill t1ab image gating — event 3492 (Destination Storytime at Redbank Community Center) pick=cand-0.png suitability=2 type=logo or icon | image_pick.py | muse-spark-1.3-contributor | 5878
2026-11-04 | backfill t1ab image gating — event 3493 (Knit Chat [Evening]) pick=cand-0.png suitability=2 type=logo or icon | image_pick.py | muse-spark-1.3-contributor | 5936
2026-11-04 | backfill t1ab image gating — event 3494 (Mahjong Group) pick=cand-0.png suitability=2 type=logo or icon | image_pick.py | muse-spark-1.3-contributor | 6369
2026-11-04 | backfill t1ab image gating — event 3495 (Evening Book Group [online]) pick=cand-0.png suitability=2 type=logo or icon | image_pick.py | muse-spark-1.3-contributor | 5965
2026-11-04 | backfill t1ab image gating — event 3496 (Family Storytime) pick=cand-0.png suitability=2 type=logo or icon | image_pick.py | muse-spark-1.3-contributor | 6093
2026-11-04 | backfill t1ab image gating — event 3512 (2026 Robert Talbot Civil Rights Speaker Series) pick=cand-0.png suitability=1 type=logo or icon | image_pick.py | muse-spark-1.3-contributor | 1822
2026-11-04 | backfill t1ab image gating — event 3513 (Gallery and Museum Management Presentation by Diana Baunbach) pick=cand-0.png suitability=1 type=logo or icon | image_pick.py | muse-spark-1.3-contributor | 1518
2026-11-04 | backfill t1ab image gating — event 3514 (National Theater Live Broadcast – Playboy of the Western Wor) pick=cand-0.jpg suitability=9 type=event-related photo | image_pick.py | muse-spark-1.3-contributor | 4382
2026-11-04 | backfill t1ab image gating — event 3515 (Tick and Mosquito Pesticide Applicator Training) pick=cand-0.png suitability=1 type=logo or icon | image_pick.py | muse-spark-1.3-contributor | 1626
2026-11-04 | backfill t1ab image gating — event 3531 (Bowdoin Men's Basketball vs Endicott College) pick=cand-0.jpg suitability=9 type=performer photo | image_pick.py | muse-spark-1.3-contributor | 4060
2026-11-04 | backfill tranche t3-aa image gating — 66 gate runs over 78 events (70 images applied, 2 generic-stock proposals not applied, 6 no passing candidate; token total from pick.json token_totals + e3178 first-run stdout 2,087; one interrupted 3187 run unrecorded) | image_pick.py | muse-spark-1.3-contributor | 266332
2026-11-04 | backfill t1ab image gating — event 3532 (Bowdoin Men's Ice Hockey vs University of Saint Joseph (Conn) pick=cand-0.jpg suitability=9 type=performer photo | image_pick.py | muse-spark-1.3-contributor | 3964
2026-11-04 | backfill t1ab image gating — event 3534 (Bowdoin Women's Basketball vs Smith College) pick=cand-1.jpg suitability=8 type=performer photo | image_pick.py | muse-spark-1.3-contributor | 4018
2026-11-04 | backfill t1ab image gating — event 3540 (Bowdoin Football vs Colby) pick=cand-0.jpg suitability=8 type=event-related photo | image_pick.py | muse-spark-1.3-contributor | 3672
2026-11-04 | backfill t1ab image gating — event 3549 (Game On!) pick=cand-0.jpg suitability=2 type=logo or icon | image_pick.py | muse-spark-1.3-contributor | 1110
2026-11-04 | backfill t1ab image gating — event 3550 (Walking in Winter) pick=cand-0.jpg suitability=2 type=logo or icon | image_pick.py | muse-spark-1.3-contributor | 1176
2026-11-04 | backfill t1ab image gating — event 3552 (Emergency Warming Center Volunteer Training) pick=cand-0.jpg suitability=2 type=logo or icon | image_pick.py | muse-spark-1.3-contributor | 4692
2026-11-04 | backfill t1ab image gating — event 3553 (Mahjong for All) pick=cand-0.jpg suitability=2 type=logo or icon | image_pick.py | muse-spark-1.3-contributor | 1241
2026-11-04 | backfill t1ab image gating — event 3556 (French Circle) pick=cand-0.jpg suitability=2 type=logo or icon | image_pick.py | muse-spark-1.3-contributor | 1328
2026-11-04 | backfill t1ab image gating — event 3560 (Songs of Protest) pick=cand-0.png suitability=2 type=logo or icon | image_pick.py | muse-spark-1.3-contributor | 1934
2026-11-04 | backfill t1ab image gating — event 3562 (Fingerstyle Ukulele Revisited) pick=cand-1.jpg suitability=3 type=event-related photo | image_pick.py | muse-spark-1.3-contributor | 15026
2026-11-04 | backfill t1ab image gating — event 3563 (Maine Pops Flute Choir at St. Nicholas Episcopal Church) pick=cand-1.jpg suitability=4 type=generic stock | image_pick.py | muse-spark-1.3-contributor | 10493
2026-11-04 | backfill t1ab image gating — event 3564 (Specialty Food Market at Halo (Nov 15)) pick=cand-0.jpg suitability=3 type=logo or icon | image_pick.py | muse-spark-1.3-contributor | 1706
2026-11-04 | backfill t1ab image gating — event 3568 (13th Annual Wells Veterans Day 5K) pick=cand-1.jpg suitability=5 type=generic stock | image_pick.py | muse-spark-1.3-contributor | 3252
2026-11-04 | backfill t1ab image gating — event 3569 (Turkey Trot Tune Up and Kid's Turkey Dash) pick=cand-0.jpg suitability=3 type=logo or icon | image_pick.py | muse-spark-1.3-contributor | 4187
2026-11-04 | backfill t1ab image gating — event 3665 (Sascha Braunig: Wrist Painter) pick=cand-2.jpg suitability=9 type=event-related photo | image_pick.py | muse-spark-1.3-contributor | 6506
2026-11-04 | backfill t1ab image gating — event 3821 (NCAA Division III East Regional Cross Country Championships) pick=cand-1.jpg suitability=8 type=event-related photo | image_pick.py | muse-spark-1.3-contributor | 5729
2026-11-04 | backfill t1ab image gating (retry after null-content crash) — event 3136 (Jake McKelvie & His Old New Band) pick=cand-0.jpg suitability=0 type=unrelated | image_pick.py | muse-spark-1.3-contributor | 3833
2026-11-04 | backfill t1ab image gating (retry after null-content crash) — event 3533 (Colby Men's Basketball vs University of Southern Maine) pick=cand-1.jpg suitability=5 type=performer photo | image_pick.py | muse-spark-1.3-contributor | 3754
2026-11-04 | backfill t1ab image gating (retry after null-content crash) — event 3167 (Mid-Week Matinee) pick=cand-0.jpg suitability=8 type=event promo or flyer | image_pick.py | muse-spark-1.3-contributor | 2927
2026-11-04 | backfill-2026-11-04 tranche t2 image gating — 68 image_pick runs over 65 events (37 applied: library/venue event flyers and promos at 8–10, Rising Tide venue photo 8, First Friday art-walk photo 7; 4 generic-stock picks >=5 recorded as proposals, not applied; UMaine/SPPL/athletics candidates were icons/logos and scored 0–2) | image_pick.py | muse-spark-1.3-contributor | 325206
2026-11-04 | backfill t1ab image gating round 2 (venue/performer fallbacks) — event 3006 (Wanderhome) pick=cand-3.jpg suitability=10 type=event promo or flyer | image_pick.py | muse-spark-1.3-contributor | 1786
2026-11-04 | backfill t1ab image gating round 2 (venue/performer fallbacks) — event 3007 (Youth Writing Workshop) pick=cand-3.jpg suitability=8 type=venue photo | image_pick.py | muse-spark-1.3-contributor | 1236
2026-11-04 | backfill t1ab image gating round 2 (venue/performer fallbacks) — event 3031 (Pub Run: Apres) pick=cand-0.jpg suitability=8 type=venue photo | image_pick.py | muse-spark-1.3-contributor | 3949
2026-11-04 | backfill t1ab image gating round 2 (venue/performer fallbacks) — event 3032 (Friendsgiving!) pick=cand-1.jpg suitability=8 type=venue photo | image_pick.py | muse-spark-1.3-contributor | 2662
2026-11-04 | backfill t1ab image gating round 2 (venue/performer fallbacks) — event 3033 (Pub Run: Shipyard Brewing) pick=cand-1.jpg suitability=8 type=venue photo | image_pick.py | muse-spark-1.3-contributor | 3708
2026-11-04 | backfill t1ab image gating round 2 (venue/performer fallbacks) — event 3136 (Jake McKelvie & His Old New Band) pick=cand-2.jpg suitability=8 type=performer photo | image_pick.py | muse-spark-1.3-contributor | 3559
2026-11-04 | backfill t1ab image gating round 2 (venue/performer fallbacks) — event 3171 (Latin Dance Class) pick=cand-1.jpg suitability=8 type=venue photo | image_pick.py | muse-spark-1.3-contributor | 1701
2026-11-04 | backfill t1ab image gating round 2 (venue/performer fallbacks) — event 3173 (You're Speaking My Language: Spanish + Filipino) pick=cand-1.jpg suitability=8 type=venue photo | image_pick.py | muse-spark-1.3-contributor | 1252
2026-11-04 | backfill t1ab image gating round 2 (venue/performer fallbacks) — event 3363 (Reader's Choice Evening Book Club) pick=cand-1.jpg suitability=8 type=venue photo | image_pick.py | muse-spark-1.3-contributor | 1859
2026-11-04 | backfill t1ab image gating round 2 (venue/performer fallbacks) — event 3365 (Design a Native-Plant Garden) pick=cand-1.jpg suitability=8 type=venue photo | image_pick.py | muse-spark-1.3-contributor | 1927
2026-11-04 | backfill t1ab image gating round 2 (venue/performer fallbacks) — event 3492 (Destination Storytime at Redbank Community Center) pick=cand-4.jpg suitability=4 type=venue photo | image_pick.py | muse-spark-1.3-contributor | 1701
2026-11-04 | backfill t1ab image gating round 2 (venue/performer fallbacks) — event 3493 (Knit Chat [Evening]) pick=cand-4.jpg suitability=7 type=venue photo | image_pick.py | muse-spark-1.3-contributor | 1968
2026-11-04 | backfill t1ab image gating round 2 (venue/performer fallbacks) — event 3494 (Mahjong Group) pick=cand-4.jpg suitability=7 type=venue photo | image_pick.py | muse-spark-1.3-contributor | 2040
2026-11-04 | backfill t1ab image gating round 2 (venue/performer fallbacks) — event 3496 (Family Storytime) pick=cand-4.jpg suitability=7 type=venue photo | image_pick.py | muse-spark-1.3-contributor | 2082
2026-11-04 | backfill t1ab image gating round 2 (venue/performer fallbacks) — event 3512 (2026 Robert Talbot Civil Rights Speaker Series) pick=cand-1.jpg suitability=8 type=venue photo | image_pick.py | muse-spark-1.3-contributor | 1545
2026-11-04 | backfill t1ab image gating round 2 (venue/performer fallbacks) — event 3515 (Tick and Mosquito Pesticide Applicator Training) pick=cand-0.png suitability=1 type=logo or icon | image_pick.py | muse-spark-1.3-contributor | 1191
2026-11-04 | backfill t1ab image gating round 2 (venue/performer fallbacks) — event 3549 (Game On!) pick=cand-2.jpg suitability=9 type=venue photo | image_pick.py | muse-spark-1.3-contributor | 2883
2026-11-04 | backfill t1ab image gating round 2 (venue/performer fallbacks) — event 3550 (Walking in Winter) pick=cand-1.jpg suitability=8 type=venue photo | image_pick.py | muse-spark-1.3-contributor | 2792
2026-11-04 | backfill t1ab image gating round 2 (venue/performer fallbacks) — event 3551 (What're You Reading?) pick=cand-0.png suitability=8 type=venue photo | image_pick.py | muse-spark-1.3-contributor | 2886
2026-11-04 | backfill t1ab image gating round 2 (venue/performer fallbacks) — event 3552 (Emergency Warming Center Volunteer Training) pick=cand-3.png suitability=8 type=venue photo | image_pick.py | muse-spark-1.3-contributor | 3039
2026-11-04 | backfill t1ab image gating round 2 (venue/performer fallbacks) — event 3553 (Mahjong for All) pick=cand-1.png suitability=8 type=venue photo | image_pick.py | muse-spark-1.3-contributor | 3057
2026-11-04 | backfill t1ab image gating round 2 (venue/performer fallbacks) — event 3556 (French Circle) pick=cand-1.jpg suitability=8 type=venue photo | image_pick.py | muse-spark-1.3-contributor | 3611
2026-11-04 | backfill t1ab image gating round 2 (venue/performer fallbacks) — event 3564 (Specialty Food Market at Halo (Nov 15)) pick=cand-1.jpg suitability=6 type=event-related photo | image_pick.py | muse-spark-1.3-contributor | 2826
2026-11-04 | backfill t1ab image gating round 2 (venue/performer fallbacks) — event 3569 (Turkey Trot Tune Up and Kid's Turkey Dash) pick=cand-2.jpg suitability=8 type=venue photo | image_pick.py | muse-spark-1.3-contributor | 1977
2026-11-04 | card fixer verdict batch (12 images) | card_verdict.py | muse-spark-1.3 | 23422
2026-11-04 | card fixer verdict batch (50 images) | card_verdict.py | muse-spark-1.3 | 118321
2026-11-04 | card fixer verdict batch (50 images) | card_verdict.py | muse-spark-1.3 | 139677
2026-11-04 | card fixer verdict batch (50 images) | card_verdict.py | muse-spark-1.3 | 122808
2026-11-04 | card fixer verdict batch (50 images) | card_verdict.py | muse-spark-1.3 | 118960
2026-11-04 | card fixer verdict batch (50 images) | card_verdict.py | muse-spark-1.3 | 122831
2026-11-04 | card fixer verdict batch (7 images) | card_verdict.py | muse-spark-1.3 | 20179
2026-11-04 | card fixer measure batch (14 images) | card_measure.py | muse-spark-1.3 | 25555
2026-11-04 | card fixer verdict reconciliation — batch lines above undercount: two driver processes were killed mid-run (one duplicate instance, one lock deadlock) with unflushed batches; figure here is the shortfall vs the per-call report.json harvest total of 2,619,735 verdict tokens (incl. one 4,463-token retry on the Fogtown trivia image, which returned unparseable twice) | card_verdict.py | muse-spark-1.3 | 1953537
2026-11-04 | broken-11 fix: image_pick gate for event 92 (3 candidates, pick = event-page og:image, performer photo 10) | image_pick.py | muse-spark-1.3-contributor | 6702
2026-11-04 | heroes-3: image_pick gate for event 2971 Mindful Wellness Walk (2 new Eventbrite page-follow candidates; pick cand-1 event-related photo 7) | image_pick.py | muse-spark-1.3-contributor | 4786
2026-11-04 | heroes-3 CORRECTION: duplicate image_pick gate run for event 2971 (backgrounded first run completed after a foreground re-run; same candidates, same pick cand-1, scored event-related photo 5 in this run vs 7 in the other — gate non-determinism; tokens were spent twice but ledgered once) | image_pick.py | muse-spark-1.3-contributor | 4786
2026-11-04 | heroes-3: image_pick gate for event 3487 Branch Book Group (2 Yelp/Places venue candidates; pick cand-0 venue photo 8, Memorial Branch building) | image_pick.py | muse-spark-1.3-contributor | 5533
2026-11-04 | heroes-3: image_pick gate for event 2972 Pub Run Hardshore (7 venue-site candidates; pick cand-1 venue photo 8, distillery stills) | image_pick.py | muse-spark-1.3-contributor | 15969
2026-11-04 | finder-2844 retrieval: finder_screen of 3 retrieved photos (2 Crawl With US FB album post-lead photos + 1 @moosemandrew IG fan slide) — all belongs=true | finder_screen.py | muse-spark-1.3-contributor | 5905
2026-11-04 | finder-2844 retrieval CORRECTION: the screening line above overstates the run — finder_screen's own report.json run_token_totals show 5,385 total tokens, not 5,905 (the 5,905 figure came from a garbled mid-run delivery of the backgrounded command; the terminal output confirms 5,385). True finder-2844 screening spend: 5,385 | finder_screen.py | muse-spark-1.3-contributor | -520
| 2026-11-04 | peephole people-gate stamping (15-min cron) | photo_people_stamp.py | muse-spark-1.3 | 4401 |

## cardfix2 — 2026-11-04 (card-fixer pass 2, calibrated)
Pass 2 of the event-card fixer: produced + applied the derivatives pass 1 deferred,
graded against Angelo's 15 hand-fixed calibration cards; plus full re-grade of the
pass-1 "fine" pool per his amendment. Backup: smevents-pre-cardfix2-1104.db.
Applied (DB-verified 294/294, all 212 derivative URLs HTTP 200): 294 events —
240 top_banner, 45 stretch, 8 focus_shift, 1 crop_out. Held: 198 images
(contact sheet + state.json in goals/.../hidden_files/cardfix2-2026-11-04/).

| model | calls | tokens | notes |
|---|---|---|---|
| muse-spark-1.3 | 384 | 784,014 | card_measure subject/lockup measures + B focus routing (pipeline usage logs) |
| muse-spark-1.3 | 3 | 7,203 | standalone card_verdict retries: Fogtown Trivia re-verdict 2,212; Bates Veterans 2,781; Graves Book Group 2,210 |
| muse-spark-1.3-contributor | 1,212 | 2,195,317 | screens (791 calls / 1,505,902 tok: 766 fine-pool images re-graded), banner/card gates, boundary audit (66 calls incl. 27 empty-response retries at max_tokens 200) |
| **total** | **1,599** | **2,986,534** | standard 791,217 tok · contributor 2,195,317 tok |

## desktop redesign pass 2 — 2026-11-04 (Spark-diffed mockup match)
Visual diff loop for the desktop homepage neon redesign: live renders at
1440px judged against Angelo's mockup by Contributor; fixes applied per
round. Inputs are the public mockup + our own public homepage renders.

| model | calls | tokens | notes |
|---|---|---|---|
| muse-spark-1.3-contributor | 1 | 11,606 | round 1 diff: live top crop vs mockup (prompt 4,120 / completion 7,486) |
| muse-spark-1.3-contributor | 1 | 11,838 | round 2 diff: post-fix live top crop vs mockup (prompt 4,128 / completion 7,710) |
| muse-spark-1.3-contributor | 1 | 9,307 | round 3 diff (final): post-compaction live top crop vs mockup (prompt 4,148 / completion 5,159) |
| **total** | **3** | **32,751** | pass 2 total |
- 2026-11-04 ~21:47 ET — Desktop DETAIL redesign Spark diff round 1 (Angelo's own live screenshot vs mockup, spark_diff_detail.py): muse-spark-1.3-contributor, 12,088 tokens (4,054 in / 8,034 out incl. 6,502 reasoning) ≈ $0.002. Findings applied selectively after parent measurement review (hero diagnosis accepted, contain remedy rejected; page-width change rejected; rest applied to a fix brief).
- 2026-11-04 ~21:56 ET — Desktop DETAIL redesign Spark DESIGNER spec round 2 (spark_spec_r2.py; Angelo directed 'have Spark do this instead of you' after fix round 1): muse-spark-1.3-contributor, 10,423 tokens (4,168 in / 6,255 out incl. 3,098 reasoning) ≈ $0.002. Spark verdict: three-column grid running all the way down crushes below-fold panels; spec = 344/536/288 grid, paired wide main panels, sidebar 288. Implemented verbatim by a build worker except two fabricated-data items (Doors 6 PM line, All Ages pill — no such fields in our data) and the duplicate bookmark icon.
- 2026-11-04 ~23:00 ET — Desktop GAME detail page Spark DESIGNER spec (spark_spec_game.py; live FH render + game mockup + elements sheet + supplied FINAL art): muse-spark-1.3-contributor, 13,350 tokens (6,634 in / 6,716 out incl. 3,431 reasoning) ≈ $0.003. Spec: game pages get their own layout — 664 main + 520 rail, full-bleed photo hero, FINAL panel on the supplied stadium art, dark records/note/What's Next rail panels, venue card suppressed in favor of Event Details + View on Map. Implemented by a build worker with data exceptions (real records only, live-game state, Add to My Calendar wired to a real .ics).
| 2026-11-05 | muse-spark-1.3 | chat/completions | 592 in / 4,777 out | First-user itinerary email: copy + design consult | ~$0.014 |
| 2026-11-05 | muse-image-1.0 | images/generations | 1 image 1536x640 | First-user itinerary email header art (first call, truncated capture — superseded by re-run) | n/a |
| 2026-11-05 | muse-image-1.0 | images/generations | 1 image 1536x640 | First-user itinerary email header art (final) | n/a |
2026-11-05 | prose sweep Portland venues Geno's listing extraction | sweep_extract.py | muse-wonder-1.0 | 7305
2026-11-05 | prose sweep Portland venues Geno's listing extraction | sweep_extract.py | muse-spark-1.3-contributor | 7347
2026-11-05 | prose sweep Portland venues SPACE listing extraction | sweep_extract.py | muse-wonder-1.0 | 14158
2026-11-05 | prose sweep Portland venues SPACE listing extraction | sweep_extract.py | muse-spark-1.3-contributor | 11057
2026-11-05 | daily sweep Phase 2 image gate (Brickyard Hollow trivia og candidate) | image_pick.py | muse-spark-1.3-contributor | 1255
2026-11-05 | daily sweep Phase 2 image gate (KFL Mah Jongg og candidate) | image_pick.py | muse-spark-1.3-contributor | 2136
2026-11-05 | daily sweep Phase 2 image gate (Portland Farmers' Market og candidate) | image_pick.py | muse-spark-1.3-contributor | 1033
2026-11-05 | heroes-cardfix-new athletics image gating — Colby Women's Ice Hockey (pick: cand-1.jpg, event-related photo, suitability 8, applied to 3822,3823,3826,3827) | image_pick.py | muse-spark-1.3-contributor | 3203
2026-11-05 | heroes-cardfix-new athletics image gating — Colby Men's Ice Hockey (pick: cand-1.jpg, event-related photo, suitability 8, applied to 3824,3825,3828,3829,3830) | image_pick.py | muse-spark-1.3-contributor | 2761
2026-11-05 | heroes-cardfix-new athletics image gating — Maine Maritime Women's Basketball (pick: cand-1.jpg, event-related photo, suitability 8, applied to 3831) | image_pick.py | muse-spark-1.3-contributor | 1736
2026-11-05 | heroes-cardfix-new athletics image gating — Maine Maritime Men's Basketball (pick: cand-1.jpg, event-related photo, suitability 8, applied to 3832) | image_pick.py | muse-spark-1.3-contributor | 1931
2026-11-05 | heroes-cardfix-new athletics image gating — Thomas Men's Ice Hockey (pick: cand-1.jpg, event-related photo, suitability 8, applied to 3834,3839) | image_pick.py | muse-spark-1.3-contributor | 1823
2026-11-05 | heroes-cardfix-new athletics image gating — UMF Women's Basketball (pick: cand-1.png, performer photo, suitability 9, applied to 3840,3841,3843,3844) | image_pick.py | muse-spark-1.3-contributor | 1954
2026-11-05 | heroes-cardfix-new athletics image gating — UMF Men's Basketball (pick: cand-1.png, event-related photo, suitability 9, applied to 3842,3845) | image_pick.py | muse-spark-1.3-contributor | 2960
2026-11-05 | heroes-cardfix-new athletics image gating — UNE Men's Ice Hockey (2 candidates; pick: cand-1.jpg, performer photo, suitability 9, applied to 3846-3849) | image_pick.py | muse-spark-1.3-contributor | 3816
2026-11-05 | heroes-cardfix-new athletics image gating — Southern Maine Women's Basketball (pick: cand-1.jpg, event-related photo, suitability 5, applied to 3854,3855,3860,3863,3865,3866,3867) | image_pick.py | muse-spark-1.3-contributor | 2802
2026-11-05 | heroes-cardfix-new athletics image gating — Southern Maine Field Hockey (2 candidates; gate pick cand-2 suitability 9 not applied — walking shot; cand-1.jpg event-related photo suitability 8 applied to 3897 per action-photo pattern) | image_pick.py | muse-spark-1.3-contributor | 5012
2026-11-05 | heroes-cardfix-new library-usm image gating — event 3871 (Tech Time) pick=cand-tech.png suitability=10 type=event promo or flyer | image_pick.py | muse-spark-1.3-contributor | 1761
2026-11-05 | heroes-cardfix-new library-usm image gating — event 3873 (Thursday Family Fun Play) pick=cand-flyer.png suitability=10 type=event promo or flyer | image_pick.py | muse-spark-1.3-contributor | 1702
2026-11-05 | heroes-cardfix-new library-usm image gating — event 3874 (Living with Grief) pick=cand-grief.png suitability=10 type=event promo or flyer | image_pick.py | muse-spark-1.3-contributor | 2135
2026-11-05 | heroes-cardfix-new library-usm image gating — event 3875 (Beadcraft) pick=cand-bead.png suitability=10 type=event promo or flyer | image_pick.py | muse-spark-1.3-contributor | 1684
2026-11-05 | heroes-cardfix-new library-usm image gating — event 3876 (Drop-in Tech Help) pick=cand-kfl.jpg suitability=8 type=venue photo | image_pick.py | muse-spark-1.3-contributor | 2043
2026-11-05 | heroes-cardfix-new library-usm image gating — event 3890 (Osher Jazz Combos) pick=cand-ojc.png suitability=10 type=event promo or flyer | image_pick.py | muse-spark-1.3-contributor | 1434
2026-11-05 | heroes-cardfix-new library-usm image gating — event 3891 (USM Reads Strossen) pick=cand-strossen.jpg suitability=8 type=performer photo | image_pick.py | muse-spark-1.3-contributor | 1813
2026-11-05 | heroes-cardfix-new library-usm image gating — event 3892 (Strossen Forum) pick=cand-strossen.jpg suitability=8 type=performer photo | image_pick.py | muse-spark-1.3-contributor | 1844
2026-11-05 | heroes-cardfix-new library-usm image gating — event 3893 (Alternative Geographies) pick=cand-collage.jpeg suitability=9 type=event-related photo | image_pick.py | muse-spark-1.3-contributor | 1589
2026-11-05 | heroes-cardfix-new library-usm image gating — event 3894 (Petit rassemblement) pick=cand-rassemblement.jpg suitability=7 type=performer photo | image_pick.py | muse-spark-1.3-contributor | 1682
2026-11-05 | heroes-cardfix-new library-usm image gating — event 3895 (Josee Vachon) pick=cand-josee-own.jpg suitability=8 type=performer photo (2 candidates) | image_pick.py | muse-spark-1.3-contributor | 2261
2026-11-05 | heroes-cardfix-new library-usm image gating — event 3896 (Composers Showcase) pick=cand-composers.png suitability=10 type=event promo or flyer | image_pick.py | muse-spark-1.3-contributor | 1663
2026-11-05 | heroes-cardfix-new library-usm image gating — event 3900 (Sascha Braunig afterparty) pick=cand-sascha.png suitability=9 type=event-related photo | image_pick.py | muse-spark-1.3-contributor | 2336
2026-11-05 | heroes-cardfix-new library-usm image gating — event 3914 (PMA Films NAZA) pick=cand-naza.jpg suitability=10 type=event promo or flyer | image_pick.py | muse-spark-1.3-contributor | 1865
2026-11-05 | heroes-cardfix-new library-usm image gating — BATCH TOTAL (14 runs, 15 candidates, 14 applied) | image_pick.py | muse-spark-1.3-contributor | 25812
2026-11-05 | heroes-cardfix-new trivia/gigs image gating — 25 image_pick runs (22 groups + 3 re-gates: farmers, Blue, Hi-Fidelity), 26 rows applied | image_pick.py | muse-spark-1.3-contributor | 81276
2026-11-05 | internal strategy consult — hackathon finalist odds for Team Joinaroo (Angelo's question, Spark's estimate) | meta_api.py chat | muse-spark-1.3 | 4776
2026-11-05 | internal strategy consult — follow-up: do Angelo's 2013 regional hackathon win + 2009 national cyber competition win change the finalist odds? (Spark: no) | meta_api.py chat | muse-spark-1.3 | 2486
2026-11-05 | internal strategy consult — follow-up 2: does AI-first screening of submissions (Angelo's read of the judging protocol) change the finalist odds? (Spark: 8 -> 12) | meta_api.py chat | muse-spark-1.3 | 4548
