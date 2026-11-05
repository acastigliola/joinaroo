# SME Admin — Southern Maine Events admin console

Separate deployable SPA (Vite + React + TypeScript, plain CSS). Admin-only; no public event browsing here.

## Run

```bash
npm install
npm run dev      # serves on http://localhost:3001
```

Configure the API base URL with `VITE_API_URL` (or `NEXT_PUBLIC_API_URL` — both honored), default `http://localhost:4000`. Copy `.env.example` to `.env` to set it.

Seed admin login: `admin@example.com` / `changeme01`.

## What it does

- `/login` → POST `/api/auth/login`, stores JWT in localStorage. Non-admin roles are refused at the door.
- Dashboard (protected, two tabs):
  - **Events** — table (title, category, venue/city, starts, featured, hidden) with text search; Add/Edit dialog (title, description, category, venue dropdown + inline "new venue" fields, start/end datetime, free/cost text, URL, source, featured, hidden); delete with confirm. Featured/hidden can also be toggled inline via pills.
  - **Users** — table (name, email, role, locked, created); add-user dialog; lock/unlock toggle, role change, delete with confirm. Self-delete and self-lock are blocked with a friendly message.
- All mutations send `Authorization: Bearer <jwt>`; any 401 bounces back to `/login`. Toast feedback on save/delete.

## Known contract limitation

`GET /api/events` never returns hidden events (per CONTRACT.md) and there is no admin list endpoint, so once an event is hidden it disappears from server results. The admin keeps hidden events visible for the current session via local state (with a note in the UI); a reload drops them from the table until an admin list endpoint exists.
