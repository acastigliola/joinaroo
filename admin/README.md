# Joinaroo Admin

The operator console — a Vite + React + TypeScript SPA, admin-only.

## Highlights

- **Events** — create/edit dialog over the full catalog.
- **Analytics** — the visitor-lifecycle dashboard: pageviews classified
  as single-page, returners, and explorers, with details-click, listed-by,
  gallery, and photo-scroll beacons, per-page attribution, and seen-before
  visitor highlighting.
- **SMS inbox** — inbound texts to Joinaroo's number (Telnyx webhook →
  API → here).
- **Users** — account management dialog.

## Layout

```
src/App.tsx        shell + routing
src/Dashboard.tsx  event management
src/Analytics.tsx  analytics dashboard
src/SmsInbox.tsx   inbound SMS panel
src/api.ts         API client (VITE_API_URL, see .env.example)
```

Admin endpoints require an admin JWT from the API. No secrets in the
tree; `.env.example` contains local-development defaults only.
