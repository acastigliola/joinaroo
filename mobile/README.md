# Southern Maine Events — Mobile (Expo / React Native)

POC mobile client for the Southern Maine Events SOA. Read-only: it consumes the
public API from `../api` per `../CONTRACT.md` (no auth in this iteration).

## Run

Prereqs: Node 18+, the API running on your machine (`../api`, default port 4000).

```sh
npm install
npx expo start
```

Then open in Expo Go (scan the QR), or press `a` for an Android emulator.

**API URL:** the app defaults to `http://10.0.2.2:4000` — the Android emulator's
loopback to your computer, so it works out of the box against a locally running
API. To point at a deployed backend (or `http://localhost:4000` in Expo Go on
the same machine), change it in the in-app **Settings** tab; the override is
persisted with AsyncStorage.

## Screens

- **Events** (tabs: Events) — location bar ("Use my location" via expo-location
  with graceful permission denial, or a Maine town picker backed by
  `GET /api/geocode`, defaulting to Portland, ME), horizontal category filter
  chips, a Spotlight carousel of featured events, and the event list.
  Distance-sorted when a location is set, date-sorted otherwise.
  Pull-to-refresh + infinite scroll.
- **Search** — debounced text search (`q` param) plus city filter.
- **Event detail** — full description, date/time, venue + address, category,
  cost, "Open in Maps" (Google Maps query via Linking), and the event's source
  URL when present.
- **Settings** — API URL override with a Test-connection button, and About text.

All screens handle loading / error / empty states; no placeholder copy — every
string comes from the API.

## Build for the Play Store (AAB)

```sh
npm install -g eas-cli
eas login
eas build --platform android --profile production
```

`eas.json` defines the `production` profile with `buildType: "app-bundle"`.
`app.json` sets the Android package to `com.smevents.app` with adaptive-icon
config and location permissions. First build will prompt to create the EAS
project and link it (`eas init`); no `projectId` is committed yet.

## Notes / deviations

- Built and bundle-verified against the contract without a live API running:
  `npx tsc --noEmit` is clean and Metro serves a 200 bundle containing all
  screens. Screens are coded strictly to `CONTRACT.md` shapes.
- Distances: the API returns `distance_km`; the app displays miles.
- The town picker resolves a curated list of ~20 southern Maine towns through
  `/api/geocode` and also supports free-text town search via the same endpoint.
- `expo-location` is the only native permission requested (foreground only).
