-- SME (Southern Maine Events) — SQLite schema v1 (POC)
-- Portable: swap for Postgres in production via DATABASE_URL later.

CREATE TABLE IF NOT EXISTS categories (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  slug      TEXT NOT NULL UNIQUE,
  name      TEXT NOT NULL,
  tagline   TEXT NOT NULL DEFAULT '',
  icon      TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS venues (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT NOT NULL,
  address   TEXT,
  city      TEXT NOT NULL DEFAULT '',
  lat       REAL,
  lng       REAL
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT UNIQUE,
  phone         TEXT,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user')),
  username      TEXT,
  display_name  TEXT,
  avatar_url    TEXT,
  is_private    INTEGER NOT NULL DEFAULT 0,
  locked        INTEGER NOT NULL DEFAULT 0,
  oauth_provider TEXT,
  oauth_id      TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username) WHERE username IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone) WHERE phone IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_saves (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, event_id)
);

CREATE TABLE IF NOT EXISTS email_verifications (
  email      TEXT PRIMARY KEY,
  code_hash  TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS phone_verifications (
  phone      TEXT PRIMARY KEY,
  code_hash  TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT NOT NULL UNIQUE,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category_id INTEGER NOT NULL REFERENCES categories(id),
  venue_id    INTEGER REFERENCES venues(id),
  starts_at   TEXT NOT NULL,
  ends_at     TEXT,
  cost_free   INTEGER NOT NULL DEFAULT 0,
  cost_text   TEXT,
  url         TEXT,
  source      TEXT,
  image_url   TEXT,
  recurrence  TEXT,
  series_key  TEXT,
  featured    INTEGER NOT NULL DEFAULT 0,
  hidden      INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  verified_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_events_starts ON events(starts_at);
CREATE INDEX IF NOT EXISTS idx_events_category ON events(category_id);
CREATE INDEX IF NOT EXISTS idx_events_hidden ON events(hidden);
CREATE INDEX IF NOT EXISTS idx_events_series ON events(series_key);

-- Where a photo originally came from / who created it (photographer, venue,
-- attendee). Distinct from event_photos.user_id, which is who ADDED the photo
-- to Joinaroo (a person, or the PhotoAdder bot for pulled-in sets). Normalized
-- so a source is recorded once and linked from every photo in the set.
CREATE TABLE IF NOT EXISTS photo_sources (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  business   TEXT,
  website    TEXT,
  instagram  TEXT,
  facebook   TEXT,
  email      TEXT,
  x_username TEXT,
  x_post_url TEXT,
  ig_username TEXT,
  ig_post_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS event_photos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id    INTEGER REFERENCES users(id),
  source_id  INTEGER REFERENCES photo_sources(id),
  filename   TEXT NOT NULL,
  caption    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_photos_event ON event_photos(event_id);
-- NOTE: no idx_photos_user here — on pre-attribution DBs the user_id column is
-- added by the server.js boot migration AFTER schema.sql runs, so an index on
-- it in this file would fail the whole schema exec. The boot block creates it.

-- Performers (artists, bands, comedians, speakers) are first-class entities so
-- content can follow them across events and venues: an event links to its
-- performers here, and a photo links to an event — so "photos of performer X"
-- is a join through the events they played, never a copied tag on the photo.
CREATE TABLE IF NOT EXISTS performers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS event_performers (
  event_id     INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  performer_id INTEGER NOT NULL REFERENCES performers(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, performer_id)
);

CREATE INDEX IF NOT EXISTS idx_event_performers_performer ON event_performers(performer_id);

CREATE TABLE IF NOT EXISTS password_resets (
  identifier TEXT PRIMARY KEY,
  channel    TEXT NOT NULL,
  code_hash  TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
