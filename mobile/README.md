# Joinaroo Mobile

The native app — Expo / React Native (TypeScript) — mirroring the web
experience against the same API.

## Highlights

- **Auth-first flow** — sign up on first open (email, phone, Google,
  Facebook; Apple planned), session persists and auto-validates.
- **Tabs** — Events, My Saves, Search, Settings, with a hidden Profile tab.
- **Live parity** — event cards and detail screens carry the same
  live-people treatment as the web (avatar stacks, live photo, saves).
- Production direction: native Google Sign-In SDK, EAS builds, Play Store
  private beta first.

## Layout

```
App.tsx            app root / navigation
src/screens/       Auth, Events, EventDetail, MySaves, Search,
                   Settings, Profile
src/components/    AppHeader, EventCard, TabBarReplica, TabIcon
src/lib/           auth context, saves
src/api.ts         API client (base URL from app.json extra.apiUrl)
```

The API base URL in `app.json` points at the public production site.
No secrets in the tree.
