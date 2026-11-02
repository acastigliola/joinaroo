#!/usr/bin/env node
/**
 * Live score poller (Angelo, Oct 27, 2026) — a second liveness signal
 * next to attendee photos: while a tracked game is being played, its
 * card and listing can show the running score; finals persist, so
 * records/streaks become computed instead of hand-verified.
 *
 * v2 (Oct 27): adapters beyond the ECHL.
 *  - ECHL (Maine Mariners): TheSportsDB fixtures/results for mapping +
 *    the league's game-center pages for in-game state (the free feed's
 *    livescore ignores league filters). Parser verified on finals.
 *  - ESPN public scoreboards (UMaine football FCS groups=81, UMaine
 *    men's/women's basketball): full live state incl. period/clock.
 *    Verified: Maine vs Campbell, Oct 24 2026, from groups=81.
 *    (data.ncaa.com casablanca 404s for current seasons — dead.)
 *  - SIDEARM school schedule pages: UMaine hockey (nextgen dialect,
 *    "Completed Event: ... Win , 3, to, 0" aria text, verified) and
 *    USM + Bowdoin (classic dialect, "Hide/Show Additional
 *    Information" anchors + W/L/T score lines, verified). Finals are
 *    solid on SIDEARM; in-game state is best-effort (the pages'
 *    live markup is unobserved — in-window pages get a debug capture
 *    under score-debug/ so the parser can be hardened).
 *
 * Modes:
 *   node score-poller.js poll     (cron, every few minutes)
 *   node score-poller.js map      (TheSportsDB Mariners mapping only)
 *   node score-poller.js backfill (finals for all tracked past events)
 */
'use strict';

const fs = require('fs');
const Database = require('better-sqlite3');

const db = new Database(__dirname + '/smevents.db');
const TSDB_KEY = process.env.TSDB_KEY || '123';
const TSDB = `https://www.thesportsdb.com/api/v1/json/${TSDB_KEY}`;
const MARINERS_TEAM_ID = '141426';
const ECHL_LEAGUE_ID = '4916';
const UA = { 'User-Agent': 'JoinarooScorePoller/1.0 (+https://joinaroo.com)' };

db.exec(`CREATE TABLE IF NOT EXISTS event_scores (
  event_id INTEGER PRIMARY KEY REFERENCES events(id),
  source TEXT,
  feed_event_id TEXT,
  home_team TEXT,
  away_team TEXT,
  home_score INTEGER,
  away_score INTEGER,
  status TEXT DEFAULT 'scheduled',
  period TEXT,
  updated_at TEXT
)`);

const nowIso = () => new Date().toISOString();
const log = (...a) => console.log(new Date().toISOString(), ...a);

async function fetchText(url) {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`GET ${url} -> ${r.status}`);
  return r.text();
}
async function fetchJson(url) {
  return JSON.parse(await fetchText(url));
}

function slugify(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Local (America/New_York) Y/M/D parts for an ISO timestamp. */
function etParts(iso) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(new Date(iso));
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  return { y: get('year'), m: get('month'), d: get('day') };
}
const etDateStr = (iso) => {
  const { y, m, d } = etParts(iso);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};
const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};
/** "October 24, 2026" -> "2026-10-24" */
function longDateToIso(s) {
  const m = String(s).match(/(\w+) (\d{1,2}), (\d{4})/);
  if (!m) return null;
  const mon = MONTHS[m[1].toLowerCase()];
  if (!mon) return null;
  return `${m[3]}-${String(mon).padStart(2, '0')}-${String(Number(m[2])).padStart(2, '0')}`;
}

/** Fold a team/opponent name for matching: lowercase alphanumerics,
 * school-suffix words removed, known aliases applied. */
function normName(s) {
  let n = String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\b(university|college|the|of|at)\b/g, ' ')
    .replace(/\s+/g, '')
    .trim();
  const alias = { umass: 'massachusetts', une: 'newengland', usm: 'southernmaine' };
  return alias[n] || n;
}

/** Display names for the score panel, derived from our own listing
 * title so the panel reads consistently with the card title. */
function displayTeams(ev) {
  const seg = String(ev.title || '').split(/\s+vs\.?\s+/i);
  if (seg.length < 2) return null;
  const homeSeg = seg[0].trim();
  let away = seg[1].replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+—\s+.*$/, '').trim();
  let home = homeSeg;
  if (/mariners/i.test(homeSeg)) home = 'Maine Mariners';
  else if (/^(umaine|maine)\b/i.test(homeSeg)) home = 'Maine';
  else if (/^usm\b/i.test(homeSeg)) home = 'Southern Maine';
  else if (/^bowdoin/i.test(homeSeg)) home = 'Bowdoin';
  return { home, away, homeSeg };
}

/* ------------------------------------------------------------------ */
/* Classification: which adapter tracks this event?                    */
/* ------------------------------------------------------------------ */

const SIDEARM_PATHS = {
  'mens hockey': 'mens-ice-hockey',
  'womens hockey': 'womens-ice-hockey',
  'mens soccer': 'mens-soccer',
  'womens soccer': 'womens-soccer',
  'womens volleyball': 'womens-volleyball',
  'field hockey': 'field-hockey',
  football: 'football',
  'mens basketball': 'mens-basketball',
  'womens basketball': 'womens-basketball',
};

function parseSport(homeSeg) {
  const m = homeSeg.match(
    /(men's|women's)?\s*(field hockey|ice hockey|hockey|football|basketball|soccer|volleyball)/i
  );
  if (!m) return null;
  const gender = m[1] ? m[1].toLowerCase().replace("'", '') : null;
  let sport = m[2].toLowerCase();
  if (sport === 'ice hockey') sport = 'hockey';
  if (sport === 'field hockey') return 'field hockey';
  if (!gender && sport !== 'football') return null;
  return gender ? `${gender} ${sport}` : sport;
}

function classify(ev) {
  const teams = displayTeams(ev);
  if (!teams) return null;
  if (/^Maine Mariners$/i.test(teams.home)) return { kind: 'echl', teams };
  const sport = parseSport(teams.homeSeg);
  if (!sport) return null;
  const isUMaine = teams.home === 'Maine';
  const isUSM = teams.home === 'Southern Maine';
  const isBowdoin = teams.home === 'Bowdoin';
  if (isUMaine && sport === 'football')
    return { kind: 'espn', teams, sportPath: 'football/college-football', groups: '81' };
  if (isUMaine && sport === 'mens basketball')
    return { kind: 'espn', teams, sportPath: 'basketball/mens-college-basketball', groups: null };
  if (isUMaine && sport === 'womens basketball')
    return { kind: 'espn', teams, sportPath: 'basketball/womens-college-basketball', groups: null };
  const path = SIDEARM_PATHS[sport];
  if (!path) return null;
  if (isUMaine)
    return { kind: 'sidearm', teams, host: 'goblackbears.com', dialect: 'nextgen', path };
  if (isUSM)
    return { kind: 'sidearm', teams, host: 'southernmainehuskies.com', dialect: 'classic', path };
  if (isBowdoin)
    return { kind: 'sidearm', teams, host: 'athletics.bowdoin.edu', dialect: 'classic', path };
  return null;
}

function trackedEvents() {
  return db
    .prepare(`SELECT id, title, starts_at FROM events WHERE hidden = 0 ORDER BY starts_at`)
    .all()
    .map((ev) => ({ ev, spec: classify(ev) }))
    .filter((x) => x.spec);
}

/* ------------------------------------------------------------------ */
/* Storage                                                             */
/* ------------------------------------------------------------------ */

const upsertScore = db.prepare(`
  INSERT INTO event_scores (event_id, source, feed_event_id, home_team,
 away_team, home_score, away_score, status, period, updated_at)
  VALUES (@event_id, @source, @feed_event_id, @home_team, @away_team, @home_score, @away_score, @status, @period, @updated_at)
  ON CONFLICT(event_id) DO UPDATE SET
    source = excluded.source,
    feed_event_id = COALESCE(excluded.feed_event_id, event_scores.feed_event_id),
    home_team = COALESCE(excluded.home_team, event_scores.home_team),
    away_team = COALESCE(excluded.away_team, event_scores.away_team),
    home_score = COALESCE(excluded.home_score, event_scores.home_score),
    away_score = COALESCE(excluded.away_score, event_scores.away_score),
    status = excluded.status,
    period = excluded.period,
    updated_at = excluded.updated_at
`);

function writeScore(ev, spec, data) {
  upsertScore.run({
    event_id: ev.id,
    source: data.source,
    feed_event_id: data.feedEventId || null,
    home_team: data.homeTeam || spec.teams.home,
    away_team: data.awayTeam || spec.teams.away,
    home_score: data.homeScore ?? null,
    away_score: data.awayScore ?? null,
    status: data.status,
    period: data.period ?? null,
    updated_at: nowIso(),
  });
  log(
    `score: event ${ev.id} (${spec.kind}) ${data.awayTeam || spec.teams.away} ${data.awayScore ?? '-'} @ ${data.homeTeam || spec.teams.home} ${data.homeScore ?? '-'} — ${data.status}${data.period ? ' ' + data.period : ''}`
  );
}

/* ------------------------------------------------------------------ */
/* ECHL adapter (Mariners) — carried over from v1                      */
/* ------------------------------------------------------------------ */

function echlUrl(ev, homeTeam, awayTeam) {
  const { y, m, d } = etParts(ev.starts_at);
  return `https://echl.com/games/${y}/${m}/${d}/${slugify(homeTeam)}-vs-${slugify(awayTeam)}`;
}

function classifyStatusText(text) {
  const t = String(text || '').trim();
  if (/final/i.test(t)) return { status: 'final', period: null };
  if (/(1st|2nd|3rd|period|OT|SO)/i.test(t) || /^\d/.test(t))
    return { status: 'live', period: t };
  return { status: 'scheduled', period: null };
}

/** Parse the score header of an ECHL game page (away | status | home),
 * verified against the Oct 24/25 2026 finals: 0|Final|3, 1|Final|3.
 * Live pages nest clock+period in spans inside the status cell
 * (e.g. <span>00:00</span> <span>1st</span>) instead of flat text —
 * the Oct 30 dress rehearsal against Mariners @ Trois-Rivières
 * matched nothing until the middle capture took the nested markup
 * and the tags were stripped before classification. */
function parseEchlPage(html) {
  const m = html.match(
    /min-w-\[48px\]">\s*<span[^>]*>\s*(\d+)\s*<\/span>\s*<\/div>\s*<div[^>]*>\s*([\s\S]{1,300}?)\s*<\/div>\s*<div[^>]*>\s*<span[^>]*>\s*(\d+)\s*<\/span>/
  );
  if (!m) return { found: false };
  const statusText = m[2].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const { status, period } = classifyStatusText(statusText);
  return {
    found: true,
    awayScore: Number(m[1]),
    homeScore: Number(m[3]),
    statusText,
    status,
    period,
  };
}

async function pollEchl(ev, spec, row) {
  const home = (row && row.home_team) || spec.teams.home;
  const away = (row && row.away_team) || spec.teams.away;
  const html = await fetchText(echlUrl(ev, home, away));
  const parsed = parseEchlPage(html);
  if (!parsed.found) {
    log(`echl: event ${ev.id} — no score header yet`);
    return false;
  }
  writeScore(ev, spec, {
    source: 'echl',
    homeTeam: home,
    awayTeam: away,
    homeScore: parsed.homeScore,
    awayScore: parsed.awayScore,
    status: parsed.status,
    period: parsed.period,
  });
  return true;
}

/** TheSportsDB adapter: rolling next/last + (sampled) season schedule.
 * The free key's season endpoint returns only ~15 games, so next/last
 * are what keep Mariners games feed-mapped. */
async function tsdbMarinersGames() {
  const byId = new Map();
  const add = (list) => {
    for (const e of list || []) {
      if (e.idHomeTeam === MARINERS_TEAM_ID || e.idAwayTeam === MARINERS_TEAM_ID)
        byId.set(e.idEvent, e);
    }
  };
  const season = await fetchJson(
    `${TSDB}/eventsseason.php?id=${ECHL_LEAGUE_ID}&s=2026-2027`
  ).catch(() => ({}));
  add(season.events);
  const next = await fetchJson(`${TSDB}/eventsnext.php?id=${MARINERS_TEAM_ID}`).catch(() => ({}));
  add(next.events);
  const last = await fetchJson(`${TSDB}/eventslast.php?id=${MARINERS_TEAM_ID}`).catch(() => ({}));
  add(last.results);
  return [...byId.values()];
}

async function mapFromFeed() {
  const events = trackedEvents().filter((x) => x.spec.kind === 'echl');
  const games = await tsdbMarinersGames();
  let mapped = 0;
  for (const g of games) {
    const feedTs = new Date(
      g.strTimestamp || `${g.dateEvent}T${g.strTime || '00:00:00'}Z`
    ).getTime();
    let best = null;
    for (const { ev } of events) {
      const diff = Math.abs(new Date(ev.starts_at).getTime() - feedTs);
      if (diff <= 3 * 3600 * 1000 && (!best || diff < best.diff)) best = { ev, diff };
    }
    if (!best) continue;
    const hasScore = g.intHomeScore !== null && g.intHomeScore !== undefined && g.intHomeScore !== '';
    const played = hasScore && new Date(best.ev.starts_at).getTime() < Date.now();
    const spec = classify(best.ev);
    writeScore(best.ev, spec, {
      source: 'thesportsdb',
      feedEventId: g.idEvent,
      homeTeam: g.strHomeTeam,
      awayTeam: g.strAwayTeam,
      homeScore: hasScore ? Number(g.intHomeScore) : null,
      awayScore: hasScore ? Number(g.intAwayScore) : null,
      status: played ? 'final' : 'scheduled',
      period: null,
    });
    mapped++;
  }
  log(`map: ${mapped} Mariners games mapped from TheSportsDB`);
  return mapped;
}

/* ------------------------------------------------------------------ */
/* ESPN adapter (UMaine football + basketball)                         */
/* ------------------------------------------------------------------ */

const espnCache = new Map();
/** ESPN's edge 403s non-browser user agents from datacenter IPs
 * (verified Oct 27: default UA -> 403, Chrome UA -> 200). */
const ESPN_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  Referer: 'https://www.espn.com/',
};
async function espnScoreboard(spec, dateStr) {
  const key = `${spec.sportPath}|${spec.groups || ''}|${dateStr}`;
  if (espnCache.has(key)) return espnCache.get(key);
  const ymd = dateStr.replace(/-/g, '');
  const url =
    `https://site.api.espn.com/apis/site/v2/sports/${spec.sportPath}/scoreboard?dates=${ymd}&limit=300` +
    (spec.groups ? `&groups=${spec.groups}` : '');
  const r = await fetch(url, { headers: ESPN_HEADERS });
  if (!r.ok) throw new Error(`GET ${url} -> ${r.status}`);
  const data = await r.json();
  espnCache.set(key, data);
  return data;
}

async function pollEspn(ev, spec) {
  const data = await espnScoreboard(spec, etDateStr(ev.starts_at));
  const game = (data.events || []).find((e) => {
    const comps = (e.competitions && e.competitions[0] && e.competitions[0].competitors) || [];
    return comps.some((c) => normName(c.team && (c.team.displayName || '')).includes('maine'));
  });
  if (!game) {
    log(`espn: event ${ev.id} — Maine game not on the ${etDateStr(ev.starts_at)} scoreboard yet`);
    return false;
  }
  const comps = game.competitions[0].competitors;
  const home = comps.find((c) => c.homeAway === 'home');
  const away = comps.find((c) => c.homeAway === 'away');
  const st = game.status || {};
  const state = (st.type && st.type.state) || 'pre';
  const num = (c) => (c && c.score !== undefined && c.score !== '' ? Number(c.score) : null);
  // If ESPN has Maine away (shouldn't happen for our home listings),
  // keep orientation honest: swap display names to match ESPN's sides.
  const maineIsHome = home && normName(home.team.displayName).includes('maine');
  writeScore(ev, spec, {
    source: 'espn',
    feedEventId: game.id,
    homeTeam: maineIsHome ? spec.teams.home : spec.teams.away,
    awayTeam: maineIsHome ? spec.teams.away : spec.teams.home,
    homeScore: state === 'pre' ? null : num(home),
    awayScore: state === 'pre' ? null : num(away),
    status: state === 'post' ? 'final' : state === 'in' ? 'live' : 'scheduled',
    period:
      state === 'in'
        ? (st.type && st.type.shortDetail) || `${st.period || ''} ${st.displayClock || ''}`.trim() || null
        : null,
  });
  return true;
}

/* ------------------------------------------------------------------ */
/* SIDEARM adapters (UMaine nextgen; USM + Bowdoin classic)            */
/* ------------------------------------------------------------------ */

function sidearmUrls(spec, ev) {
  const { y, m } = etParts(ev.starts_at);
  const season = m >= 6 ? `${y}-${String(y + 1).slice(2)}` : `${y - 1}-${String(y).slice(2)}`;
  const base = `https://${spec.host}/sports/${spec.path}/schedule`;
  return spec.dialect === 'nextgen'
    ? [`${base}/${season}`, base]
    : [base, `${base}/${y}`, `${base}/${season}`];
}

const sidearmCache = new Map();
async function sidearmGames(spec, ev) {
  const key = `${spec.host}|${spec.path}`;
  if (sidearmCache.has(key)) return sidearmCache.get(key);
  let games = [];
  for (const url of sidearmUrls(spec, ev)) {
    try {
      const html = await fetchText(url);
      games = spec.dialect === 'nextgen' ? parseSidearmNextgen(html) : parseSidearmClassic(html);
      if (games.length) break;
    } catch (e) {
      log(`sidearm: ${url} -> ${e.message}`);
    }
  }
  sidearmCache.set(key, games);
  return games;
}

/** nextgen (UMaine): "Completed Event: Men's Ice Hockey versus Colgate
 * on October 24, 2026 , Win , 3, to, 0" — team score first. The raw
 * HTML interleaves Vue SSR comment markers inside the aria text and
 * entity-encodes apostrophes, so strip comments/entities first. */
function parseSidearmNextgen(html) {
  const clean = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
  const out = [];
  const re =
    /Completed Event: [^<]*?(?:versus|at) (.+?) on (\w+ \d{1,2}, \d{4})\s*,\s*(Win|Loss|Tie)\s*,\s*(\d+)\s*,\s*to\s*,\s*(\d+)/g;
  let m;
  while ((m = re.exec(clean))) {
    out.push({
      opponent: m[1].trim(),
      date: longDateToIso(m[2]),
      result: m[3],
      teamScore: Number(m[4]),
      oppScore: Number(m[5]),
    });
  }
  return out;
}

/** classic (USM, Bowdoin): anchors "Hide/Show Additional Information
 * For <Opponent> - <Date>"; each game's result (team-first "W, 3-0")
 * is the last W/L/T score line before its anchor. */
function parseSidearmClassic(html) {
  const txt = html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<[^>]+>/g, '|')
    .replace(/\s+/g, ' ');
  const anchors = [];
  const re = /Hide\/Show Additional Information For (.+?) - (\w+ \d{1,2}, \d{4})/g;
  let m;
  while ((m = re.exec(txt))) {
    anchors.push({ opponent: m[1].trim(), date: longDateToIso(m[2]), end: m.index });
  }
  const out = [];
  for (let i = 0; i < anchors.length; i++) {
    const spanStart = i === 0 ? 0 : anchors[i - 1].end;
    const span = txt.slice(spanStart, anchors[i].end);
    const results = [...span.matchAll(/([WLT]),[\s|]*(\d+)-(\d+)/g)];
    if (!results.length) continue;
    const r = results[results.length - 1];
    out.push({
      opponent: anchors[i].opponent,
      date: anchors[i].date,
      result: r[1] === 'W' ? 'Win' : r[1] === 'L' ? 'Loss' : 'Tie',
      teamScore: Number(r[2]),
      oppScore: Number(r[3]),
    });
  }
  return out;
}

async function pollSidearm(ev, spec, inWindow) {
  const games = await sidearmGames(spec, ev);
  const date = etDateStr(ev.starts_at);
  const oppKey = normName(spec.teams.away);
  const game = games.find((g) => g.date === date && normName(g.opponent) === oppKey);
  if (!game) {
    if (inWindow) captureDebug(ev, spec);
    log(`sidearm: event ${ev.id} — no final parsed yet (${spec.host}/${spec.path} ${date})`);
    return false;
  }
  // Scores on SIDEARM pages are from the school's perspective; our
  // listings are that school's home games, so team = home.
  writeScore(ev, spec, {
    source: 'sidearm',
    homeTeam: spec.teams.home,
    awayTeam: spec.teams.away,
    homeScore: game.teamScore,
    awayScore: game.oppScore,
    status: 'final',
    period: null,
  });
  return true;
}

/** While a SIDEARM game is in its window with no final parsed, save the
 * page text around the opponent so the live markup can be learned. */
function captureDebug(ev, spec) {
  try {
    const dir = __dirname + '/score-debug';
    fs.mkdirSync(dir, { recursive: true });
    const file = `${dir}/${ev.id}.json`;
    if (fs.existsSync(file)) return;
    fs.writeFileSync(
      file,
      JSON.stringify({ event_id: ev.id, title: ev.title, at: nowIso(), note: 'in-window, no final parsed' })
    );
  } catch {}
}

/* ------------------------------------------------------------------ */
/* Poll / backfill                                                     */
/* ------------------------------------------------------------------ */

function seedRowIfNeeded(ev, spec) {
  const has = db.prepare('SELECT 1 FROM event_scores WHERE event_id = ?').get(ev.id);
  if (has) return;
  writeScore(ev, spec, {
    source: 'title',
    homeTeam: spec.teams.home,
    awayTeam: spec.teams.away,
    homeScore: null,
    awayScore: null,
    status: 'scheduled',
    period: null,
  });
}

async function pollOne(ev, spec, row) {
  if (spec.kind === 'echl') return pollEchl(ev, spec, row);
  if (spec.kind === 'espn') return pollEspn(ev, spec);
  if (spec.kind === 'sidearm') {
    const start = new Date(ev.starts_at).getTime();
    const inWindow = Date.now() > start - 20 * 60 * 1000 && Date.now() < start + 4.5 * 3600 * 1000;
    return pollSidearm(ev, spec, inWindow);
  }
  return false;
}

async function poll() {
  const tracked = trackedEvents();
  const now = Date.now();

  // TheSportsDB mapping for unmapped Mariners games (throttled).
  const unmappedEchl = tracked.filter(
    ({ ev, spec }) =>
      spec.kind === 'echl' &&
      !db.prepare('SELECT 1 FROM event_scores WHERE event_id = ?').get(ev.id) &&
      new Date(ev.starts_at).getTime() < now + 14 * 86400 * 1000
  );
  if (unmappedEchl.length) {
    const stampPath = __dirname + '/score-poller.stamp';
    let lastTry = 0;
    try {
      lastTry = Number(fs.readFileSync(stampPath, 'utf8')) || 0;
    } catch {}
    if (now - lastTry > 30 * 60 * 1000) {
      fs.writeFileSync(stampPath, String(now));
      log(`poll: ${unmappedEchl.length} unmapped Mariners events — running map`);
      await mapFromFeed().catch((e) => log('map failed:', e.message));
    }
  }

  for (const { ev, spec } of tracked) {
    const start = new Date(ev.starts_at).getTime();
    // Seed a row from the title inside 24h so game day never depends
    // on a feed mapping having landed.
    if (start > now - 3600 * 1000 && start < now + 24 * 3600 * 1000) seedRowIfNeeded(ev, spec);
    const row = db.prepare('SELECT * FROM event_scores WHERE event_id = ?').get(ev.id);
    if (row && row.status === 'final') continue;
    // Live window, plus a 48h post-game finals sweep (SIDEARM pages and
    // ESPN both settle finals shortly after the horn).
    const inLive = now > start - 20 * 60 * 1000 && now < start + 4.5 * 3600 * 1000;
    const inFinals = start < now && now < start + 48 * 3600 * 1000;
    if (!inLive && !inFinals) continue;
    await pollOne(ev, spec, row).catch((e) => log(`poll: event ${ev.id} failed:`, e.message));
  }
}

async function backfill() {
  await mapFromFeed().catch((e) => log('map failed:', e.message));
  const tracked = trackedEvents();
  for (const { ev, spec } of tracked) {
    if (new Date(ev.starts_at).getTime() > Date.now()) continue;
    const row = db.prepare('SELECT * FROM event_scores WHERE event_id = ?').get(ev.id);
    if (row && row.status === 'final') continue;
    await pollOne(ev, spec, row).catch((e) => log(`backfill: event ${ev.id} failed:`, e.message));
  }
}

(async () => {
  const mode = process.argv[2] || 'poll';
  if (mode === 'map') await mapFromFeed();
  else if (mode === 'backfill') await backfill();
  else await poll();
})().catch((e) => {
  log('fatal:', e.message);
  process.exit(1);
});
