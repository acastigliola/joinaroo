# SME API (Southern Maine Events) — backend POC

Express + better-sqlite3. Plain JavaScript. Implements `../CONTRACT.md` exactly.

## Run

```bash
npm install
npm start        # or: node server.js
```

Boots on `PORT` (default `4000`). On first boot it executes `schema.sql`,
seeds categories/venues/events from `seed-data.json`, and creates the seed admin.

## Env vars

| var | default | notes |
|---|---|---|
| `PORT` | `4000` | listen port |
| `JWT_SECRET` | `dev-secret-change-me` | sign JWTs (7d expiry); set a real secret in prod |
| `DB_PATH` | `./smevents.db` | SQLite file location |
| `RESEND_API_KEY` | (unset) | when set, verification email goes through the Resend HTTP API; otherwise it goes to Mailpit (dev) |
| `RESEND_FROM` | `Joinaroo <noreply@joinaroo.com>` | sender identity for Resend (domain must be verified in the Resend dashboard) |

## Seed admin

- Email: `admin@example.com`
- Password: `changeme01`
- Role: `admin` (bcrypt-hashed). Change immediately in production.

## Quick checks

```bash
curl localhost:4000/api/health
curl localhost:4000/api/events | head -c 300
curl "localhost:4000/api/events?lat=43.6615&lng=-70.2553" | head -c 300
TOKEN=$(curl -s -X POST localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"changeme01"}' | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).token))")
curl -X POST localhost:4000/api/events -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"title":"Test","category_slug":"learn","starts_at":"2026-11-01T18:00:00-05:00"}'
```

## Deploy

- **Docker:** `docker build -t smevents-api . && docker run -p 4000:4000 -e JWT_SECRET=... smevents-api`
- **Render:** `render.yaml` included — one-click deploy from this directory.
