# Joinaroo API

Express + better-sqlite3 backend for Joinaroo. Plain JavaScript, single-file
core (`server.js`) with boot-time migrations, plus a standalone live-score
poller (`score-poller.js`).

## What it serves

- **Catalog** — events, venues, categories, towns; list/detail payloads with
  distance, featured pinning, and date windows.
- **The people layer** — credited event photos (`event_photos` +
  `photo_sources`), per-event `live_people` / `live_photo_url` /
  `photo_count` on every payload, the Room Proof block and the Peephole
  strip on single-event reads.
- **Auth** — email and phone (verification codes via SMTP / Telnyx SMS),
  Google and Facebook OAuth with one-account-per-verified-email linking,
  JWT sessions, password reset.
- **Live scores** — `event_scores` kept fresh by `score-poller.js`
  (ESPN, ECHL, and SIDEARM adapters; finals and in-progress state).
- **Analytics** — first-party pageview / gallery / details / listed-by
  beacons with GeoIP enrichment and an admin reporting endpoint.

## Layout

```
server.js        the API (routes, serializers, live/peephole/room-proof logic)
score-poller.js  3-minute live-score poller
schema.sql       base schema (boot migrations in server.js extend it)
seed-data.json   categories, towns, venues, sample events
Dockerfile       node:20-slim image
```

## Configuration

Everything sensitive comes from environment variables (`JWT_SECRET`,
`ADMIN_PASSWORD`, SMTP, Telnyx, OAuth client secrets, …) and the server
**fails closed** in production when a required secret is unset. There are
no credentials in this repository.
