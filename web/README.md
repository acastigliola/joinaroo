# SME Web — public frontend

Next.js 14+ (App Router, TypeScript) public website for Southern Maine Events.
Public **read-only** surface: browse/search events, per-event SEO pages, category
index. Talks to the shared SME web-service backend.

## Run

```bash
npm install
npm run dev      # http://localhost:3000
```

The API backend must be running (default `http://localhost:4000`). Override with:

```bash
NEXT_PUBLIC_API_URL=https://api.example.com npm run dev
```

## Pages

- `/` — hero, location controls (browser geolocation or Maine town picker,
  default Portland, ME), category chips, text search, event cards, featured
  spotlight. All server-rendered from the API at request time.
- `/events/[slug]` — SSR per-event page with `<title>`/meta description and
  JSON-LD `Event` schema for SEO.
- `/categories` — category grid linking to filtered home.

## Deploy

`next.config.js` sets `output: 'standalone'` — `npm run build` produces a
self-contained `.next/standalone` server for portable Docker deploys.

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY .next/standalone ./
COPY .next/static ./.next/static
COPY public ./public
ENV PORT=3000 NEXT_PUBLIC_API_URL=https://api.example.com
CMD ["node", "server.js"]
```
