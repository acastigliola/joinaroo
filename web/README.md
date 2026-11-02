# Joinaroo Web

The public site — [joinaroo.com](https://joinaroo.com) — built with
Next.js (App Router, TypeScript) and server-rendered event pages.

## Highlights

- **Home sections** — Featured, Today, This Weekend, Nearby, with the
  frozen card system: category chips, distance bands, live cards with
  avatar stacks and "people here now."
- **Live surfaces** — the Live Events strip, the **Peephole** (your city's
  night through real crowd photos), and **Room Proof** (a previous night at
  the same venue, credited, on photo-less listings).
- **Event pages** — facts, credited photo galleries with a shared
  lightbox, the Live now! / ended people panels, game summaries with team
  records and mascot lockups for sports finals, Community Pick blocks.
- **SEO** — per-event pages, sitemap (~2,100 URLs), structured data.
- **Auth** — the shared sign-up/login modal (email, phone, Google,
  Facebook) talking to the API.

## Layout

```
app/          routes: home, event detail, categories, towns, search,
              saves, settings, auth, per-user pages, sitemap/robots
components/   cards, live strip, Peephole, Room Proof, LivePanel,
              galleries, community blocks, headers, mobile home
lib/          API client and shared helpers (incl. the live-window rules)
public/       static assets (icons/images omitted from this snapshot)
```

Talks to the Joinaroo API (`../api`). No secrets in the tree — public
configuration only.
