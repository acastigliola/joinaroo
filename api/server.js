// SME (Southern Maine Events) — API backend, POC.
// Node + Express + better-sqlite3. Plain JS. See CONTRACT.md.

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

const PORT = parseInt(process.env.PORT || '4000', 10);
const JWT_SECRET = process.env.NODE_ENV === 'production'
  ? process.env.JWT_SECRET
  : (process.env.JWT_SECRET || 'dev-only-placeholder-not-a-secret');
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable must be set when NODE_ENV=production');
  process.exit(1);
}
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'smevents.db');

const db = new Database(DB_PATH);
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

// Lightweight migrations for pre-existing DBs (POC: no migration runner yet).
for (const col of ['image_url', 'recurrence', 'series_key']) {
  const exists = db.prepare(`SELECT 1 FROM pragma_table_info('events') WHERE name = ?`).get(col);
  if (!exists) db.exec(`ALTER TABLE events ADD COLUMN ${col} TEXT`);
}
{
  const hasPin = db.prepare(`SELECT 1 FROM pragma_table_info('events') WHERE name = ?`).get('featured_pin');
  if (!hasPin) db.exec(`ALTER TABLE events ADD COLUMN featured_pin INTEGER`);
}
{
  const hasFocus = db.prepare(`SELECT 1 FROM pragma_table_info('events') WHERE name = ?`).get('strip_focus');
  if (!hasFocus) db.exec(`ALTER TABLE events ADD COLUMN strip_focus TEXT`);
}
{
  // Per-event focal point for the card photo crop (CSS object-position,
  // e.g. '80% 50%'): shifts the cover-crop window so the important part
  // of the hero image is what shows on event cards (Angelo, Oct 28).
  const hasPhotoFocus = db.prepare(`SELECT 1 FROM pragma_table_info('events') WHERE name = ?`).get('photo_focus');
  if (!hasPhotoFocus) db.exec(`ALTER TABLE events ADD COLUMN photo_focus TEXT`);
}
{
  // Card-specific hero image: a curated crop of image_url used ONLY on
  // event cards, when the full hero (e.g. a text-heavy flyer) renders
  // badly at card size. The detail page keeps the original (Angelo, Oct 28).
  const hasCardImg = db.prepare(`SELECT 1 FROM pragma_table_info('events') WHERE name = ?`).get('card_image_url');
  if (!hasCardImg) db.exec(`ALTER TABLE events ADD COLUMN card_image_url TEXT`);
}
{
  // Card layout variant: 'top' renders the card photo as a full-width
  // banner on top of the mobile photo card instead of the left inset —
  // for wide key art whose main image is cropped out as the card image
  // (Angelo, Oct 28). NULL = the standard left-inset photo card.
  const hasCardLayout = db.prepare(`SELECT 1 FROM pragma_table_info('events') WHERE name = ?`).get('card_layout');
  if (!hasCardLayout) db.exec(`ALTER TABLE events ADD COLUMN card_layout TEXT`);
}
{
  // Per-event banner aspect override for card_layout='top': bodies wrap
  // differently per event, so matching a standard card's total height
  // means tuning this card's banner height (Angelo, Oct 28). Stored as
  // the CSS aspect-ratio number (width/height, e.g. '4.7').
  const hasCardTopRatio = db.prepare(`SELECT 1 FROM pragma_table_info('events') WHERE name = ?`).get('card_top_ratio');
  if (!hasCardTopRatio) db.exec(`ALTER TABLE events ADD COLUMN card_top_ratio TEXT`);
}
{
  // Game-summary module data (Angelo, Oct 28): JSON for the enriched
  // score header on a tracked game's detail page — team mascots/logos,
  // season + conference records, a note panel, and what's-next rows.
  // The score itself still comes from event_scores via attachScores.
  const hasGameSummary = db.prepare(`SELECT 1 FROM pragma_table_info('events') WHERE name = ?`).get('game_summary');
  if (!hasGameSummary) db.exec(`ALTER TABLE events ADD COLUMN game_summary TEXT`);
}
{
  // Sold-out flag (Angelo, Oct 29): drives the SOLD OUT ribbon + pill on
  // event cards, from his mockup. Set per event; availability verified
  // against the seller (e.g. Ticketmaster) before flagging.
  const hasSoldOut = db.prepare(`SELECT 1 FROM pragma_table_info('events') WHERE name = ?`).get('sold_out');
  if (!hasSoldOut) db.exec(`ALTER TABLE events ADD COLUMN sold_out INTEGER NOT NULL DEFAULT 0`);
}
{
  // Community Pick flag (Angelo, Oct 29): marks upcoming shows by the
  // r/portlandme watchlist bands; drives the COMMUNITY PICK chip on cards.
  const hasCommunityPick = db.prepare(`SELECT 1 FROM pragma_table_info('events') WHERE name = ?`).get('community_pick');
  if (!hasCommunityPick) db.exec(`ALTER TABLE events ADD COLUMN community_pick INTEGER NOT NULL DEFAULT 0`);
}
{
  // Community block (Angelo, Oct 29): curated JSON from the r/portlandme
  // scene thread — quotes, related bands, highlights — rendered on the
  // event detail page before the facts. Mirrors game_summary.
  const hasCommunity = db.prepare(`SELECT 1 FROM pragma_table_info('events') WHERE name = ?`).get('community');
  if (!hasCommunity) db.exec(`ALTER TABLE events ADD COLUMN community TEXT`);
}
{
  // Room Proof flags (Angelo, Nov 2): finder coverage per event.
  // finder_followed marks events the photo finder actually scanned;
  // finder_committed marks events the finder has committed to scan.
  // Together they drive the venue photo-history module on detail pages
  // (see roomProofFor).
  const hasFinderFollowed = db.prepare(`SELECT 1 FROM pragma_table_info('events') WHERE name = ?`).get('finder_followed');
  if (!hasFinderFollowed) db.exec(`ALTER TABLE events ADD COLUMN finder_followed INTEGER NOT NULL DEFAULT 0`);
  const hasFinderCommitted = db.prepare(`SELECT 1 FROM pragma_table_info('events') WHERE name = ?`).get('finder_committed');
  if (!hasFinderCommitted) db.exec(`ALTER TABLE events ADD COLUMN finder_committed INTEGER NOT NULL DEFAULT 0`);
  // Genre guard (Spark review, Nov 2): concert-crowd proof must not sit on
  // comedy / spoken-word / film pages at a qualified venue — those rooms
  // look different. Curated per event, like the other finder flags.
  const hasRoomProofOff = db.prepare(`SELECT 1 FROM pragma_table_info('events') WHERE name = ?`).get('room_proof_off');
  if (!hasRoomProofOff) db.exec(`ALTER TABLE events ADD COLUMN room_proof_off INTEGER NOT NULL DEFAULT 0`);
  // has_people (Peephole people gate, Nov 2): vision-stamped 1/0 on
  // credited photos; NULL = not yet checked. Only 1s count as proof a
  // room was alive — empty stages and merch shots never qualify.
  const hasPeopleCol = db.prepare(`SELECT 1 FROM pragma_table_info('event_photos') WHERE name = ?`).get('has_people');
  if (!hasPeopleCol) db.exec(`ALTER TABLE event_photos ADD COLUMN has_people INTEGER`);
  // venues.is_indoor (Peephole indoor gate, Nov 2): the strip promises
  // a look INSIDE a room; plazas, parks, beaches and fields are out.
  // Defaults to indoor; the outdoor set is curated by hand.
  const hasIndoorCol = db.prepare(`SELECT 1 FROM pragma_table_info('venues') WHERE name = ?`).get('is_indoor');
  if (!hasIndoorCol) db.exec(`ALTER TABLE venues ADD COLUMN is_indoor INTEGER NOT NULL DEFAULT 1`);
}
db.exec(`CREATE TABLE IF NOT EXISTS analytics_ignored_ips (
  ip TEXT PRIMARY KEY,
  note TEXT,
  created_at TEXT DEFAULT (datetime('now'))
)`);
db.exec(`CREATE TABLE IF NOT EXISTS inbound_sms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  from_number TEXT,
  to_number TEXT,
  text TEXT,
  telnyx_id TEXT
)`);
// Live scores (Angelo, Oct 27): a second liveness signal next to photos.
// score-poller.js keeps this table fed from the leagues' public data
// (TheSportsDB fixtures/results + the ECHL game-center pages); the API
// only reads it. One row per event, updated in place.
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
db.exec(`CREATE INDEX IF NOT EXISTS idx_events_series ON events(series_key)`);
// event_photos table is created by schema.sql above (IF NOT EXISTS), but ensure the
// index exists for DBs created before it was added.
db.exec(`CREATE INDEX IF NOT EXISTS idx_photos_event ON event_photos(event_id)`);
// Photo attribution: uploads record the uploading user (POST requires login).
// NULL on rows that predate attribution.
{
  const hasUserId = db
    .prepare(`SELECT 1 FROM pragma_table_info('event_photos') WHERE name = ?`)
    .get('user_id');
  if (!hasUserId) db.exec(`ALTER TABLE event_photos ADD COLUMN user_id INTEGER REFERENCES users(id)`);
}
db.exec(`CREATE INDEX IF NOT EXISTS idx_photos_user ON event_photos(user_id)`);
// Photo source credit: event_photos.source_id -> photo_sources (photographer /
// origin of the photo, distinct from the uploading user).
{
  const hasSourceId = db
    .prepare(`SELECT 1 FROM pragma_table_info('event_photos') WHERE name = ?`)
    .get('source_id');
  if (!hasSourceId) db.exec(`ALTER TABLE event_photos ADD COLUMN source_id INTEGER REFERENCES photo_sources(id)`);
}
db.exec(`CREATE INDEX IF NOT EXISTS idx_photos_source ON event_photos(source_id)`);
// photo_sources.email: contact for the credited photographer/source.
{
  const hasEmail = db
    .prepare(`SELECT 1 FROM pragma_table_info('photo_sources') WHERE name = ?`)
    .get('email');
  if (!hasEmail) db.exec(`ALTER TABLE photo_sources ADD COLUMN email TEXT`);
}
// photo_sources.x_username / x_post_url: fan-photo attribution on X (the
// looser standard) — display name lives in `name`; a source row with an
// x_post_url renders as the X fan credit instead of the pro credit stack.
{
  const hasXUser = db
    .prepare(`SELECT 1 FROM pragma_table_info('photo_sources') WHERE name = ?`)
    .get('x_username');
  if (!hasXUser) db.exec(`ALTER TABLE photo_sources ADD COLUMN x_username TEXT`);
  const hasXPost = db
    .prepare(`SELECT 1 FROM pragma_table_info('photo_sources') WHERE name = ?`)
    .get('x_post_url');
  if (!hasXPost) db.exec(`ALTER TABLE photo_sources ADD COLUMN x_post_url TEXT`);
  const hasIgUser = db
    .prepare(`SELECT 1 FROM pragma_table_info('photo_sources') WHERE name = ?`)
    .get('ig_username');
  if (!hasIgUser) db.exec(`ALTER TABLE photo_sources ADD COLUMN ig_username TEXT`);
  const hasIgPost = db
    .prepare(`SELECT 1 FROM pragma_table_info('photo_sources') WHERE name = ?`)
    .get('ig_post_url');
  if (!hasIgPost) db.exec(`ALTER TABLE photo_sources ADD COLUMN ig_post_url TEXT`);
  const hasSrcAvatar = db
    .prepare(`SELECT 1 FROM pragma_table_info('photo_sources') WHERE name = ?`)
    .get('avatar_url');
  if (!hasSrcAvatar) db.exec(`ALTER TABLE photo_sources ADD COLUMN avatar_url TEXT`);
  const hasFbUser = db
    .prepare(`SELECT 1 FROM pragma_table_info('photo_sources') WHERE name = ?`)
    .get('fb_username');
  if (!hasFbUser) db.exec(`ALTER TABLE photo_sources ADD COLUMN fb_username TEXT`);
}
// Analytics: pageview tracking with GeoIP enrichment.
db.exec(`CREATE TABLE IF NOT EXISTS pageviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  ip TEXT,
  country TEXT,
  region TEXT,
  city TEXT,
  asn INTEGER,
  isp TEXT,
  page TEXT,
  referrer TEXT,
  user_agent TEXT,
  device TEXT
)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_pageviews_ts ON pageviews(ts)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_pageviews_country ON pageviews(country)`);
// Gallery-view beacons (Angelo, Oct 31, 2026): one row per visitor's first
// lightbox open per page load, logged like pageviews so the analytics
// report can apply the same house filters.
db.exec(`CREATE TABLE IF NOT EXISTS photo_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  ip TEXT,
  country TEXT,
  region TEXT,
  city TEXT,
  asn INTEGER,
  isp TEXT,
  page TEXT,
  user_agent TEXT,
  device TEXT
)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_photo_views_ts ON photo_views(ts)`);
// Scrolled Photos split (Angelo, Oct 31, 2026): a gallery beacon row is
// either a lightbox open (kind='open', the original trigger) or a photo-
// row sideways scroll that revealed a photo which was off-screen at load
// (kind='scroll'). Rows from before this column existed read as opens.
{
  const pvCols = db.prepare(`PRAGMA table_info(photo_views)`).all().map((c) => c.name);
  if (!pvCols.includes('kind')) db.exec(`ALTER TABLE photo_views ADD COLUMN kind TEXT`);
}
// Details-button clicks (Angelo, Oct 31, 2026): one row per click on an
// event page's "More Event Details" button, logged like pageviews so the
// analytics report can apply the same house filters and join a click back
// to the visitor's pageview trail (the Google → event → click → gone
// bounce question).
db.exec(`CREATE TABLE IF NOT EXISTS details_clicks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  ip TEXT,
  country TEXT,
  region TEXT,
  city TEXT,
  asn INTEGER,
  isp TEXT,
  page TEXT,
  user_agent TEXT,
  device TEXT
)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_details_clicks_ts ON details_clicks(ts)`);

// Clicks on an event page's "Listed by" source link (Angelo, Nov 1, 2026):
// the second door to the event source — and the ONLY outbound path left
// on an ended page once the details button expires at midnight. Logged
// with the same shape as details_clicks so the report can apply the same
// house filters and tally per page.
db.exec(`CREATE TABLE IF NOT EXISTS listedby_clicks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  ip TEXT,
  country TEXT,
  region TEXT,
  city TEXT,
  asn INTEGER,
  isp TEXT,
  page TEXT,
  user_agent TEXT,
  device TEXT
)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_listedby_clicks_ts ON listedby_clicks(ts)`);

// Uploaded event photos live on disk; served at /api/uploads/<filename>.
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const seed = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed-data.json'), 'utf8'));
const TOWNS = seed.towns || [];

// ---------- helpers ----------

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function uniqueEventSlug(base, excludeId) {
  let slug = base || 'event';
  let n = 2;
  while (db.prepare('SELECT 1 FROM events WHERE slug = ? AND id != ?').get(slug, excludeId || -1)) {
    slug = `${base}-${n++}`;
  }
  return slug;
}

/** MMDDYYYY in Maine time, e.g. "10132026" — appended to new event slugs for SEO. */
function maineMMDDYYYY(iso) {
  const d = new Date(iso);
  if (Number.isNaN(+d)) return '00000000';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('month')}${get('day')}${get('year')}`;
}

/** Slug for a new event: title + Maine date, e.g. "hack-night-10132026". */
function newEventSlug(title, starts_at, excludeId) {
  return uniqueEventSlug(`${slugify(title)}-${maineMMDDYYYY(starts_at)}`, excludeId);
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Pin lifetime (Angelo, Oct 25): a featured pin holds its card through
// the end of the event's listing day (Maine time), and for late-night
// events until ends_at + 2h (Maine last call is 1 AM, so a 1 AM close
// stays pinned to 3 AM) — whichever is later. A 9 AM–12 PM event's pin
// therefore simply runs to midnight like any other card.
function etNextMidnightMs(iso) {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(d);
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  let guess = Date.UTC(get('year'), get('month') - 1, get('day') + 1, 5, 0, 0);
  const etHour =
    Number(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        hour: 'numeric',
        hour12: false,
      }).format(new Date(guess)),
    ) % 24;
  return guess - etHour * 3600000;
}
function pinExpiresMs(row) {
  const dayEnd = etNextMidnightMs(row.starts_at);
  if (!row.ends_at) return dayEnd;
  return Math.max(dayEnd, +new Date(row.ends_at) + 2 * 3600000);
}

function eventToJson(row, distanceKm, adminView) {
  const out = {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    category: { id: row.cat_id, slug: row.cat_slug, name: row.cat_name },
    venue: row.venue_id
      ? {
          id: row.venue_id,
          name: row.venue_name,
          address: row.venue_address,
          city: row.venue_city,
          lat: row.venue_lat,
          lng: row.venue_lng,
        }
      : null,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    cost_free: !!row.cost_free,
    cost_text: row.cost_text,
    url: row.url,
    source: row.source,
    image_url: row.image_url,
    recurrence: row.recurrence,
    series_key: row.series_key,
    featured: !!row.featured,
    sold_out: !!row.sold_out,
    community_pick: !!row.community_pick,
    featured_pin: row.featured_pin ?? null,
    strip_focus: row.strip_focus ?? null,
    photo_focus: row.photo_focus ?? null,
    card_image_url: row.card_image_url ?? null,
    card_layout: row.card_layout ?? null,
    card_top_ratio: row.card_top_ratio ?? null,
    game_summary: (() => {
      if (!row.game_summary) return null;
      try { return JSON.parse(row.game_summary); } catch { return null; }
    })(),
    community: (() => {
      if (!row.community) return null;
      try { return JSON.parse(row.community); } catch { return null; }
    })(),
    pin_expires_at:
      row.featured_pin != null
        ? new Date(pinExpiresMs(row)).toISOString()
        : null,
    distance_km: distanceKm === undefined ? null : distanceKm,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  if (adminView) out.hidden = !!row.hidden;
  return out;
}

function userToJson(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone || null,
    role: row.role,
    username: row.username,
    display_name: row.display_name || row.name,
    avatar_url: row.avatar_url || null,
    is_private: !!row.is_private,
    locked: !!row.locked,
    created_at: row.created_at,
  };
}

function generateUsername() {
  // @anonymous + 13 random digits, guaranteed unique
  for (let i = 0; i < 20; i++) {
    const digits = String(Math.floor(Math.random() * 9e12) + 1e12);
    const u = 'anonymous' + digits;
    if (!db.prepare('SELECT 1 FROM users WHERE username = ?').get(u)) return u;
  }
  // fallback: timestamp-based
  return 'anonymous' + Date.now();
}

function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
}

// ---------- seed ----------

function seedIfEmpty() {
  const counts = db.prepare('SELECT (SELECT COUNT(*) FROM categories) c, (SELECT COUNT(*) FROM venues) v, (SELECT COUNT(*) FROM events) e').get();
  if (counts.c === 0) {
    const ins = db.prepare('INSERT INTO categories (slug, name, tagline, icon) VALUES (?, ?, ?, ?)');
    for (const c of seed.categories) ins.run(c.slug, c.name, c.tagline || '', c.icon || '');
  }
  const venueKeyToId = {};
  if (counts.v === 0) {
    const ins = db.prepare('INSERT INTO venues (name, address, city, lat, lng) VALUES (?, ?, ?, ?, ?)');
    for (const v of seed.venues) {
      const r = ins.run(v.name, v.address || null, v.city || '', v.lat ?? null, v.lng ?? null);
      venueKeyToId[v.key] = r.lastInsertRowid;
    }
  } else {
    // map keys by matching seeded names (only needed on fresh DBs, but harmless)
    for (const v of seed.venues) {
      const row = db.prepare('SELECT id FROM venues WHERE name = ?').get(v.name);
      if (row) venueKeyToId[v.key] = row.id;
    }
  }
  if (counts.e === 0) {
    const catId = {};
    for (const c of db.prepare('SELECT id, slug FROM categories').all()) catId[c.slug] = c.id;
    const ins = db.prepare(
      `INSERT INTO events (slug, title, description, category_id, venue_id, starts_at, ends_at, cost_free, cost_text, url, source, image_url, recurrence, series_key, featured)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const e of seed.events) {
      const categoryId = catId[e.category];
      if (!categoryId) continue;
      const venueId = venueKeyToId[e.venue] || null;
      ins.run(
        newEventSlug(e.title, e.starts_at),
        e.title,
        e.description || '',
        categoryId,
        venueId,
        e.starts_at,
        e.ends_at || null,
        e.cost_free ? 1 : 0,
        e.cost_text || null,
        e.url || null,
        e.source || null,
        e.image_url || null,
        e.recurrence || null,
        e.series_key || null,
        e.featured ? 1 : 0
      );
    }
  }
  // seed admin user — credentials from env in production, dev defaults otherwise.
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com';
  if (!db.prepare('SELECT 1 FROM users WHERE email = ?').get(ADMIN_EMAIL)) {
    const adminPw = process.env.ADMIN_PASSWORD;
    if (process.env.NODE_ENV === 'production' && !adminPw) {
      console.error('FATAL: ADMIN_PASSWORD environment variable must be set when NODE_ENV=production');
      process.exit(1);
    }
    db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run(
      'Admin',
      ADMIN_EMAIL,
      bcrypt.hashSync(adminPw || 'changeme01', 10),
      'admin'
    );
  }
}
seedIfEmpty();

// ---------- auth middleware ----------

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing bearer token' });
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'invalid or expired token' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.id);
  if (!user || user.locked) return res.status(401).json({ error: 'account unavailable' });
  req.user = user;
  next();
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'admin required' });
  next();
}

// ---------- app ----------

const app = express();
app.use(cors());
app.use(express.json({ limit: '15mb' })); // base64 photo uploads
app.use(express.urlencoded({ extended: false })); // Apple Sign In form_post callback
app.use('/api/uploads', express.static(UPLOAD_DIR, { maxAge: '7d' }));

app.get('/api/health', (req, res) => res.json({ ok: true }));

// ---- Analytics: pageview tracking ----
// GeoIP lookup (MaxMind GeoLite2, loaded lazily). Falls back to nulls if DBs absent.
let geoCity = null, geoAsn = null, geoReady = false;
async function initGeo() {
  if (geoReady) return;
  geoReady = true;
  try {
    const { Reader } = require('@maxmind/geoip2-node');
    const cityPath = 'geoip/GeoLite2-City.mmdb';
    const asnPath = 'geoip/GeoLite2-ASN.mmdb';
    if (fs.existsSync(cityPath)) geoCity = await Reader.open(cityPath);
    if (fs.existsSync(asnPath)) geoAsn = await Reader.open(asnPath);
    console.log('GeoIP databases loaded:', !!geoCity, !!geoAsn);
  } catch (e) { console.log('GeoIP init failed:', e.message); }
}
initGeo();

function geoLookup(ip) {
  const out = { country: null, region: null, city: null, asn: null, isp: null };
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('::ffff:127.')) return out;
  const cleanIp = ip.replace(/^::ffff:/, '');
  try {
    if (geoCity) {
      const r = geoCity.city(cleanIp);
      out.country = r.country?.isoCode || null;
      out.region = r.subdivisions?.[0]?.isoCode || null;
      out.city = r.city?.names?.en || null;
    }
    if (geoAsn) {
      const r = geoAsn.asn(cleanIp);
      out.asn = r.autonomousSystemNumber || null;
      out.isp = r.autonomousSystemOrganization || null;
    }
  } catch (e) { /* unknown IP, leave nulls */ }
  return out;
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return fwd.split(',')[0].trim();
  return req.socket.remoteAddress || null;
}

function deviceType(ua) {
  if (!ua) return null;
  ua = ua.toLowerCase();
  if (/mobile|android|iphone|ipad/.test(ua)) return 'mobile';
  if (/tablet/.test(ua)) return 'tablet';
  return 'desktop';
}

// Public: log a pageview. No auth — called by the web frontend.
app.post('/api/track', express.json({ limit: '4kb' }), (req, res) => {
  try {
    const ip = clientIp(req);
    const geo = geoLookup(ip);
    const ua = req.headers['user-agent'] || null;
    db.prepare(`INSERT INTO pageviews (ts, ip, country, region, city, asn, isp, page, referrer, user_agent, device)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      Date.now(),
      ip, geo.country, geo.region, geo.city, geo.asn, geo.isp,
      (req.body?.page || null)?.toString().slice(0, 500),
      (req.body?.referrer || req.headers['referer'] || null)?.toString().slice(0, 500),
      ua?.slice(0, 500),
      deviceType(ua)
    );
  } catch (e) { /* never fail the request */ }
  res.json({ ok: true });
});

// Public: log a gallery view (first lightbox open on an event page).
// Fire-and-forget beacon from the web frontend — never fails the request.
app.post('/api/track/photo-view', express.json({ limit: '4kb' }), (req, res) => {
  try {
    const ip = clientIp(req);
    const geo = geoLookup(ip);
    const ua = req.headers['user-agent'] || null;
    db.prepare(`INSERT INTO photo_views (ts, ip, country, region, city, asn, isp, page, user_agent, device, kind)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      Date.now(),
      ip, geo.country, geo.region, geo.city, geo.asn, geo.isp,
      (req.body?.page || null)?.toString().slice(0, 500),
      ua?.slice(0, 500),
      deviceType(ua),
      req.body?.kind === 'scroll' ? 'scroll' : 'open'
    );
  } catch (e) { /* never fail the request */ }
  res.json({ ok: true });
});

// Public: log a click on an event page's "More Event Details" button.
// Fire-and-forget beacon from the web frontend — never fails the request.
app.post('/api/track/details-click', express.json({ limit: '4kb' }), (req, res) => {
  try {
    const ip = clientIp(req);
    const geo = geoLookup(ip);
    const ua = req.headers['user-agent'] || null;
    db.prepare(`INSERT INTO details_clicks (ts, ip, country, region, city, asn, isp, page, user_agent, device)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      Date.now(),
      ip, geo.country, geo.region, geo.city, geo.asn, geo.isp,
      (req.body?.page || null)?.toString().slice(0, 500),
      ua?.slice(0, 500),
      deviceType(ua)
    );
  } catch (e) { /* never fail the request */ }
  res.json({ ok: true });
});

// Public: log a click on an event page's "Listed by" source link — the
// second door to the source, and the only outbound path on an ended page.
// Fire-and-forget beacon from the web frontend — never fails the request.
app.post('/api/track/listedby-click', express.json({ limit: '4kb' }), (req, res) => {
  try {
    const ip = clientIp(req);
    const geo = geoLookup(ip);
    const ua = req.headers['user-agent'] || null;
    db.prepare(`INSERT INTO listedby_clicks (ts, ip, country, region, city, asn, isp, page, user_agent, device)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      Date.now(),
      ip, geo.country, geo.region, geo.city, geo.asn, geo.isp,
      (req.body?.page || null)?.toString().slice(0, 500),
      ua?.slice(0, 500),
      deviceType(ua)
    );
  } catch (e) { /* never fail the request */ }
  res.json({ ok: true });
});

// Admin-only: analytics summary.
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'admin required' });
  next();
}

app.get('/api/admin/analytics', auth, requireAdmin, (req, res) => {
  const days = Math.min(parseInt(req.query.days) || 7, 90);
  const since = Date.now() - days * 86400000;
  const total = db.prepare(`SELECT COUNT(*) c FROM pageviews WHERE ts >= ?`).get(since).c;
  const uniqueIps = db.prepare(`SELECT COUNT(DISTINCT ip) c FROM pageviews WHERE ts >= ?`).get(since).c;
  const byCountry = db.prepare(`SELECT country, COUNT(*) c FROM pageviews WHERE ts >= ? AND country IS NOT NULL GROUP BY country ORDER BY c DESC LIMIT 20`).all(since);
  const byPage = db.prepare(`SELECT page, COUNT(*) c FROM pageviews WHERE ts >= ? AND page IS NOT NULL GROUP BY page ORDER BY c DESC LIMIT 20`).all(since);
  const byReferrer = db.prepare(`SELECT referrer, COUNT(*) c FROM pageviews WHERE ts >= ? AND referrer IS NOT NULL AND referrer NOT LIKE '%joinaroo.com%' GROUP BY referrer ORDER BY c DESC LIMIT 20`).all(since);
  const byIsp = db.prepare(`SELECT isp, COUNT(*) c FROM pageviews WHERE ts >= ? AND isp IS NOT NULL GROUP BY isp ORDER BY c DESC LIMIT 20`).all(since);
  const byDevice = db.prepare(`SELECT device, COUNT(*) c FROM pageviews WHERE ts >= ? AND device IS NOT NULL GROUP BY device ORDER BY c DESC`).all(since);
  const daily = db.prepare(`SELECT date(ts/1000, 'unixepoch') d, COUNT(*) c, COUNT(DISTINCT ip) u FROM pageviews WHERE ts >= ? GROUP BY d ORDER BY d`).all(since);
  const recent = db.prepare(`SELECT ts, ip, country, region, city, isp, page, referrer, device FROM pageviews ORDER BY ts DESC LIMIT 100`).all();
  const uniqueIpList = db.prepare(`
    SELECT ip, country, region, city, isp, device,
           COUNT(*) as views,
           MIN(ts) as first_seen,
           MAX(ts) as last_seen,
           (SELECT page FROM pageviews p2 WHERE p2.ip = pageviews.ip ORDER BY ts DESC LIMIT 1) as last_page
    FROM pageviews WHERE ts >= ? AND ip IS NOT NULL
    GROUP BY ip ORDER BY last_seen DESC
  `).all(since);
  res.json({ total, uniqueIps, byCountry, byPage, byReferrer, byIsp, byDevice, daily, recent, uniqueIpList });
});

// ----- analytics report (Angelo, Oct 26) -----
// Answers the recurring questions with the house filter rules: real
// browsers only (Mozilla UA, no bot signatures), no datacenter/hosting
// ISPs (Google/Cloudflare/etc.), no CO prober, minus the admin-managed
// ignored-IP list. Dates are always handled as explicit ms bounds.
const BOT_ISP_KEYWORDS = ['google', 'cloudflare', 'amazon', 'microsoft', 'digitalocean', 'linode', 'vultr', 'ovh', 'leaseweb', 'm247', 'datacamp', 'hostroyale', 'deluxhost', 'scaleway', 'facebook', 'fastly', 'akamai', 'choopa', 'hostinger', 'contabo', 'hetzner'];
function isBotPageview(r) {
  if (!r.user_agent || !/mozilla/i.test(r.user_agent)) return true;
  if (/bot|crawler|spider|headless|curl\/|wget|python-requests|scrapy/i.test(r.user_agent)) return true;
  if (r.country === 'CO') return true;
  const isp = (r.isp || '').toLowerCase();
  return BOT_ISP_KEYWORDS.some((h) => isp.includes(h));
}
const etDayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });

app.get('/api/admin/analytics/ignored', auth, requireAdmin, (req, res) => {
  const rows = db.prepare(`SELECT ip, note, created_at FROM analytics_ignored_ips ORDER BY created_at, ip`).all();
  res.json({ ignored: rows });
});

app.post('/api/admin/analytics/ignored', auth, requireAdmin, (req, res) => {
  const ip = String(req.body?.ip || '').trim();
  const note = req.body?.note ? String(req.body.note).slice(0, 120) : null;
  if (!/^[0-9a-fA-F:.]{3,45}$/.test(ip)) return res.status(400).json({ error: 'valid IP required' });
  db.prepare(`INSERT INTO analytics_ignored_ips (ip, note) VALUES (?, ?) ON CONFLICT(ip) DO UPDATE SET note = excluded.note`).run(ip, note);
  res.json({ ok: true, ip });
});

app.delete('/api/admin/analytics/ignored/:ip', auth, requireAdmin, (req, res) => {
  db.prepare(`DELETE FROM analytics_ignored_ips WHERE ip = ?`).run(req.params.ip);
  res.json({ ok: true });
});

// AI-assistant referrers (added Oct 27, 2026 — Angelo asked for AI traffic
// to be tracked separately after ChatGPT-referred visits appeared in the
// analytics). A pageview counts toward an AI source when its referrer host
// is the assistant's domain, or when the referrer URL carries a utm_source
// naming it (internal navigation echoes the landing URL's utm parameters,
// which is how an AI-referred session's follow-on views are attributed).
const AI_SOURCES = [
  { name: 'ChatGPT', hosts: ['chatgpt.com', 'chat.openai.com'], utm: ['chatgpt', 'openai'] },
  { name: 'Perplexity', hosts: ['perplexity.ai'], utm: ['perplexity'] },
  { name: 'Claude', hosts: ['claude.ai'], utm: ['claude', 'anthropic'] },
  { name: 'Gemini', hosts: ['gemini.google.com', 'bard.google.com'], utm: ['gemini', 'bard'] },
  { name: 'Copilot', hosts: ['copilot.microsoft.com'], utm: ['copilot'] },
  { name: 'Meta AI', hosts: ['meta.ai'], utm: ['meta.ai', 'metaai'] },
  { name: 'Grok', hosts: ['grok.com', 'x.ai'], utm: ['grok'] },
  { name: 'DeepSeek', hosts: ['deepseek.com'], utm: ['deepseek'] },
  { name: 'You.com', hosts: ['you.com'], utm: ['you.com'] },
  { name: 'Phind', hosts: ['phind.com'], utm: ['phind'] },
  { name: 'Poe', hosts: ['poe.com'], utm: ['poe'] },
  { name: 'Mistral', hosts: ['chat.mistral.ai'], utm: ['mistral'] },
];
function isGoogleReferrer(referrer) {
  if (!referrer) return false;
  try {
    return new URL(referrer).hostname.toLowerCase().includes('google.');
  } catch { return /google\./i.test(referrer); }
}

function aiSourceFor(referrer) {
  if (!referrer) return null;
  const m = referrer.match(/[?&]utm_source=([^&\s]+)/i);
  if (m) {
    let u = '';
    try { u = decodeURIComponent(m[1]).toLowerCase(); } catch { u = m[1].toLowerCase(); }
    for (const s of AI_SOURCES) if (s.utm.some((t) => u.includes(t))) return s.name;
  }
  try {
    const h = new URL(referrer).hostname.toLowerCase();
    for (const s of AI_SOURCES) if (s.hosts.some((d) => h === d || h.endsWith('.' + d))) return s.name;
  } catch { /* not a URL — no host match */ }
  return null;
}

app.get('/api/admin/analytics/report', auth, requireAdmin, (req, res) => {
  const now = Date.now();
  const from = Number(req.query.from) || now - 7 * 86400000;
  const to = Number(req.query.to) || now;
  const ignoredRows = db.prepare(`SELECT ip, note FROM analytics_ignored_ips`).all();
  const ignoredSet = new Set(ignoredRows.map((r) => r.ip));
  const noteByIp = new Map(ignoredRows.map((r) => [r.ip, r.note]));
  const rows = db.prepare(`SELECT ts, ip, country, region, city, isp, page, referrer, user_agent FROM pageviews WHERE ts >= ? AND ts < ? AND ip IS NOT NULL ORDER BY ts`).all(from, to);

  const byIp = new Map();
  for (const r of rows) {
    let e = byIp.get(r.ip);
    if (!e) {
      e = { ip: r.ip, rows: [], botRows: 0 };
      byIp.set(r.ip, e);
    }
    e.rows.push(r);
    if (isBotPageview(r)) e.botRows++;
  }

  const ips = [];
  const counted = [];
  let botViews = 0;
  let ignoredViews = 0;
  for (const e of byIp.values()) {
    const last = e.rows[e.rows.length - 1];
    const isIgnored = ignoredSet.has(e.ip);
    const isBot = e.botRows === e.rows.length;
    const cls = isIgnored ? 'ignored' : isBot ? 'bot' : 'counted';
    if (cls === 'bot') botViews += e.rows.length;
    if (cls === 'ignored') ignoredViews += e.rows.length;
    const distinctPages = new Set(e.rows.map((r) => r.page)).size;
    ips.push({
      ip: e.ip, city: last.city, region: last.region, country: last.country, isp: last.isp,
      views: e.rows.length, distinctPages,
      firstSeen: e.rows[0].ts, lastSeen: last.ts,
      cls, note: noteByIp.get(e.ip) || null,
    });
    if (cls === 'counted') counted.push(e);
  }
  ips.sort((a, b) => b.lastSeen - a.lastSeen);

  let pageviews = 0;
  let authViews = 0;
  const explorers = [];
  let repeaters = 0;
  let singles = 0;
  const pageCounts = new Map();
  const refCounts = new Map();
  const aiCounts = new Map();
  const deviceCounts = new Map();
  const dailyMap = new Map();
  for (const e of counted) {
    pageviews += e.rows.length;
    // Device split (Angelo, Oct 29): each counted visitor is classed
    // by the device on their most recent pageview.
    const dev = deviceType(e.rows[e.rows.length - 1].user_agent) || 'unknown';
    const dc = deviceCounts.get(dev) || { device: dev, visitors: 0, pageviews: 0 };
    dc.visitors++; dc.pageviews += e.rows.length; deviceCounts.set(dev, dc);
    const pages = new Set();
    for (const r of e.rows) {
      pages.add(r.page);
      if (r.page && r.page.startsWith('/auth')) authViews++;
      const pc = pageCounts.get(r.page) || { page: r.page, views: 0, visitors: new Set() };
      pc.views++; pc.visitors.add(e.ip); pageCounts.set(r.page, pc);
      if (r.referrer && !r.referrer.includes('joinaroo.com')) {
        refCounts.set(r.referrer, (refCounts.get(r.referrer) || 0) + 1);
      }
      const ai = aiSourceFor(r.referrer);
      if (ai) {
        const ac = aiCounts.get(ai) || { source: ai, views: 0, visitors: new Set() };
        ac.views++; ac.visitors.add(e.ip); aiCounts.set(ai, ac);
      }
      const day = etDayFmt.format(new Date(r.ts));
      const d = dailyMap.get(day) || { day, visitors: new Set(), pageviews: 0 };
      d.visitors.add(e.ip); d.pageviews++; dailyMap.set(day, d);
    }
    if (pages.size >= 2) {
      explorers.push({
        ip: e.ip, city: e.rows[e.rows.length - 1].city, region: e.rows[e.rows.length - 1].region,
        isp: e.rows[e.rows.length - 1].isp, views: e.rows.length,
        steps: e.rows.slice(0, 25).map((r) => ({ ts: r.ts, page: r.page, referrer: r.referrer })),
      });
    } else if (e.rows.length >= 2) repeaters++;
    else singles++;
  }
  const fromIso = new Date(from).toISOString().slice(0, 19).replace('T', ' ');
  const toIso = new Date(to).toISOString().slice(0, 19).replace('T', ' ');
  const signups = db.prepare(`SELECT COUNT(*) c FROM users WHERE created_at >= ? AND created_at < ? AND id NOT IN (1, 6, 7, 10)`).get(fromIso, toIso).c;

  // Gallery views (Oct 31): beacons from counted visitors only — the IP
  // must be a counted visitor in this window and the row must pass the
  // same bot screen as pageviews.
  const countedIps = new Set(counted.map((e) => e.ip));
  const pvRows = db.prepare(`SELECT ts, ip, country, isp, page, user_agent, kind FROM photo_views WHERE ts >= ? AND ts < ? AND ip IS NOT NULL AND page IS NOT NULL`).all(from, to);
  const galleryCounts = new Map();
  const scrollCounts = new Map();
  let galleryViews = 0;
  let scrolledPhotos = 0;
  for (const r of pvRows) {
    if (!countedIps.has(r.ip) || isBotPageview(r)) continue;
    // Scroll-triggered rows are their own metric (Scrolled Photos);
    // galleryViews and the per-page gallery counts stay lightbox opens
    // only, but scrolls are tallied per page too so Top pages can show
    // which event fired the scroll beacon (Angelo, Nov 1, 2026).
    if (r.kind === 'scroll') {
      scrolledPhotos++;
      const sc = scrollCounts.get(r.page) || { views: 0, visitors: new Set() };
      sc.views++; sc.visitors.add(r.ip); scrollCounts.set(r.page, sc);
      continue;
    }
    galleryViews++;
    const g = galleryCounts.get(r.page) || { views: 0, visitors: new Set() };
    g.views++; g.visitors.add(r.ip); galleryCounts.set(r.page, g);
  }

  // Details-button clicks (Oct 31): same counted-visitor + bot screen as
  // gallery views, tallied per page for the Top pages annotation, and kept
  // per visitor for the Google-landing funnel below.
  const dcRows = db.prepare(`SELECT ts, ip, country, isp, page, user_agent FROM details_clicks WHERE ts >= ? AND ts < ? AND ip IS NOT NULL AND page IS NOT NULL`).all(from, to);
  const detailsCounts = new Map();
  const clickPagesByIp = new Map();
  let detailsClicks = 0;
  for (const r of dcRows) {
    if (!countedIps.has(r.ip) || isBotPageview(r)) continue;
    detailsClicks++;
    const d = detailsCounts.get(r.page) || { views: 0, visitors: new Set() };
    d.views++; d.visitors.add(r.ip); detailsCounts.set(r.page, d);
    let s = clickPagesByIp.get(r.ip);
    if (!s) { s = new Set(); clickPagesByIp.set(r.ip, s); }
    s.add(r.page);
  }

  // Listed-by clicks (Nov 1, 2026): same counted-visitor + bot screen,
  // tallied per page for the Top pages annotation and as a summary total
  // for the lifecycle chart. Kept separate from details clicks — a
  // visitor can use either door (or both) to reach the source.
  const lbRows = db.prepare(`SELECT ts, ip, country, isp, page, user_agent FROM listedby_clicks WHERE ts >= ? AND ts < ? AND ip IS NOT NULL AND page IS NOT NULL`).all(from, to);
  const listedbyCounts = new Map();
  let listedbyClicks = 0;
  for (const r of lbRows) {
    if (!countedIps.has(r.ip) || isBotPageview(r)) continue;
    listedbyClicks++;
    const d = listedbyCounts.get(r.page) || { views: 0, visitors: new Set() };
    d.views++; d.visitors.add(r.ip); listedbyCounts.set(r.page, d);
  }

  // The Google bounce question (Angelo, Oct 31, 2026): of the counted
  // visitors who LANDED on an event page from Google, how many clicked
  // the details button, and how many of those never viewed any other
  // page in the window — the click was effectively their exit. A landing
  // is the visitor's first pageview of that event page in the window
  // carrying a Google referrer (later views of the same page are internal
  // navigation and don't re-count).
  const funnelMap = new Map();
  for (const e of counted) {
    const seenPages = new Set();
    const distinctPages = new Set(e.rows.map((x) => x.page)).size;
    for (const r of e.rows) {
      if (!r.page || !r.page.startsWith('/events/') || seenPages.has(r.page)) continue;
      seenPages.add(r.page);
      if (!isGoogleReferrer(r.referrer)) continue;
      const f = funnelMap.get(r.page) || { page: r.page, googleLandings: 0, googleClickers: 0, googleBounceAfterClick: 0 };
      f.googleLandings++;
      if (clickPagesByIp.get(e.ip)?.has(r.page)) {
        f.googleClickers++;
        if (distinctPages === 1) f.googleBounceAfterClick++;
      }
      funnelMap.set(r.page, f);
    }
  }
  const detailsFunnel = [...funnelMap.values()].sort((a, b) => b.googleLandings - a.googleLandings).slice(0, 15);

  // Per-page referrer counts (Angelo, Oct 31, 2026): under each Top page,
  // how many counted visitors ARRIVED on that page from Google vs from
  // ChatGPT. Arrival = the visitor's first view of that page in the
  // window carried that referrer (same landing rule as the funnel;
  // ChatGPT via the AI-source matcher, so utm-tagged arrivals count).
  const pageRefMap = new Map();
  for (const e of counted) {
    const seenPages = new Set();
    for (const r of e.rows) {
      if (!r.page || seenPages.has(r.page)) continue;
      seenPages.add(r.page);
      const isG = isGoogleReferrer(r.referrer);
      const isC = aiSourceFor(r.referrer) === 'ChatGPT';
      if (!isG && !isC) continue;
      const pr = pageRefMap.get(r.page) || { google: new Set(), chatgpt: new Set() };
      if (isG) pr.google.add(e.ip);
      if (isC) pr.chatgpt.add(e.ip);
      pageRefMap.set(r.page, pr);
    }
  }

  // Seen Before (Angelo, Oct 31, 2026): of the counted visitors in this
  // window, how many had already visited before the window opened — an
  // earlier pageview history for the same IP that isn't all-bot. Repeat
  // audience, as opposed to first-ever visits.
  let seenBefore = 0;
  const seenBeforeIps = new Set();
  if (counted.length) {
    const ipList = counted.map((e) => e.ip);
    const priorRows = db.prepare(`SELECT ip, country, isp, user_agent FROM pageviews WHERE ts < ? AND ip IN (${ipList.map(() => '?').join(',')})`).all(from, ...ipList);
    const priorByIp = new Map();
    for (const r of priorRows) {
      const a = priorByIp.get(r.ip) || [];
      a.push(r); priorByIp.set(r.ip, a);
    }
    for (const [ip, rs] of priorByIp.entries()) {
      if (!rs.every((r) => isBotPageview(r))) { seenBefore++; seenBeforeIps.add(ip); }
    }
  }
  // Per-IP flag for the All IPs table highlight (Angelo, Oct 31, 2026):
  // rows whose IP is one of the Seen Before visitors get lit up there.
  for (const entry of ips) entry.seenBefore = seenBeforeIps.has(entry.ip);

  res.json({
    from, to,
    summary: {
      visitors: counted.length, pageviews,
      explorers: explorers.length, repeaters, singles,
      authViews, signups, galleryViews, detailsClicks, listedbyClicks, seenBefore, scrolledPhotos,
      botViews, ignoredViews, rawViews: rows.length,
    },
    explorers,
    topPages: [...pageCounts.values()].map((p) => ({ page: p.page, views: p.views, visitors: p.visitors.size, photoViews: galleryCounts.get(p.page)?.views || 0, scrolledPhotos: scrollCounts.get(p.page)?.views || 0, detailsClicks: detailsCounts.get(p.page)?.views || 0, listedbyClicks: listedbyCounts.get(p.page)?.views || 0, googleRefs: pageRefMap.get(p.page)?.google.size || 0, chatgptRefs: pageRefMap.get(p.page)?.chatgpt.size || 0 })).sort((a, b) => b.views - a.views).slice(0, 15),
    detailsFunnel,
    topReferrers: [...refCounts.entries()].map(([referrer, views]) => ({ referrer, views })).sort((a, b) => b.views - a.views).slice(0, 10),
    aiReferrers: [...aiCounts.values()].map((a) => ({ source: a.source, views: a.views, visitors: a.visitors.size })).sort((a, b) => b.views - a.views),
    devices: [...deviceCounts.values()].sort((a, b) => b.visitors - a.visitors),
    daily: [...dailyMap.values()].map((d) => ({ day: d.day, visitors: d.visitors.size, pageviews: d.pageviews })).sort((a, b) => (a.day < b.day ? -1 : 1)),
    ips,
    ignoredList: ignoredRows,
  });
});

// ----- Telnyx inbound SMS (Oct 26) -----
// Telnyx delivers inbound texts to the messaging profile's webhook URL,
// which carries a shared token segment (TELNYX_WEBHOOK_TOKEN in prod.env).
// Stored rows surface in the admin portal's SMS inbox so verification
// codes sent to the Joinaroo number can be read there.
app.post('/api/telnyx/inbound/:token', (req, res) => {
  const expected = process.env.TELNYX_WEBHOOK_TOKEN;
  if (!expected || req.params.token !== expected) return res.status(404).json({ error: 'not found' });
  try {
    const data = req.body?.data;
    if (data?.event_type === 'message.received') {
      const p = data.payload || {};
      const toNum = Array.isArray(p.to) ? p.to[0]?.phone_number : p.to?.phone_number;
      db.prepare(`INSERT INTO inbound_sms (ts, from_number, to_number, text, telnyx_id) VALUES (?, ?, ?, ?, ?)`)
        .run(p.received_at ? Date.parse(p.received_at) || Date.now() : Date.now(),
          p.from?.phone_number || null, toNum || null, p.text || '', p.id || null);
    }
  } catch (e) { /* never fail the webhook */ }
  res.json({ ok: true });
});

app.get('/api/admin/sms-inbox', auth, requireAdmin, (req, res) => {
  const messages = db.prepare(`SELECT id, ts, from_number, to_number, text FROM inbound_sms ORDER BY ts DESC, id DESC LIMIT 50`).all();
  res.json({ messages });
});

// ----- auth -----

app.post('/api/auth/register', (req, res) => {
  const { name, email, phone, password, verification_token } = req.body || {};
  if ((!email && !phone) || !password) {
    return res.status(400).json({ error: 'email or phone, and password required' });
  }
  if (
    password.length < 8 ||
    password.length > 20 ||
    !/[a-zA-Z]/.test(password) ||
    !/[0-9]/.test(password) ||
    !/[^a-zA-Z0-9]/.test(password)
  ) {
    return res.status(400).json({
      error: 'password must be 8-20 characters with letters, numbers, and special characters',
    });
  }
  let addr = null;
  let phoneNum = null;
  if (email) {
    addr = String(email).trim().toLowerCase();
    if (!isValidEmail(addr)) return res.status(400).json({ error: 'valid email required' });
    // Email signups must present a fresh verification token for this address.
    if (!verification_token) {
      return res.status(400).json({ error: 'email verification required' });
    }
    try {
      const v = jwt.verify(verification_token, JWT_SECRET);
      if (!v.verified || v.email !== addr) throw new Error('mismatch');
    } catch {
      return res.status(401).json({ error: 'invalid or expired verification' });
    }
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(addr)) {
      return res.status(409).json({ error: 'email already registered' });
    }
  }
  if (phone) {
    phoneNum = normalizePhone(phone);
    if (!phoneNum) return res.status(400).json({ error: 'valid phone number required (E.164)' });
    // Phone signups must present a fresh verification token for this number.
    if (!verification_token) {
      return res.status(400).json({ error: 'phone verification required' });
    }
    try {
      const v = jwt.verify(verification_token, JWT_SECRET);
      if (!v.verified || v.phone !== phoneNum) throw new Error('mismatch');
    } catch {
      return res.status(401).json({ error: 'invalid or expired verification' });
    }
    if (db.prepare('SELECT 1 FROM users WHERE phone = ?').get(phoneNum)) {
      return res.status(409).json({ error: 'phone already registered' });
    }
  }
  const username = generateUsername();
  const displayName = name || username;
  const r = db
    .prepare('INSERT INTO users (name, email, phone, password_hash, role, username, display_name) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(displayName, addr, phoneNum, bcrypt.hashSync(password, 10), 'user', username, displayName);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(r.lastInsertRowid);
  res.status(201).json({ token: signToken(user), user: userToJson(user) });
});

app.post('/api/auth/login', (req, res) => {
  const { email, phone, password } = req.body || {};
  if ((!email && !phone) || !password) return res.status(400).json({ error: 'email or phone, and password required' });
  const user = email
    ? db.prepare('SELECT * FROM users WHERE email = ?').get(email)
    : db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'invalid credentials' });
  }
  if (user.locked) return res.status(401).json({ error: 'account locked' });
  res.json({ token: signToken(user), user: userToJson(user) });
});

app.get('/api/auth/me', auth, (req, res) => res.json(userToJson(req.user)));

// ----- OAuth (Facebook) -----

// Ensure oauth columns exist (migration for existing DBs)
try {
  db.exec('ALTER TABLE users ADD COLUMN oauth_provider TEXT');
} catch {}
try {
  db.exec('ALTER TABLE users ADD COLUMN oauth_id TEXT');
} catch {}

const pendingTokens = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of pendingTokens) if (v.expires < now) pendingTokens.delete(k);
}, 60000);

const FB_APP_ID = process.env.FACEBOOK_APP_ID || '';
const FB_APP_SECRET = process.env.FACEBOOK_APP_SECRET || '';
const FB_REDIRECT_URI = 'https://joinaroo.com/api/auth/facebook/callback';

app.get('/api/auth/facebook', (req, res) => {
  if (!FB_APP_ID) return res.status(500).send('Facebook OAuth not configured');
  const state = require('crypto').randomBytes(16).toString('hex');
  // Store state in a short-lived signed token to prevent CSRF
  const stateToken = jwt.sign({ state, ts: Date.now() }, JWT_SECRET, { expiresIn: '10m' });
  const params = new URLSearchParams({
    client_id: FB_APP_ID,
    redirect_uri: FB_REDIRECT_URI,
    state: stateToken,
    scope: 'email,public_profile',
    response_type: 'code',
  });
  res.redirect(`https://www.facebook.com/v18.0/dialog/oauth?${params}`);
});

app.get('/api/auth/facebook/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;
  const fail = (msg) => res.redirect(`/?oauth_error=${encodeURIComponent(msg)}`);
  if (error) return fail(error_description || error);
  if (!code || !state) return fail('missing code or state');
  try {
    const decodedState = jwt.verify(state, JWT_SECRET);
    req._oauthNative = decodedState && decodedState.native === true;
    req._oauthReturnUrl = decodedState && typeof decodedState.returnUrl === 'string' ? decodedState.returnUrl : null;
  } catch {
    return fail('invalid state');
  }
  try {
    // Exchange code for access token
    const tokenParams = new URLSearchParams({
      client_id: FB_APP_ID,
      client_secret: FB_APP_SECRET,
      redirect_uri: FB_REDIRECT_URI,
      code: String(code),
    });
    const tokenRes = await fetch(`https://graph.facebook.com/v18.0/oauth/access_token?${tokenParams}`);
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error(tokenData.error?.message || 'token exchange failed');

    // Get user profile
    const profileRes = await fetch(
      `https://graph.facebook.com/v18.0/me?fields=id,name,email&access_token=${tokenData.access_token}`
    );
    const profile = await profileRes.json();
    if (!profile.id) throw new Error(profile.error?.message || 'profile fetch failed');

    const email = profile.email ? String(profile.email).toLowerCase() : null;
    const name = profile.name || 'Facebook User';

    // Find existing user by oauth link, then by email
    let user = db.prepare('SELECT * FROM users WHERE oauth_provider = ? AND oauth_id = ?').get('facebook', profile.id);
    if (!user && email) {
      user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
      if (user) {
        // Link existing account to Facebook
        db.prepare('UPDATE users SET oauth_provider = ?, oauth_id = ? WHERE id = ?').run('facebook', profile.id, user.id);
        user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
      }
    }
    if (!user) {
      // Create new user (no password — OAuth only)
      const username = generateUsername();
      const r = db
        .prepare('INSERT INTO users (name, email, password_hash, role, username, display_name, oauth_provider, oauth_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(name, email, '', 'user', username, name, 'facebook', profile.id);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(r.lastInsertRowid);
    }
    if (user.locked) return fail('account locked');

    const token = signToken(user);
    res.redirect(oauthCallbackRedirect(req, token, 'facebook'));
  } catch (e) {
    console.error('Facebook OAuth error:', e.message);
    fail('authentication failed');
  }
});

const APPLE_CLIENT_ID = process.env.APPLE_CLIENT_ID || '';
const APPLE_TEAM_ID = process.env.APPLE_TEAM_ID || '';
const APPLE_KEY_ID = process.env.APPLE_KEY_ID || '';
const APPLE_PRIVATE_KEY = (process.env.APPLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const APPLE_REDIRECT_URI = 'https://joinaroo.com/api/auth/apple/callback';

// Mint Apple's client-secret JWT (ES256, valid up to 6 months; we mint fresh each time)
function appleClientSecret() {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { iss: APPLE_TEAM_ID, iat: now, exp: now + 15777000, aud: 'https://appleid.apple.com', sub: APPLE_CLIENT_ID },
    APPLE_PRIVATE_KEY,
    { algorithm: 'ES256', keyid: APPLE_KEY_ID }
  );
}

// Native apps pass ?native=true; redirect to the app scheme instead of the web callback
// Minimal page for native OAuth callbacks. The app's auth session
// intercepts this URL and closes the browser automatically.
app.get('/api/auth/native-done', (req, res) => {
  res.send('<!DOCTYPE html><html><head><title>Signed in</title></head><body><p>Signed in! Returning to the app...</p></body></html>');
});

function oauthCallbackRedirect(req, token, provider) {
  const exchangeId = require('crypto').randomBytes(16).toString('hex');
  pendingTokens.set(exchangeId, { token, expires: Date.now() + 5 * 60 * 1000 });
  const qs = 'exchange=' + exchangeId + '&provider=' + provider;
  // Native apps: redirect to the return_url. The auth session
  // intercepts the navigation.
  const returnUrl = req._oauthReturnUrl;
  if (returnUrl) {
    const sep = returnUrl.includes('?') ? '&' : '?';
    return returnUrl + sep + qs;
  }
  return '/auth/callback?' + qs;
}

function appleExchangeRedirect(token, provider) {
  const exchangeId = require('crypto').randomBytes(16).toString('hex');
  pendingTokens.set(exchangeId, { token, expires: Date.now() + 5 * 60 * 1000 });
  return '/auth/callback?exchange=' + exchangeId + '&provider=' + provider;
}

app.get('/api/auth/apple', (req, res) => {
  if (!APPLE_CLIENT_ID) return res.status(500).send('Apple OAuth not configured');
  const stateToken = jwt.sign(
    { ts: Date.now(), native: req.query.native === 'true', returnUrl: typeof req.query.return_url === 'string' ? req.query.return_url : null },
    JWT_SECRET,
    { expiresIn: '10m' }
  );
  const params = new URLSearchParams({
    client_id: APPLE_CLIENT_ID,
    redirect_uri: APPLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'name email',
    response_mode: 'form_post',
    state: stateToken,
  });
  res.redirect('https://appleid.apple.com/auth/authorize?' + params.toString());
});

// Apple uses form_post: the callback is a POST with form-encoded body
app.post('/api/auth/apple/callback', async (req, res) => {
  const { code, state, error, error_description, user: appleUserJson } = req.body || {};
  const fail = (msg) => res.redirect('/?oauth_error=' + encodeURIComponent(msg));
  if (error) return fail(error_description || error);
  if (!code || !state) return fail('missing code or state');
  try {
    jwt.verify(state, JWT_SECRET);
  } catch {
    return fail('invalid state');
  }
  try {
    const tokenRes = await fetch('https://appleid.apple.com/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: APPLE_CLIENT_ID,
        client_secret: appleClientSecret(),
        code: String(code),
        grant_type: 'authorization_code',
        redirect_uri: APPLE_REDIRECT_URI,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.id_token) throw new Error(tokenData.error_description || 'token exchange failed');

    // Decode the id_token (Apple signs it; we verify signature via the token endpoint trust)
    const idPayload = jwt.decode(tokenData.id_token);
    if (!idPayload || !idPayload.sub) throw new Error('invalid id_token');
    const appleSub = String(idPayload.sub);
    // Apple only sends name/email on FIRST authorization; parse if present
    let email = idPayload.email ? String(idPayload.email).toLowerCase() : null;
    let name = 'Apple User';
    if (appleUserJson) {
      try {
        const u = JSON.parse(appleUserJson);
        if (u.name) {
          const parts = [u.name.firstName, u.name.lastName].filter(Boolean);
          if (parts.length) name = parts.join(' ');
        }
      } catch {}
    }

    // Find existing user by oauth link, then by email
    let user = db.prepare('SELECT * FROM users WHERE oauth_provider = ? AND oauth_id = ?').get('apple', appleSub);
    if (!user && email) {
      user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
      if (user) {
        db.prepare('UPDATE users SET oauth_provider = ?, oauth_id = ? WHERE id = ?').run('apple', appleSub, user.id);
        user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
      }
    }
    if (!user) {
      const username = generateUsername();
      const r = db
        .prepare('INSERT INTO users (name, email, password_hash, role, username, display_name, oauth_provider, oauth_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(name, email, '', 'user', username, name, 'apple', appleSub);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(r.lastInsertRowid);
    }
    if (user.locked) return fail('account locked');

    const token = signToken(user);
    res.redirect(appleExchangeRedirect(token, 'apple'));
  } catch (e) {
    console.error('Apple OAuth error:', e.message);
    fail('authentication failed');
  }
});

// Exchange a short-lived ID for an OAuth token (avoids long tokens in URLs)
app.get('/api/auth/exchange', (req, res) => {
  const idq = req.query.id;
  if (!idq || typeof idq !== 'string') return res.status(400).json({ error: 'missing id' });
  const entry = pendingTokens.get(idq);
  if (!entry) return res.status(404).json({ error: 'expired or invalid' });
  pendingTokens.delete(idq);
  if (entry.expires < Date.now()) return res.status(404).json({ error: 'expired or invalid' });
  res.json({ token: entry.token });
});

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_REDIRECT_URI = 'https://joinaroo.com/api/auth/google/callback';

app.get('/api/auth/google', (req, res) => {
  if (!GOOGLE_CLIENT_ID) return res.status(500).send('Google OAuth not configured');
  const stateToken = jwt.sign(
    { ts: Date.now(), native: req.query.native === 'true', returnUrl: typeof req.query.return_url === 'string' ? req.query.return_url : null },
    JWT_SECRET,
    { expiresIn: '10m' }
  );
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    state: stateToken,
    access_type: 'online',
    prompt: 'select_account',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

app.get('/api/auth/google/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;
  const fail = (msg) => res.redirect(`/?oauth_error=${encodeURIComponent(msg)}`);
  if (error) return fail(error_description || error);
  if (!code || !state) return fail('missing code or state');
  try {
    const decodedState = jwt.verify(state, JWT_SECRET);
    req._oauthNative = decodedState && decodedState.native === true;
    req._oauthReturnUrl = decodedState && typeof decodedState.returnUrl === 'string' ? decodedState.returnUrl : null;
  } catch {
    return fail('invalid state');
  }
  try {
    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
        code: String(code),
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error(tokenData.error_description || 'token exchange failed');

    // Get user profile
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = await profileRes.json();
    if (!profile.sub) throw new Error('profile fetch failed');

    const email = profile.email ? String(profile.email).toLowerCase() : null;
    const name = profile.name || 'Google User';

    // Find existing user by oauth link, then by email
    let user = db.prepare('SELECT * FROM users WHERE oauth_provider = ? AND oauth_id = ?').get('google', profile.sub);
    if (!user && email) {
      user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
      if (user) {
        // Link existing account to Google
        db.prepare('UPDATE users SET oauth_provider = ?, oauth_id = ? WHERE id = ?').run('google', profile.sub, user.id);
        user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
      }
    }
    if (!user) {
      // Create new user (no password — OAuth only)
      const username = generateUsername();
      const r = db
        .prepare('INSERT INTO users (name, email, password_hash, role, username, display_name, oauth_provider, oauth_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(name, email, '', 'user', username, name, 'google', profile.sub);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(r.lastInsertRowid);
    }
    if (user.locked) return fail('account locked');

    const token = signToken(user);
    const exchangeId = require('crypto').randomBytes(16).toString('hex');
    pendingTokens.set(exchangeId, { token, expires: Date.now() + 5 * 60 * 1000 });
    res.redirect(oauthCallbackRedirect(req, token, 'google'));
  } catch (e) {
    console.error('Google OAuth error:', e.message);
    fail('authentication failed');
  }
});

// Update own profile: username, display_name, is_private
app.patch('/api/auth/me', auth, (req, res) => {
  const { username, display_name, is_private } = req.body || {};
  const updates = [];
  const vals = [];
  if (username !== undefined) {
    const u = String(username).trim().replace(/^@/, '');
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(u)) {
      return res.status(400).json({ error: 'username must be 3-30 chars, letters/numbers/underscore' });
    }
    const taken = db.prepare('SELECT 1 FROM users WHERE username = ? AND id != ?').get(u, req.user.id);
    if (taken) return res.status(409).json({ error: 'username taken' });
    updates.push('username = ?'); vals.push(u);
  }
  if (display_name !== undefined) {
    const d = String(display_name).trim().slice(0, 60);
    if (!d) return res.status(400).json({ error: 'display name cannot be empty' });
    updates.push('display_name = ?'); vals.push(d);
  }
  if (is_private !== undefined) {
    updates.push('is_private = ?'); vals.push(is_private ? 1 : 0);
  }
  if (!updates.length) return res.status(400).json({ error: 'nothing to update' });
  vals.push(req.user.id);
  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...vals);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json(userToJson(user));
});

// Upload own avatar (base64), sets avatar_url
app.post('/api/auth/avatar', auth, (req, res) => {
  const { image_data } = req.body || {};
  const m = /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(image_data || ''));
  if (!m || !PHOTO_MIME[m[1]]) {
    return res.status(400).json({ error: 'image_data required as data:image/{jpeg,png,webp,gif};base64,...' });
  }
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length === 0 || buf.length > 10 * 1024 * 1024) {
    return res.status(400).json({ error: 'image must be non-empty and under 10MB' });
  }
  const filename = `avatar-${req.user.id}-${Date.now()}.${PHOTO_MIME[m[1]]}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), buf);
  // remove old avatar file if ours
  const old = req.user.avatar_url;
  db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(`/api/uploads/${filename}`, req.user.id);
  if (old && old.startsWith('/api/uploads/avatar-')) {
    try { fs.unlinkSync(path.join(UPLOAD_DIR, path.basename(old))); } catch (e) {}
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json(userToJson(user));
});

// ----- SMS via Telnyx (phone verification) -----
// Set TELNYX_API_KEY and TELNYX_FROM_NUMBER to enable real SMS.
// Without them, codes are logged and the dev inbox shows them (no SMS sent).
async function sendSms(to, text) {
  const apiKey = process.env.TELNYX_API_KEY;
  const from = process.env.TELNYX_FROM_NUMBER;
  if (!apiKey || !from) {
    console.log(`[sms:dev] to ${to}: ${text}`);
    return { dev: true };
  }
  const res = await fetch('https://api.telnyx.com/v2/messages', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, text }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telnyx SMS failed (${res.status}): ${body.slice(0, 200)}`);
  }
  return await res.json();
}

// ----- email verification (6-digit code) -----

// Outbound email: Resend HTTP API when RESEND_API_KEY is set; otherwise Mailpit
// (localhost:1025) via nodemailer so the dev inbox at /dev/inbox keeps working.
const smtpTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || '127.0.0.1',
  port: Number(process.env.SMTP_PORT || 1025),
  secure: false,
  ignoreTLS: true,
});
const SMTP_FROM = process.env.SMTP_FROM || 'Southern Maine Events <noreply@smevents.dev>';
const RESEND_FROM = process.env.RESEND_FROM || 'Joinaroo <noreply@joinaroo.com>';

async function sendEmail(to, subject, text, html) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    await smtpTransporter.sendMail({ from: SMTP_FROM, to, subject, text, html });
    return { dev: true };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: RESEND_FROM, to: [to], subject, text, html }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend email failed (${res.status}): ${body.slice(0, 200)}`);
  }
  return await res.json();
}

const CODE_TTL_MIN = 10;
const CODE_MAX_ATTEMPTS = 5;

function isValidEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());
}

// Step 1: request a 6-digit code for an email address.
app.post('/api/auth/request-code', async (req, res) => {
  const { email } = req.body || {};
  const addr = String(email || '').trim().toLowerCase();
  if (!isValidEmail(addr)) return res.status(400).json({ error: 'valid email required' });
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(addr)) {
    return res.status(409).json({ error: 'email already registered' });
  }
  // Rate-limit: one code per 60s per address.
  const existing = db.prepare('SELECT * FROM email_verifications WHERE email = ?').get(addr);
  if (existing) {
    const ageSec = (Date.now() - new Date(existing.created_at.replace(' ', 'T') + 'Z').getTime()) / 1000;
    if (ageSec < 60) return res.json({ sent: true, already_sent: true, expires_in_minutes: CODE_TTL_MIN });
  }
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + CODE_TTL_MIN * 60 * 1000).toISOString();
  db.prepare(
    `INSERT INTO email_verifications (email, code_hash, expires_at, attempts)
     VALUES (?, ?, ?, 0)
     ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, created_at = datetime('now')`,
  ).run(addr, bcrypt.hashSync(code, 10), expiresAt);
  try {
    await sendEmail(
      addr,
      'Your Joinaroo verification code',
      `Your verification code is: ${code}\n\nIt expires in ${CODE_TTL_MIN} minutes.`,
      `<p>Your verification code is:</p><p style="font-size:28px;font-weight:bold;letter-spacing:4px">${code}</p><p>It expires in ${CODE_TTL_MIN} minutes.</p>`,
    );
  } catch (e) {
    return res.status(502).json({ error: 'could not send email — try again' });
  }
  res.json({ sent: true, expires_in_minutes: CODE_TTL_MIN });
});

// Step 2: verify the code. Returns a short-lived verification token for registration.
app.post('/api/auth/verify-code', (req, res) => {
  const { email, code } = req.body || {};
  const addr = String(email || '').trim().toLowerCase();
  const row = db.prepare('SELECT * FROM email_verifications WHERE email = ?').get(addr);
  if (!row) return res.status(400).json({ error: 'no code requested for this email' });
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM email_verifications WHERE email = ?').run(addr);
    return res.status(400).json({ error: 'code expired — request a new one' });
  }
  if (row.attempts >= CODE_MAX_ATTEMPTS) {
    db.prepare('DELETE FROM email_verifications WHERE email = ?').run(addr);
    return res.status(429).json({ error: 'too many attempts — request a new code' });
  }
  if (!bcrypt.compareSync(String(code || '').trim(), row.code_hash)) {
    db.prepare('UPDATE email_verifications SET attempts = attempts + 1 WHERE email = ?').run(addr);
    return res.status(401).json({ error: 'incorrect code' });
  }
  db.prepare('DELETE FROM email_verifications WHERE email = ?').run(addr);
  const verificationToken = jwt.sign({ email: addr, verified: true }, JWT_SECRET, { expiresIn: '15m' });
  res.json({ verified: true, verification_token: verificationToken });
});

// ----- phone verification (6-digit code via Telnyx SMS) -----

function normalizePhone(s) {
  const p = String(s || '').trim();
  if (!/^\+[1-9]\d{7,14}$/.test(p)) return null;
  return p;
}

// Step 1: request a 6-digit code for a phone number (E.164).
app.post('/api/auth/request-phone-code', async (req, res) => {
  const { phone } = req.body || {};
  const p = normalizePhone(phone);
  if (!p) return res.status(400).json({ error: 'valid phone number required (E.164, e.g. +15551234567)' });
  if (db.prepare('SELECT 1 FROM users WHERE phone = ?').get(p)) {
    return res.status(409).json({ error: 'phone already registered' });
  }
  const existing = db.prepare('SELECT * FROM phone_verifications WHERE phone = ?').get(p);
  if (existing) {
    const ageSec = (Date.now() - new Date(existing.created_at.replace(' ', 'T') + 'Z').getTime()) / 1000;
    if (ageSec < 60) return res.json({ sent: true, already_sent: true, expires_in_minutes: CODE_TTL_MIN });
  }
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + CODE_TTL_MIN * 60 * 1000).toISOString();
  db.prepare(
    `INSERT INTO phone_verifications (phone, code_hash, expires_at, attempts)
     VALUES (?, ?, ?, 0)
     ON CONFLICT(phone) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, created_at = datetime('now')`,
  ).run(p, bcrypt.hashSync(code, 10), expiresAt);
  try {
    await sendSms(p, `Your Joinaroo code is ${code}. It expires in ${CODE_TTL_MIN} minutes.`);
  } catch (e) {
    return res.status(502).json({ error: `could not send SMS: ${e.message}` });
  }
  const dev = process.env.NODE_ENV !== 'production' && !process.env.TELNYX_API_KEY;
  res.json({ sent: true, expires_in_minutes: CODE_TTL_MIN, ...(dev ? { dev_code: code } : {}) });
});

// Step 2: verify the phone code. Returns a short-lived verification token.
app.post('/api/auth/verify-phone-code', (req, res) => {
  const { phone, code } = req.body || {};
  const p = normalizePhone(phone);
  if (!p) return res.status(400).json({ error: 'valid phone number required' });
  const row = db.prepare('SELECT * FROM phone_verifications WHERE phone = ?').get(p);
  if (!row) return res.status(400).json({ error: 'no code requested for this number' });
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM phone_verifications WHERE phone = ?').run(p);
    return res.status(400).json({ error: 'code expired — request a new one' });
  }
  if (row.attempts >= CODE_MAX_ATTEMPTS) {
    db.prepare('DELETE FROM phone_verifications WHERE phone = ?').run(p);
    return res.status(429).json({ error: 'too many attempts — request a new code' });
  }
  if (!bcrypt.compareSync(String(code || '').trim(), row.code_hash)) {
    db.prepare('UPDATE phone_verifications SET attempts = attempts + 1 WHERE phone = ?').run(p);
    return res.status(401).json({ error: 'incorrect code' });
  }
  db.prepare('DELETE FROM phone_verifications WHERE phone = ?').run(p);
  const verificationToken = jwt.sign({ phone: p, verified: true }, JWT_SECRET, { expiresIn: '15m' });
  res.json({ verified: true, verification_token: verificationToken });
});

// ----- password reset (6-digit code via email or SMS) -----

// Step 1: request a reset code. The account must exist.
app.post('/api/auth/request-password-reset', async (req, res) => {
  const { email, phone } = req.body || {};
  let identifier, channel;
  if (email) {
    const addr = String(email).trim().toLowerCase();
    if (!isValidEmail(addr)) return res.status(400).json({ error: 'valid email required' });
    if (!db.prepare('SELECT 1 FROM users WHERE email = ?').get(addr)) {
      return res.status(404).json({ error: 'no account found for this email' });
    }
    identifier = addr;
    channel = 'email';
  } else if (phone) {
    const p = normalizePhone(phone);
    if (!p) return res.status(400).json({ error: 'valid phone number required (E.164)' });
    if (!db.prepare('SELECT 1 FROM users WHERE phone = ?').get(p)) {
      return res.status(404).json({ error: 'no account found for this phone number' });
    }
    identifier = p;
    channel = 'sms';
  } else {
    return res.status(400).json({ error: 'email or phone required' });
  }
  // Rate-limit: one code per 60s per identifier.
  const existing = db.prepare('SELECT * FROM password_resets WHERE identifier = ?').get(identifier);
  if (existing) {
    const ageSec = (Date.now() - new Date(existing.created_at.replace(' ', 'T') + 'Z').getTime()) / 1000;
    if (ageSec < 60) return res.json({ sent: true, already_sent: true, expires_in_minutes: CODE_TTL_MIN });
  }
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + CODE_TTL_MIN * 60 * 1000).toISOString();
  db.prepare(
    `INSERT INTO password_resets (identifier, channel, code_hash, expires_at, attempts)
     VALUES (?, ?, ?, ?, 0)
     ON CONFLICT(identifier) DO UPDATE SET channel = excluded.channel, code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, created_at = datetime('now')`,
  ).run(identifier, channel, bcrypt.hashSync(code, 10), expiresAt);
  try {
    if (channel === 'email') {
      await sendEmail(
        identifier,
        'Your Joinaroo password reset code',
        `Your password reset code is: ${code}\n\nIt expires in ${CODE_TTL_MIN} minutes. If you didn't request this, ignore this email.`,
        `<p>Your password reset code is:</p><p style="font-size:28px;font-weight:bold;letter-spacing:4px">${code}</p><p>It expires in ${CODE_TTL_MIN} minutes. If you didn't request this, ignore this email.</p>`,
      );
    } else {
      await sendSms(identifier, `Your Joinaroo password reset code is ${code}. It expires in ${CODE_TTL_MIN} minutes.`);
    }
  } catch (e) {
    return res.status(502).json({ error: 'could not send code — try again' });
  }
  res.json({ sent: true, expires_in_minutes: CODE_TTL_MIN });
});

// Step 2: verify the reset code. Returns a short-lived reset token.
app.post('/api/auth/verify-reset-code', (req, res) => {
  const { email, phone, code } = req.body || {};
  const identifier = email ? String(email).trim().toLowerCase() : normalizePhone(phone);
  if (!identifier) return res.status(400).json({ error: 'email or phone required' });
  const row = db.prepare('SELECT * FROM password_resets WHERE identifier = ?').get(identifier);
  if (!row) return res.status(400).json({ error: 'no reset requested for this account' });
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM password_resets WHERE identifier = ?').run(identifier);
    return res.status(400).json({ error: 'code expired — request a new one' });
  }
  if (row.attempts >= CODE_MAX_ATTEMPTS) {
    db.prepare('DELETE FROM password_resets WHERE identifier = ?').run(identifier);
    return res.status(429).json({ error: 'too many attempts — request a new code' });
  }
  if (!bcrypt.compareSync(String(code || '').trim(), row.code_hash)) {
    db.prepare('UPDATE password_resets SET attempts = attempts + 1 WHERE identifier = ?').run(identifier);
    return res.status(401).json({ error: 'incorrect code' });
  }
  db.prepare('DELETE FROM password_resets WHERE identifier = ?').run(identifier);
  const resetToken = jwt.sign({ identifier, purpose: 'password_reset' }, JWT_SECRET, { expiresIn: '15m' });
  res.json({ verified: true, reset_token: resetToken });
});

// Step 3: set the new password.
app.post('/api/auth/reset-password', (req, res) => {
  const { reset_token, new_password } = req.body || {};
  let payload;
  try {
    payload = jwt.verify(reset_token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'invalid or expired reset token' });
  }
  if (!payload || payload.purpose !== 'password_reset' || !payload.identifier) {
    return res.status(401).json({ error: 'invalid reset token' });
  }
  const pw = String(new_password || '');
  if (pw.length < 8 || pw.length > 20 || !/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw) || !/[^a-zA-Z0-9]/.test(pw)) {
    return res.status(400).json({ error: 'password must be 8–20 characters with letters, numbers, and special characters' });
  }
  const identifier = payload.identifier;
  const user = identifier.includes('@')
    ? db.prepare('SELECT id FROM users WHERE email = ?').get(identifier)
    : db.prepare('SELECT id FROM users WHERE phone = ?').get(identifier);
  if (!user) return res.status(404).json({ error: 'account not found' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(pw, 10), user.id);
  res.json({ reset: true });
});

// Public profile by username. This endpoint renders the public view of the
// profile — what a stranger sees. When the profile is private, saves are
// hidden ("private") for everyone, including the owner; the owner manages
// their own saves via GET /api/saves (My Saves).
app.get('/api/users/:username', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE username = ?').get(req.params.username);
  if (!u) return res.status(404).json({ error: 'user not found' });
  let viewerId = null;
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(h.slice(7), JWT_SECRET);
      viewerId = payload.id;
    } catch (e) {}
  }
  const isOwner = viewerId === u.id;
  const profile = {
    username: u.username,
    display_name: u.display_name || u.name,
    avatar_url: u.avatar_url || null,
    is_private: !!u.is_private,
    created_at: u.created_at,
    is_owner: isOwner,
  };
  if (u.is_private) {
    profile.saves = 'private';
    profile.save_count = db.prepare('SELECT COUNT(*) n FROM user_saves WHERE user_id = ?').get(u.id).n;
  } else {
    profile.saves = db.prepare(
      `${EVENT_SELECT} JOIN user_saves s ON s.event_id = e.id
       WHERE s.user_id = ? AND ${SAVED_NOT_OVER} ORDER BY e.starts_at ASC`
    ).all(u.id, etToday()).map(r => eventToJson(r));
  }
  res.json(profile);
});

// ----- saves (server-side, per account) -----

// A saved event stays in My Saves until it is over: its ends_at when recorded,
// otherwise through the end of its start day (America/New_York). Returns today's
// ET date (YYYY-MM-DD) for the no-end-time branch of the filter.
function etToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}
const SAVED_NOT_OVER = `(datetime(COALESCE(e.ends_at, e.starts_at)) >= datetime('now')
  OR (e.ends_at IS NULL AND substr(e.starts_at, 1, 10) >= ?))`;


app.get('/api/saves', auth, (req, res) => {
  const rows = db.prepare(
    `${EVENT_SELECT} JOIN user_saves s ON s.event_id = e.id
     WHERE s.user_id = ? AND ${SAVED_NOT_OVER} ORDER BY e.starts_at ASC`
  ).all(req.user.id, etToday());
  res.json({ saves: rows.map(r => eventToJson(r)) });
});

app.post('/api/saves/:eventId', auth, (req, res) => {
  const ev = db.prepare('SELECT id FROM events WHERE id = ?').get(req.params.eventId);
  if (!ev) return res.status(404).json({ error: 'event not found' });
  db.prepare('INSERT OR IGNORE INTO user_saves (user_id, event_id) VALUES (?, ?)').run(req.user.id, ev.id);
  res.status(201).json({ saved: true, event_id: ev.id });
});

app.delete('/api/saves/:eventId', auth, (req, res) => {
  db.prepare('DELETE FROM user_saves WHERE user_id = ? AND event_id = ?').run(req.user.id, req.params.eventId);
  res.json({ saved: false, event_id: Number(req.params.eventId) });
});

// ----- events -----

const EVENT_SELECT = `
  SELECT e.id, e.slug, e.title, e.description, e.starts_at, e.ends_at,
         e.cost_free, e.cost_text, e.url, e.source, e.featured, e.sold_out, e.community_pick, e.featured_pin, e.strip_focus, e.photo_focus, e.card_image_url, e.card_layout, e.card_top_ratio, e.game_summary, e.community, e.hidden, e.finder_followed, e.finder_committed, e.room_proof_off,
         e.image_url, e.recurrence, e.series_key,
         e.created_at, e.updated_at,
         c.id AS cat_id, c.slug AS cat_slug, c.name AS cat_name,
         v.id AS venue_id, v.name AS venue_name, v.address AS venue_address,
         v.city AS venue_city, v.lat AS venue_lat, v.lng AS venue_lng
  FROM events e
  JOIN categories c ON c.id = e.category_id
  LEFT JOIN venues v ON v.id = e.venue_id`;

/**
 * Live-card data: the people whose credited photos are on an event
 * (distinct photo_sources, newest photo first), plus the newest credited
 * photo as the card thumbnail. An event with live_people is a "live"
 * event card. Returns a Map: event_id -> { people, photo_url }.
 */
function livePeopleFor(eventIds) {
  const out = new Map();
  if (!eventIds.length) return out;
  const marks = eventIds.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT p.event_id AS eid, p.filename,
              s.id AS sid, s.name AS sname, s.ig_username AS ig, s.x_username AS xu,
              s.facebook AS fb, s.fb_username AS fbu,
              s.avatar_url AS avatar, s.ig_post_url AS igpost, s.x_post_url AS xpost
       FROM event_photos p JOIN photo_sources s ON s.id = p.source_id
       WHERE p.event_id IN (${marks})
       ORDER BY p.id DESC`
    )
    .all(...eventIds);
  for (const r of rows) {
    let entry = out.get(r.eid);
    if (!entry) {
      entry = { people: [], seen: new Set(), photo_url: `/api/uploads/${r.filename}` };
      out.set(r.eid, entry);
    }
    if (!entry.seen.has(r.sid)) {
      entry.seen.add(r.sid);
      entry.people.push({
        name: r.sname,
        handle: r.ig || r.xu || r.fbu || null,
        platform: r.ig ? 'instagram' : r.xu ? 'x' : (r.fb || r.fbu) ? 'facebook' : null,
        avatar_url: r.avatar || null,
        post_url: r.igpost || r.xpost || r.fb || null,
      });
    }
  }
  for (const entry of out.values()) delete entry.seen;
  return out;
}

function attachLive(events) {
  const live = livePeopleFor(events.map((e) => Number(e.id)));
  // Total photo count per event (credited or not) — cards render
  // "View photos (N)" on the ended panel (Angelo, Oct 25).
  const ids = events.map((e) => Number(e.id));
  const counts = new Map();
  if (ids.length) {
    const marks = ids.map(() => '?').join(',');
    const rows = db
      .prepare(
        `SELECT event_id AS eid, COUNT(*) AS c FROM event_photos
         WHERE event_id IN (${marks}) GROUP BY event_id`
      )
      .all(...ids);
    for (const r of rows) counts.set(r.eid, r.c);
  }
  for (const e of events) {
    const entry = live.get(Number(e.id));
    e.live_people = entry ? entry.people : [];
    e.live_photo_url = entry ? entry.photo_url : null;
    e.photo_count = counts.get(Number(e.id)) ?? 0;
  }
  return events;
}

/** Attach live-score state (event_scores, kept fresh by score-poller.js)
 * as e.live_score — {status, home_team, away_team, home_score,
 * away_score, period, updated_at} or null when the event has no tracked
 * game. Display gating (live/final only) lives in the clients. */
function attachScores(events) {
  const ids = events.map((e) => Number(e.id)).filter((n) => Number.isFinite(n));
  if (!ids.length) return events;
  const marks = ids.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT event_id, status, home_team, away_team, home_score, away_score, period, updated_at
       FROM event_scores WHERE event_id IN (${marks})`
    )
    .all(...ids);
  const byId = new Map(rows.map((r) => [r.event_id, r]));
  for (const e of events) {
    const r = byId.get(Number(e.id));
    e.live_score = r
      ? {
          status: r.status,
          home_team: r.home_team,
          away_team: r.away_team,
          home_score: r.home_score,
          away_score: r.away_score,
          period: r.period,
          updated_at: r.updated_at,
        }
      : null;
  }
  return events;
}

/**
 * "Event listing with photos" pool (Angelo, Oct 27): an upcoming event
 * with no photos of its own borrows photos from the same home team's
 * previous games at the same venue — last time's photos surface on the
 * next listing at the decision moment (the FOMO arc). Home team = the
 * title segment before " vs ". Returns null when the event does not
 * qualify: it already has photos, it has started, it has no venue, its
 * title has no " vs ", or no earlier same-team game at the venue has
 * photos. At most the 3 most recent such games are pooled, newest game
 * first, each game's photos newest first — so as each new game picks up
 * photos of its own (and flips to a live/ended listing), the remaining
 * upcoming listings roll forward to the last 3 games automatically.
 */
/**
 * Room Proof (Angelo, Nov 2; Spark-consulted): idea 2 at venue level. For an
 * event with no photos of its own at a venue where the finder has a real
 * track record, serve (a) curated proof photos from a past night in that
 * room and (b) when this event is finder-committed, a plain-language
 * prediction backed by the venue's followed record. Presence is the claim,
 * never volume; the prediction retires at the end of the live window and
 * the whole module retires the moment the event has its own photos.
 * Gate history: v1 auto-qualified a venue (>= 4 followed nights, > 75%
 * produced photos, one 20+ night in 90 days) — only State Theatre passed.
 * Angelo's expansion (Nov 2, later same day) replaced the auto gate with
 * curation: a venue is enabled by having hand-picked proof photos in
 * ROOM_PROOF_PICKS below (AURA and PHOME added at n=2 and n=1 followed
 * nights). The honesty load is carried by the copy instead: the proof
 * line only ever states the one night's facts, the track-record sub-line
 * still prints only at n >= 7 followed nights, and the commitment panel
 * speaks only about our own checking, never the venue's yield.
 */
const ROOM_PROOF_PICKS = {
  // venue_id -> curated proof night + photo ids (crowd/room shots,
  // hand-picked and verified visually Nov 2, 2026).
  1: { event_id: 20, photo_ids: [71, 69, 75] }, // State Theatre — Thundercat, Oct 19 (re-picked Nov 2 per Spark: clean-reading credits — Jaidin Hicks room + crowd shots, Shaw Gianni stage-from-floor)
  3: { event_id: 1359, label: 'Hawthorne Heights with Letlive and Creeper', photo_ids: [608, 601, 610] }, // AURA — Oct 23 (Harry Steel: room-wide, crowd close-up, behind-the-drums)
  1902: { event_id: 2334, label: 'Red Eye Flight Crew', photo_ids: [1026, 1025, 1024] }, // Portland House of Music — Oct 31 (Hannah Cormier: packed room, stage + crowd, performers + crowd)
  436: { event_id: 2352, label: 'A Very Jerry', photo_ids: [1005, 1007, 1012] }, // Bayside Bowl — Oct 31 (Gilhooley stage + crowd, Wells costumed fans in the room, Herrick's Jerry crowd)
  720: { event_id: 745, label: 'Blind Boys of Alabama', photo_ids: [160, 157, 158] }, // Waterville Opera House — Oct 24 (Ellen Richmond: standing applauding house, then the group on stage)
};

function roomProofFor(row, ownPhotoCount) {
  if (!row.venue_id || ownPhotoCount > 0) return null;
  if (row.room_proof_off) return null; // genre guard: comedy/spoken/film
  const picks = ROOM_PROOF_PICKS[row.venue_id];
  if (!picks) return null;
  const followed = db
    .prepare(
      `SELECT e.id, e.starts_at,
              (SELECT COUNT(*) FROM event_photos p WHERE p.event_id = e.id) AS n
         FROM events e
        WHERE e.venue_id = ? AND e.finder_followed = 1 AND e.hidden = 0`
    )
    .all(row.venue_id);
  const withPhotos = followed.filter((f) => f.n > 0);
  const proofEvent = db
    .prepare('SELECT id, slug, title, starts_at FROM events WHERE id = ?')
    .get(picks.event_id);
  if (!proofEvent) return null;
  // Staleness (Spark review, Nov 2): a proof night older than 60 days
  // reads as misleading, not as memory — the module steps aside.
  if (Date.now() - +new Date(proofEvent.starts_at) > 60 * 24 * 3600000) return null;
  const proofCount = db
    .prepare('SELECT COUNT(*) AS n FROM event_photos WHERE event_id = ?')
    .get(proofEvent.id).n;
  const photos = picks.photo_ids
    .map((pid) =>
      db
        .prepare(
          `SELECT p.filename, s.name AS source_name FROM event_photos p
            LEFT JOIN photo_sources s ON s.id = p.source_id WHERE p.id = ?`
        )
        .get(pid)
    )
    .filter(Boolean)
    .map((p) => ({ url: `/api/uploads/${p.filename}`, credit: p.source_name || null }));
  if (!photos.length) return null;
  const dateLabel = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
  }).format(new Date(proofEvent.starts_at));
  let prediction = null;
  let postmortem = false;
  if (row.finder_committed) {
    const startMs = +new Date(row.starts_at);
    const liveEndMs = row.ends_at
      ? +new Date(row.ends_at) + 3600000
      : Math.min(etNextMidnightMs(row.starts_at), startMs + 4 * 3600000);
    if (Date.now() <= liveEndMs) {
      const fmtHour = (ms) =>
        new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/New_York',
          hour: 'numeric',
          hour12: true,
        })
          .format(new Date(ms))
          .toLowerCase()
          .replace(' ', '');
      const h1 = fmtHour(startMs + 3600000);
      const h2 = fmtHour(startMs + 3 * 3600000);
      const m1 = h1.replace(/[0-9]/g, '');
      const m2 = h2.replace(/[0-9]/g, '');
      const windowLabel = m1 === m2 ? `${h1.replace(m1, '')} and ${h2}` : `${h1} and ${h2}`;
      prediction = {
        window_label: windowLabel,
        // Track-record sub-line only once the sample can carry it
        // (Spark review, Nov 2: floor of 7 followed nights).
        followed: followed.length >= 7 ? followed.length : null,
        with_photos: followed.length >= 7 ? withPhotos.length : null,
      };
    } else if (Date.now() <= liveEndMs + 24 * 3600000) {
      // Post-mortem (Spark review, Nov 2): a committed event that ended
      // photo-less in the last 24h says so instead of silently vanishing.
      postmortem = true;
    }
  }
  return {
    venue_name: row.venue_name,
    proof: {
      event_id: proofEvent.id,
      slug: proofEvent.slug,
      title: picks.label || proofEvent.title,
      date_label: dateLabel,
      photo_count: proofCount,
      photos,
    },
    prediction,
    postmortem,
  };
}

/**
 * The Peephole (Spark consult, Nov 2; piloted on Blue October at Angelo's
 * direction): a slim city-status strip for event pages — rooms that are
 * live RIGHT NOW, or failing that, last night's rooms. Never an empty
 * state: if nothing qualifies, nothing renders.
 * Quality gate (Spark's, incl. its Nov 2 fix list): a room qualifies
 * only with >= 3 credited photos that are vision-stamped as showing
 * visible people (event_photos.has_people). LIVE = those people
 * photos landed in the last 90 minutes while the event is inside its
 * live window (the live-pill rule). LAST NIGHT = the most recent ET
 * day in the last 3 with qualifying rooms (people photos uploaded
 * within 48h of the event's start, to absorb next-day posting lag).
 * Rooms are home-city only and never the page's own event or venue.
 */
// Rollout history (all Nov 2, all Angelo's calls): pilot on one page
// (Blue October) -> all Portland pages -> SITE-WIDE. There is no city
// gate anymore: the strip renders exactly where a city's own coverage
// earns it (home-city rooms, indoor, >=3 people photos, fallback needs
// >=2 rooms inside ~48h) and nowhere else.
function peepholeFor(currentEventId) {
  const now = Date.now();
  // Rooms are the page's own city's night, full stop (Spark fix,
  // Nov 2): "LIVE NOW IN MAINE" is a weather report, not a peephole.
  // If the home city has nothing, the strip does not render. Skips
  // are per-EVENT, not per-venue (Spark re-review): the page's own
  // event, and the Room Proof proof night for this venue — a second,
  // different night at the same room is reinforcement, not a dupe.
  const curVenue = db
    .prepare(
      'SELECT v.id AS venue_id, v.city AS city FROM events e JOIN venues v ON v.id = e.venue_id WHERE e.id = ?'
    )
    .get(currentEventId);
  if (!curVenue || !curVenue.city) return null;
  const proofPick = ROOM_PROOF_PICKS[curVenue.venue_id];
  const proofEventId = proofPick ? proofPick.event_id : null;
  const sinceUtc = new Date(now - 5 * 24 * 3600000)
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ');
  const rows = db
    .prepare(
      `SELECT e.id AS eid, e.slug, e.title, e.starts_at, e.ends_at, e.venue_id,
              v.name AS venue_name, v.city AS city,
              p.filename, p.created_at, p.has_people
         FROM event_photos p
         JOIN events e ON e.id = p.event_id
         JOIN venues v ON v.id = e.venue_id
        WHERE p.source_id IS NOT NULL AND p.created_at >= ? AND e.hidden = 0 AND v.is_indoor = 1
        ORDER BY p.created_at DESC`
    )
    .all(sinceUtc);
  const byEvent = new Map();
  for (const r of rows) {
    if (r.eid === currentEventId) continue;
    if (proofEventId && r.eid === proofEventId) continue; // Room Proof's night
    if (r.city !== curVenue.city) continue; // home city only
    if (!byEvent.has(r.eid)) {
      const startMs = +new Date(r.starts_at);
      byEvent.set(r.eid, {
        event_id: r.eid,
        slug: r.slug,
        title: r.title,
        venue_name: r.venue_name,
        city: r.city,
        ends_at: r.ends_at,
        startMs,
        liveEndMs: r.ends_at
          ? +new Date(r.ends_at) + 3600000
          : Math.min(etNextMidnightMs(r.starts_at), startMs + 4 * 3600000),
        photos: [],
      });
    }
    byEvent.get(r.eid).photos.push({
      filename: r.filename,
      at: Date.parse(r.created_at.replace(' ', 'T') + 'Z'),
      people: r.has_people === 1,
    });
  }
  const cityLabel = () => curVenue.city.toUpperCase();
  // A peephole "room" is a NIGHT out (Spark's premise: "is this worth
  // my night?"). A daytime fair or race with photos is not a room, so
  // both modes require an evening event: starts at/after 4pm ET, or
  // runs to 8pm ET or later (incl. past midnight). (Angelo can lift
  // this; added Nov 2 when the first LAST NIGHT computation surfaced
  // a daytime craft fair and an all-day car show.)
  const etHour = (ms) =>
    Number(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        hour: 'numeric',
        hour12: false,
      }).format(new Date(ms)),
    ) % 24;
  const isEvening = (ev) => {
    if (etHour(ev.startMs) >= 16) return true;
    if (!ev.ends_at) return false;
    const endHour = etHour(+new Date(ev.ends_at));
    return endHour >= 20 || endHour < 5;
  };
  // LIVE NOW. People gate (Spark's original spec, restored Nov 2):
  // only vision-stamped people photos count, and the thumb is the
  // newest PEOPLE photo, never newest-in-batch. No "min ago" — our
  // uploads land in finder batches, so minute precision would be
  // measuring our scan, not the crowd's moment.
  const liveRooms = [];
  for (const ev of byEvent.values()) {
    if (!isEvening(ev)) continue;
    if (!(ev.startMs <= now && now <= ev.liveEndMs)) continue;
    const fresh = ev.photos.filter((p) => p.people && now - p.at <= 90 * 60000);
    if (fresh.length < 3) continue;
    liveRooms.push({
      event_id: ev.event_id,
      slug: ev.slug,
      title: ev.title,
      venue_name: ev.venue_name,
      city: ev.city,
      photo_count: fresh.length,
      thumb_url: `/api/uploads/${fresh[0].filename}`,
      latest: fresh[0].at,
    });
  }
  if (liveRooms.length) {
    liveRooms.sort((a, b) => b.latest - a.latest);
    const rooms = liveRooms.slice(0, 3).map(({ latest, ...r }) => r);
    return { mode: 'live', city_label: cityLabel(), rooms };
  }
  // LAST NIGHT: the most recent night with evening rooms. A night is
  // keyed by the ET date of (start - 6h), so a 1 AM start belongs to
  // the evening before. The label stays LAST NIGHT only for yesterday;
  // older fallbacks name the weekday honestly (SATURDAY NIGHT).
  const etDate = (ms) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(ms));
  const nightOf = (ms) => etDate(ms - 6 * 3600000);
  // Fallback render rules (Spark re-review): at most ~48h stale
  // (back 1-2 nights — older is a museum, not a peephole), and a
  // fallback night needs >= 2 rooms to earn the strip; a single
  // lonely chip above Room Proof reads as broken.
  for (let back = 1; back <= 2; back++) {
    const targetMs = now - 6 * 3600000 - back * 24 * 3600000;
    const target = etDate(targetMs);
    const rooms = [];
    for (const ev of byEvent.values()) {
      if (!isEvening(ev)) continue;
      if (nightOf(ev.startMs) !== target) continue;
      const landed = ev.photos.filter(
        (p) =>
          p.people &&
          p.at >= ev.startMs - 3600000 &&
          p.at <= ev.startMs + 48 * 3600000
      );
      if (landed.length < 3) continue;
      rooms.push({
        event_id: ev.event_id,
        slug: ev.slug,
        title: ev.title,
        venue_name: ev.venue_name,
        city: ev.city,
        photo_count: landed.length,
        thumb_url: `/api/uploads/${landed[0].filename}`,
        count: landed.length,
      });
    }
    if (rooms.length >= 2) {
      rooms.sort((a, b) => b.count - a.count);
      const top = rooms.slice(0, 3).map(({ count, ...r }) => r);
      const night_label =
        back === 1
          ? 'LAST NIGHT'
          : `${new Intl.DateTimeFormat('en-US', {
              timeZone: 'America/New_York',
              weekday: 'long',
            })
              .format(new Date(targetMs))
              .toUpperCase()} NIGHT`;
      return { mode: 'last_night', night_label, city_label: cityLabel(), rooms: top };
    }
  }
  return null;
}

function recentPhotosFor(row, ownPhotoCount) {
  if (ownPhotoCount > 0) return null;
  if (!row.venue_id) return null;
  if (new Date(row.starts_at).getTime() <= Date.now()) return null;
  const homeOf = (t) => {
    const m = String(t || '').split(/\s+vs\.?\s+/i);
    return m.length > 1 ? m[0].trim() : null;
  };
  const homeLabel = homeOf(row.title);
  if (!homeLabel) return null;
  const home = homeLabel.toLowerCase();
  const candidates = db
    .prepare(
      `SELECT id, slug, title, starts_at FROM events
       WHERE venue_id = ? AND hidden = 0 AND id != ? AND starts_at < ?
       ORDER BY starts_at DESC`
    )
    .all(row.venue_id, row.id, row.starts_at);
  const games = [];
  for (const c of candidates) {
    if (games.length >= 3) break;
    const h = homeOf(c.title);
    if (!h || h.toLowerCase() !== home) continue;
    const n = db
      .prepare('SELECT COUNT(*) AS n FROM event_photos WHERE event_id = ?')
      .get(c.id).n;
    if (n > 0)
      games.push({ id: c.id, slug: c.slug, starts_at: c.starts_at, photo_count: n });
  }
  if (!games.length) return null;
  const photos = [];
  for (const g of games) {
    const rows = db
      .prepare(
        `SELECT p.filename, p.caption,
           s.name AS source_name, s.business AS source_business,
           s.website AS source_website, s.instagram AS source_instagram,
           s.facebook AS source_facebook, s.email AS source_email,
           s.x_username AS source_x_username, s.x_post_url AS source_x_post_url,
           s.ig_username AS source_ig_username, s.ig_post_url AS source_ig_post_url
         FROM event_photos p
         LEFT JOIN photo_sources s ON s.id = p.source_id
         WHERE p.event_id = ? ORDER BY p.id DESC`
      )
      .all(g.id);
    for (const r of rows) {
      photos.push({
        url: `/api/uploads/${r.filename}`,
        event_slug: g.slug,
        event_starts_at: g.starts_at,
        caption: r.caption ?? null,
        source: r.source_name
          ? {
              name: r.source_name,
              business: r.source_business,
              website: r.source_website,
              instagram: r.source_instagram,
              facebook: r.source_facebook,
              email: r.source_email,
              x_username: r.source_x_username,
              x_post_url: r.source_x_post_url,
              ig_username: r.source_ig_username,
              ig_post_url: r.source_ig_post_url,
            }
          : null,
      });
    }
  }
  const lastLive = livePeopleFor([games[0].id]).get(games[0].id);
  return {
    team: homeLabel,
    games: games.map((g) => ({
      slug: g.slug,
      starts_at: g.starts_at,
      photo_count: g.photo_count,
    })),
    photos,
    total: photos.length,
    last_people: lastLive ? lastLive.people : [],
    last_photo_count: games[0].photo_count,
  };
}

app.get('/api/events', (req, res) => {
  const { q, category, city, from, to, lat, lng, radius_km, featured, limit, offset, include_hidden } = req.query;
  const where = [];
  const params = [];
  const adminView = include_hidden === 'true';
  if (adminView) {
    // Admin-only: list hidden events too (used by the admin frontend).
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    let isAdmin = false;
    if (token) {
      try {
        const payload = jwt.verify(token, JWT_SECRET);
        const u = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.id);
        isAdmin = !!(u && !u.locked && u.role === 'admin');
      } catch { /* fall through to 403 */ }
    }
    if (!isAdmin) return res.status(403).json({ error: 'admin required for include_hidden' });
  } else {
    where.push('e.hidden = 0');
  }
  if (q) {
    where.push('(e.title LIKE ? OR e.description LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }
  if (category) {
    // Single slug or comma-separated list, e.g. ?category=hack-build,learn
    const slugs = String(category)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (slugs.length === 1) {
      where.push('c.slug = ?');
      params.push(slugs[0]);
    } else if (slugs.length > 1) {
      where.push(`c.slug IN (${slugs.map(() => '?').join(',')})`);
      params.push(...slugs);
    }
  }
  if (city) {
    where.push('v.city = ?');
    params.push(city);
  }
  if (from) {
    const fromMs = Date.parse(from);
    if (featured === 'true' && !Number.isNaN(fromMs)) {
      // Pinned cards ride past the day window until pin_expires_at
      // (clients enforce the expiry); give pins a 72h lookback so a
      // late-night event from the prior evening still comes back.
      where.push(
        '(e.starts_at >= ? OR (e.featured_pin IS NOT NULL AND e.starts_at >= ?))',
      );
      params.push(from, new Date(fromMs - 72 * 3600000).toISOString());
    } else {
      where.push('e.starts_at >= ?');
      params.push(from);
    }
  }
  if (to) {
    where.push('e.starts_at <= ?');
    params.push(to);
  }
  if (featured === 'true') where.push('e.featured = 1');

  const lim = Math.min(parseInt(limit, 10) || 50, 200);
  const off = Math.max(parseInt(offset, 10) || 0, 0);

  const rows = db
    .prepare(`${EVENT_SELECT}${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY e.starts_at ASC`)
    .all(...params);

  const useGeo = lat !== undefined && lng !== undefined && lat !== '' && lng !== '';
  let items = rows.map((r) => ({ row: r, distance: null }));
  if (useGeo) {
    const qlat = parseFloat(lat);
    const qlng = parseFloat(lng);
    if (Number.isNaN(qlat) || Number.isNaN(qlng)) {
      return res.status(400).json({ error: 'lat and lng must be numbers' });
    }
    const radius = parseFloat(radius_km) || 50;
    items = rows
      .map((r) => {
        if (r.venue_lat == null || r.venue_lng == null) return null;
        const d = haversineKm(qlat, qlng, r.venue_lat, r.venue_lng);
        return d <= radius ? { row: r, distance: Math.round(d * 100) / 100 } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.distance - b.distance);
  }
  const total = items.length;
  const page = items.slice(off, off + lim);
  const eventsOut = page.map((i) => eventToJson(i.row, i.distance, adminView));
  attachLive(eventsOut);
  attachScores(eventsOut);
  res.json({ events: eventsOut, total });
});

app.get('/api/events/:slug', (req, res) => {
  const row = db.prepare(`${EVENT_SELECT} WHERE e.slug = ? AND e.hidden = 0`).get(req.params.slug);
  if (!row) return res.status(404).json({ error: 'event not found' });
  const out = eventToJson(row);
  attachLive([out]);
  attachScores([out]);
  // Total gallery photos (mirrors the photos endpoint's series logic).
  if (row.series_key) {
    out.photo_count = db
      .prepare(
        `SELECT COUNT(*) AS n FROM event_photos p
         JOIN events e ON e.id = p.event_id
         WHERE e.series_key = ? AND e.hidden = 0`
      )
      .get(row.series_key).n;
  } else {
    out.photo_count = db
      .prepare('SELECT COUNT(*) AS n FROM event_photos WHERE event_id = ?')
      .get(row.id).n;
  }
  // "Event listing with photos": upcoming + no own photos -> pool the
  // last same-team home games' photos (see recentPhotosFor). Null for
  // every other listing, so all other pages render unchanged.
  out.recent_photos = recentPhotosFor(row, out.photo_count);
  // Room Proof: venue photo-history module data (see roomProofFor). Null
  // unless the venue has a finder track record and this event has no
  // photos of its own.
  out.room_proof = roomProofFor(row, out.photo_count);
  out.peephole = peepholeFor(row.id);
  res.json(out);
});

// ----- event photos -----
// Uploads require a signed-in user (auth middleware on POST below); reads stay public.

function photoToJson(p) {
  return {
    id: p.id,
    event_id: p.event_id,
    url: `/api/uploads/${p.filename}`,
    caption: p.caption,
    created_at: p.created_at,
    user_id: p.user_id ?? null,
    uploaded_by: p.uploader_username
      ? {
          username: p.uploader_username,
          display_name: p.uploader_display_name,
          avatar_url: p.uploader_avatar_url,
        }
      : null,
    source: p.source_name
      ? {
          name: p.source_name,
          business: p.source_business,
          website: p.source_website,
          instagram: p.source_instagram,
          facebook: p.source_facebook,
          email: p.source_email,
          x_username: p.source_x_username,
          x_post_url: p.source_x_post_url,
          ig_username: p.source_ig_username,
          ig_post_url: p.source_ig_post_url,
          avatar_url: p.source_avatar_url,
        }
      : null,
  };
}

const PHOTO_SELECT = `p.*, u.username AS uploader_username,
  u.display_name AS uploader_display_name, u.avatar_url AS uploader_avatar_url,
  s.name AS source_name, s.business AS source_business, s.website AS source_website,
  s.instagram AS source_instagram, s.facebook AS source_facebook, s.email AS source_email,
  s.x_username AS source_x_username, s.x_post_url AS source_x_post_url,
  s.ig_username AS source_ig_username, s.ig_post_url AS source_ig_post_url,
  s.avatar_url AS source_avatar_url`;

/**
 * Photos for an event: its own uploads plus uploads from other occurrences in
 * the same series (series_key), newest first.
 */
app.get('/api/events/:slug/photos', (req, res) => {
  const ev = db.prepare('SELECT id, series_key FROM events WHERE slug = ? AND hidden = 0').get(req.params.slug);
  if (!ev) return res.status(404).json({ error: 'event not found' });
  let rows;
  if (ev.series_key) {
    rows = db
      .prepare(
        `SELECT ${PHOTO_SELECT} FROM event_photos p
         JOIN events e ON e.id = p.event_id
         LEFT JOIN users u ON u.id = p.user_id
         LEFT JOIN photo_sources s ON s.id = p.source_id
         WHERE e.series_key = ? AND e.hidden = 0
         ORDER BY p.created_at DESC, p.id DESC`
      )
      .all(ev.series_key);
  } else {
    rows = db
      .prepare(
        `SELECT ${PHOTO_SELECT} FROM event_photos p
         LEFT JOIN users u ON u.id = p.user_id
         LEFT JOIN photo_sources s ON s.id = p.source_id
         WHERE p.event_id = ? ORDER BY p.created_at DESC, p.id DESC`
      )
      .all(ev.id);
  }
  res.json({ photos: rows.map(photoToJson) });
});

const PHOTO_MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

app.post('/api/events/:slug/photos', auth, (req, res) => {
  const ev = db.prepare('SELECT id FROM events WHERE slug = ? AND hidden = 0').get(req.params.slug);
  if (!ev) return res.status(404).json({ error: 'event not found' });
  const { image_data, caption } = req.body || {};
  const m = /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(image_data || ''));
  if (!m || !PHOTO_MIME[m[1]]) {
    return res.status(400).json({ error: 'image_data required as data:image/{jpeg,png,webp,gif};base64,...' });
  }
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length === 0 || buf.length > 10 * 1024 * 1024) {
    return res.status(400).json({ error: 'image must be non-empty and under 10MB' });
  }
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${PHOTO_MIME[m[1]]}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), buf);
  const r = db
    .prepare('INSERT INTO event_photos (event_id, filename, caption, user_id) VALUES (?, ?, ?, ?)')
    .run(ev.id, filename, caption || null, req.user.id);
  const p = db
    .prepare(
      `SELECT ${PHOTO_SELECT} FROM event_photos p
       LEFT JOIN users u ON u.id = p.user_id
       LEFT JOIN photo_sources s ON s.id = p.source_id WHERE p.id = ?`
    )
    .get(r.lastInsertRowid);
  res.status(201).json(photoToJson(p));
});

app.post('/api/events', auth, adminOnly, (req, res) => {
  const b = req.body || {};
  if (!b.title) return res.status(400).json({ error: 'title required' });
  if (!b.category_slug) return res.status(400).json({ error: 'category_slug required' });
  if (!b.starts_at) return res.status(400).json({ error: 'starts_at required' });
  const cat = db.prepare('SELECT id FROM categories WHERE slug = ?').get(b.category_slug);
  if (!cat) return res.status(400).json({ error: 'unknown category_slug' });

  let venueId = b.venue_id || null;
  if (!venueId && b.venue && b.venue.name) {
    const v = b.venue;
    if (!v.city) return res.status(400).json({ error: 'venue.city required' });
    // Find-or-create by normalized name + city: inline venues used to INSERT a
    // new row per event, which flooded the venues table with duplicates
    // (1,811 rows for ~600 real venues before the Oct 21, 2026 dedup).
    const existing = db
      .prepare(
        'SELECT id FROM venues WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND LOWER(TRIM(city)) = LOWER(TRIM(?)) ORDER BY id LIMIT 1'
      )
      .get(v.name, v.city);
    if (existing) {
      venueId = existing.id;
      db.prepare(
        'UPDATE venues SET address = COALESCE(address, ?), lat = COALESCE(lat, ?), lng = COALESCE(lng, ?) WHERE id = ?'
      ).run(v.address || null, v.lat ?? null, v.lng ?? null, venueId);
    } else {
      const r = db
        .prepare('INSERT INTO venues (name, address, city, lat, lng) VALUES (?, ?, ?, ?, ?)')
        .run(v.name, v.address || null, v.city, v.lat ?? null, v.lng ?? null);
      venueId = r.lastInsertRowid;
    }
  }
  if (venueId && !db.prepare('SELECT 1 FROM venues WHERE id = ?').get(venueId)) {
    return res.status(400).json({ error: 'unknown venue_id' });
  }

  const slug = newEventSlug(b.title, b.starts_at);
  const r = db
    .prepare(
      `INSERT INTO events (slug, title, description, category_id, venue_id, starts_at, ends_at, cost_free, cost_text, url, source, image_url, recurrence, series_key, featured)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      slug,
      b.title,
      b.description || '',
      cat.id,
      venueId,
      b.starts_at,
      b.ends_at || null,
      b.cost_free ? 1 : 0,
      b.cost_text || null,
      b.url || null,
      b.source || null,
      b.image_url || null,
      b.recurrence || null,
      b.series_key || null,
      b.featured ? 1 : 0
    );
  const row = db.prepare(`${EVENT_SELECT} WHERE e.id = ?`).get(r.lastInsertRowid);
  res.status(201).json(eventToJson(row, undefined, true));
});

const PATCHABLE_EVENT_FIELDS = [
  'title',
  'description',
  'starts_at',
  'ends_at',
  'cost_free',
  'cost_text',
  'image_url',
  'recurrence',
  'series_key',
  'url',
  'source',
  'featured',
  'community_pick',
  'hidden',
];

app.patch('/api/events/:id', auth, adminOnly, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'event not found' });
  const b = req.body || {};
  const sets = [];
  const params = [];

  if (b.category_slug !== undefined) {
    const cat = db.prepare('SELECT id FROM categories WHERE slug = ?').get(b.category_slug);
    if (!cat) return res.status(400).json({ error: 'unknown category_slug' });
    sets.push('category_id = ?');
    params.push(cat.id);
  }
  if (b.venue_id !== undefined) {
    if (b.venue_id !== null && !db.prepare('SELECT 1 FROM venues WHERE id = ?').get(b.venue_id)) {
      return res.status(400).json({ error: 'unknown venue_id' });
    }
    sets.push('venue_id = ?');
    params.push(b.venue_id);
  }
  for (const f of PATCHABLE_EVENT_FIELDS) {
    if (b[f] !== undefined) {
      if (f === 'cost_free' || f === 'featured' || f === 'community_pick' || f === 'hidden') {
        sets.push(`${f} = ?`);
        params.push(b[f] ? 1 : 0);
      } else {
        sets.push(`${f} = ?`);
        params.push(b[f] ?? null);
      }
    }
  }
  if (b.title !== undefined && b.title !== existing.title) {
    sets.push('slug = ?');
    params.push(newEventSlug(b.title, b.starts_at || existing.starts_at, id));
  }
  if (sets.length === 0) return res.status(400).json({ error: 'no updatable fields' });
  sets.push("updated_at = datetime('now')");
  db.prepare(`UPDATE events SET ${sets.join(', ')} WHERE id = ?`).run(...params, id);
  const row = db.prepare(`${EVENT_SELECT} WHERE e.id = ?`).get(id);
  res.json(eventToJson(row, undefined, true));
});

app.delete('/api/events/:id', auth, adminOnly, (req, res) => {
  const r = db.prepare('DELETE FROM events WHERE id = ?').run(parseInt(req.params.id, 10));
  if (r.changes === 0) return res.status(404).json({ error: 'event not found' });
  res.status(204).end();
});

// ----- trending (desktop homepage sidebar, Angelo, Oct 29) -----
// Top event pages by real-human pageviews over the trailing window,
// filtered with the same house rules as the analytics report (Mozilla
// UA, no bot signatures, no datacenter ISPs, no CO, minus ignored IPs).
app.get('/api/trending', (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days || '7', 10) || 7, 1), 30);
  const limit = Math.min(Math.max(parseInt(req.query.limit || '4', 10) || 4, 1), 10);
  const since = Date.now() - days * 86400000;
  const ignored = new Set(
    db.prepare('SELECT ip FROM analytics_ignored_ips').all().map((r) => r.ip),
  );
  const rows = db
    .prepare(
      `SELECT page, ip, country, isp, user_agent FROM pageviews
       WHERE ts >= ? AND page LIKE '/events/%'`,
    )
    .all(since);
  const counts = new Map();
  for (const r of rows) {
    if (ignored.has(r.ip) || isBotPageview(r)) continue;
    const slug = r.page.slice('/events/'.length).split(/[?#]/)[0];
    if (!slug) continue;
    counts.set(slug, (counts.get(slug) || 0) + 1);
  }
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit * 3);
  const events = [];
  for (const [slug, views] of top) {
    if (events.length >= limit) break;
    const row = db
      .prepare(`${EVENT_SELECT} WHERE e.slug = ? AND e.hidden = 0`)
      .get(slug);
    if (row) events.push({ ...eventToJson(row), views });
  }
  res.json({ events });
});

// ----- categories -----

app.get('/api/categories', (req, res) => {
  res.json(db.prepare('SELECT id, slug, name, tagline, icon FROM categories ORDER BY id').all());
});

// ----- venues -----

app.get('/api/venues', (req, res) => {
  res.json(db.prepare('SELECT id, name, address, city, lat, lng FROM venues ORDER BY name').all());
});

app.post('/api/venues', auth, adminOnly, (req, res) => {
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: 'name required' });
  if (!b.city) return res.status(400).json({ error: 'city required' });
  const r = db
    .prepare('INSERT INTO venues (name, address, city, lat, lng) VALUES (?, ?, ?, ?, ?)')
    .run(b.name, b.address || null, b.city, b.lat ?? null, b.lng ?? null);
  res
    .status(201)
    .json(db.prepare('SELECT id, name, address, city, lat, lng FROM venues WHERE id = ?').get(r.lastInsertRowid));
});

// ----- users (admin) -----

app.get('/api/users', auth, adminOnly, (req, res) => {
  res.json(
    db.prepare('SELECT id, name, email, role, locked, created_at FROM users ORDER BY id').all().map(userToJson)
  );
});

app.post('/api/users', auth, adminOnly, (req, res) => {
  const { name, email, password, role } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'name, email, password required' });
  if (password.length < 6) return res.status(400).json({ error: 'password must be at least 6 characters' });
  const r2 = role || 'user';
  if (!['admin', 'user'].includes(r2)) return res.status(400).json({ error: 'role must be admin or user' });
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
    return res.status(409).json({ error: 'email already registered' });
  }
  const r = db
    .prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run(name, email, bcrypt.hashSync(password, 10), r2);
  res.status(201).json(userToJson(db.prepare('SELECT * FROM users WHERE id = ?').get(r.lastInsertRowid)));
});

app.patch('/api/users/:id', auth, adminOnly, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'user not found' });
  const b = req.body || {};
  const sets = [];
  const params = [];
  if (b.name !== undefined) {
    sets.push('name = ?');
    params.push(b.name);
  }
  if (b.role !== undefined) {
    if (!['admin', 'user'].includes(b.role)) return res.status(400).json({ error: 'role must be admin or user' });
    sets.push('role = ?');
    params.push(b.role);
  }
  if (b.locked !== undefined) {
    sets.push('locked = ?');
    params.push(b.locked ? 1 : 0);
  }
  if (sets.length === 0) return res.status(400).json({ error: 'no updatable fields' });
  db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...params, id);
  res.json(userToJson(db.prepare('SELECT * FROM users WHERE id = ?').get(id)));
});

app.delete('/api/users/:id', auth, adminOnly, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (id === req.user.id) return res.status(400).json({ error: 'cannot delete yourself' });
  const r = db.prepare('DELETE FROM users WHERE id = ?').run(id);
  if (r.changes === 0) return res.status(404).json({ error: 'user not found' });
  res.status(204).end();
});

// ----- geo helper -----

app.get('/api/geocode', (req, res) => {
  const q = String(req.query.q || '').toLowerCase().trim();
  if (!q) return res.json([]);
  res.json(TOWNS.filter((t) => t.label.toLowerCase().includes(q)));
});

// ----- errors -----

app.use((req, res) => res.status(404).json({ error: 'not found' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid JSON body' });
  console.error(err);
  res.status(500).json({ error: 'internal server error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`smevents-api listening on :${PORT}`);
});
