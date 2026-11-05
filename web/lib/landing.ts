// AI-friendly location/date landing pages (Angelo, Nov 4): crawlable,
// server-rendered listing pages for cities, city segments (this weekend,
// concerts, free, family) and venues. URLs live under /events-in/<city>-me
// because /events/<slug> is the event-detail namespace, and /venues/<slug>.
//
// Thin-page guardrail from the brief itself: a page exists (and enters the
// sitemap) only when it carries a meaningful set of listings — cities need
// >= 8 upcoming events, venues >= 3, segments their own floors. Anything
// below the floor 404s rather than serving a stub.
import { API_BASE_URL, type EventItem } from './api';

export const CITY_MIN = 8;
export const VENUE_MIN = 3;
export const SEGMENT_MIN: Record<string, number> = {
  'this-weekend': 3,
  concerts: 5,
  free: 5,
  family: 5,
};
export const SEGMENTS = Object.keys(SEGMENT_MIN);
export const LIST_CAP = 120;

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const citySlug = (city: string) => `${slugify(city)}-me`;
export const venueBaseSlug = (name: string, city: string) =>
  `${slugify(name)}-${slugify(city)}`;

// ---------- Eastern-time helpers (starts_at strings carry ET offsets;
// range filters must be built in the same format for string compare) ----
function etParts(d: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
  return {
    y: get('year'),
    m: get('month'),
    day: get('day'),
    weekday: get('weekday'), // Mon, Tue, ...
  };
}

function etOffsetFor(y: number, m: number, day: number): string {
  // Offset of America/New_York at noon UTC on the given ET calendar date.
  const probe = new Date(Date.UTC(y, m - 1, day, 12, 0, 0));
  const s =
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      timeZoneName: 'shortOffset',
    })
      .formatToParts(probe)
      .find((p) => p.type === 'timeZoneName')?.value || 'GMT-5';
  const mm = s.replace('GMT', '').match(/^([+-])(\d{1,2})(?::(\d{2}))?$/);
  if (!mm) return '-05:00';
  return `${mm[1]}${mm[2].padStart(2, '0')}:${mm[3] || '00'}`;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "Now" as an ET-offset ISO string, for API from= filters. */
export function etNowIso(): string {
  const now = new Date();
  const p = etParts(now);
  const off = etOffsetFor(+p.y, +p.m, +p.day);
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(now);
  return `${p.y}-${p.m}-${p.day}T${time}${off}`;
}

/** Saturday–Sunday of the current ET week (on Sunday, the weekend that is
 * ending: yesterday + today). */
export function weekendWindow(): { from: string; to: string; label: string } {
  const now = new Date();
  const p = etParts(now);
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(
    p.weekday,
  );
  const base = new Date(Date.UTC(+p.y, +p.m - 1, +p.day));
  const shift = dow === 0 ? -1 : 6 - dow;
  const sat = new Date(base.getTime() + shift * 86400000);
  const sun = new Date(sat.getTime() + 86400000);
  const fmt = (d: Date) => {
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const dd = d.getUTCDate();
    return {
      iso: `${y}-${pad(m)}-${pad(dd)}`,
      off: etOffsetFor(y, m, dd),
      human: new Intl.DateTimeFormat('en-US', {
        timeZone: 'UTC',
        month: 'long',
        day: 'numeric',
      }).format(d),
    };
  };
  const s = fmt(sat);
  const u = fmt(sun);
  return {
    from: `${s.iso}T00:00:00${s.off}`,
    to: `${u.iso}T23:59:59${u.off}`,
    label: `Saturday ${s.human} and Sunday ${u.human}`,
  };
}

// ---------- API fetches (server-side, hourly-cached like the sitemap) --
async function fetchEventsPage(
  params: Record<string, string>,
): Promise<{ events: EventItem[]; total: number }> {
  const qs = new URLSearchParams(params).toString();
  try {
    const res = await fetch(`${API_BASE_URL}/api/events?${qs}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return { events: [], total: 0 };
    const data = await res.json();
    return { events: data.events || [], total: data.total || 0 };
  } catch {
    return { events: [], total: 0 };
  }
}

/** Paginated fetch of events matching params, up to cap. */
export async function fetchEvents(
  params: Record<string, string>,
  cap = LIST_CAP,
): Promise<{ events: EventItem[]; total: number }> {
  const out: EventItem[] = [];
  let total = 0;
  let offset = 0;
  for (;;) {
    const page = await fetchEventsPage({
      ...params,
      limit: '200',
      offset: String(offset),
    });
    total = page.total;
    // Cancelled events never appear as upcoming listings (their own page
    // carries the cancellation); postponed rows keep their listed date.
    out.push(...page.events.filter((e) => e.status !== 'cancelled'));
    if (!page.events.length || out.length >= total || out.length >= cap)
      break;
    offset += page.events.length;
  }
  return { events: out.slice(0, cap), total };
}

/** All upcoming events (powers the qualification index + sitemap). */
async function fetchAllUpcoming(): Promise<EventItem[]> {
  return (await fetchEvents({ from: etNowIso() }, 2500)).events;
}

// ---------- Qualification index ----------------------------------------
export type VenueInfo = {
  id: string;
  name: string;
  address?: string | null;
  city: string;
  slug: string;
  count: number;
};
export type CityInfo = {
  city: string;
  slug: string;
  count: number;
  segments: Record<string, number>;
  venues: VenueInfo[];
};
export type LandingIndex = {
  cities: Map<string, CityInfo>;
  venues: Map<string, VenueInfo>;
};

let indexCache: { at: number; idx: LandingIndex } | null = null;

export async function getLandingIndex(): Promise<LandingIndex> {
  if (indexCache && Date.now() - indexCache.at < 3600000)
    return indexCache.idx;
  const events = await fetchAllUpcoming();
  const wk = weekendWindow();
  const cities = new Map<string, CityInfo>();
  const venueRaw = new Map<
    string,
    { id: string; name: string; address?: string | null; city: string; count: number }
  >();
  for (const e of events) {
    const v = e.venue;
    if (!v) continue;
    const cs = citySlug(v.city);
    let ci = cities.get(cs);
    if (!ci) {
      ci = {
        city: v.city,
        slug: cs,
        count: 0,
        segments: { 'this-weekend': 0, concerts: 0, free: 0, family: 0 },
        venues: [],
      };
      cities.set(cs, ci);
    }
    ci.count += 1;
    if (e.starts_at >= wk.from && e.starts_at <= wk.to)
      ci.segments['this-weekend'] += 1;
    if (e.category?.slug === 'on-stage') ci.segments.concerts += 1;
    if (e.cost_free) ci.segments.free += 1;
    if (e.category?.slug === 'family-fun') ci.segments.family += 1;
    const key = String(v.id);
    const vr = venueRaw.get(key);
    if (vr) vr.count += 1;
    else
      venueRaw.set(key, {
        id: key,
        name: v.name,
        address: v.address,
        city: v.city,
        count: 1,
      });
  }
  // Venue slugs, with -<id> disambiguation on collision.
  const used = new Map<string, number>();
  for (const vr of venueRaw.values()) {
    const base = venueBaseSlug(vr.name, vr.city);
    used.set(base, (used.get(base) || 0) + 1);
  }
  const venues = new Map<string, VenueInfo>();
  for (const vr of venueRaw.values()) {
    const base = venueBaseSlug(vr.name, vr.city);
    const slug = (used.get(base) || 0) > 1 ? `${base}-${vr.id}` : base;
    const info: VenueInfo = { ...vr, slug };
    venues.set(slug, info);
    const ci = cities.get(citySlug(vr.city));
    if (ci) ci.venues.push(info);
  }
  for (const ci of cities.values())
    ci.venues.sort((a, b) => b.count - a.count);
  const idx = { cities, venues };
  indexCache = { at: Date.now(), idx };
  return idx;
}

export const cityQualifies = (ci: CityInfo) => ci.count >= CITY_MIN;
export const venueQualifies = (vi: VenueInfo) => vi.count >= VENUE_MIN;
export const segmentQualifies = (ci: CityInfo, seg: string) =>
  (ci.segments[seg] || 0) >= (SEGMENT_MIN[seg] ?? Infinity);

// ---------- Presentation helpers ---------------------------------------
export function eventDateLabel(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(iso));
}

export function eventTimeLabel(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function priceLine(e: EventItem): string {
  if (e.status === 'cancelled') return 'Cancelled';
  if (e.sold_out) return 'Sold out';
  if (e.cost_free) return 'Free';
  return e.cost_text || 'See event page for price';
}

/** One-to-two sentence listing summary: the event's own description when
 * it has one, otherwise a factual line composed from the structured
 * fields. Never invented detail. */
export function shortDesc(e: EventItem): string {
  const d = (e.description || '').replace(/\s+/g, ' ').trim();
  if (d) return d.length > 180 ? `${d.slice(0, 177).trimEnd()}…` : d;
  const bits = [
    e.venue ? `at ${e.venue.name}` : '',
    e.venue ? `in ${e.venue.city}, Maine` : '',
  ].filter(Boolean);
  return `${e.title} ${bits.join(' ')} — ${eventDateLabel(e.starts_at)}, ${eventTimeLabel(e.starts_at)}. ${priceLine(e)}.`;
}

export function absImage(e: EventItem): string | undefined {
  if (!e.image_url) return undefined;
  return e.image_url.startsWith('/')
    ? `https://joinaroo.com${e.image_url}`
    : e.image_url;
}

// ---------- Editorial copy ----------------------------------------------
export const CITY_BLURBS: Record<string, string> = {
  Portland:
    "Maine's largest city and its live-music capital. The State Theatre, AURA, Portland House of Music and a deep bench of small rooms keep the calendar full most nights of the week.",
  Orono:
    'Home to the University of Maine. Black Bear sports, campus lectures and performances at the Collins Center for the Arts anchor the calendar.',
  Bangor:
    'The Queen City, with the Cross Insurance Center, the Bangor Symphony Orchestra and Penobscot Theatre Company carrying a full year-round calendar.',
  Biddeford:
    'A former mill city in the middle of a food-and-arts revival — the historic City Theater, Elements and a growing list of small rooms and galleries.',
  'Old Orchard Beach':
    'A classic Maine beach town: the Pier, Palace Playland, and Seagull sports at Old Orchard Beach High School through the school year.',
  Lewiston:
    'One of the Twin Cities, with Bates College, The Public Theatre and the Franco Center driving the calendar.',
  Auburn:
    "Lewiston's twin across the Androscoggin — Community Little Theatre, Norway Savings Bank Arena and Edward Little sports.",
  Brunswick:
    "Bowdoin College's town — the Pickard Theater, Frontier and a steady run of recitals, films and talks.",
  Waterville:
    'Colby College overlooks a downtown built around the Waterville Opera House, the Maine Film Center and the Maine International Film Festival.',
  Westbrook:
    "Portland's next-door neighbor, with Rock Row, the Westbrook Performing Arts Center and a calendar increasingly its own.",
  Augusta:
    "Maine's capital city — the Augusta Civic Center, Cony High School sports and a steady community calendar.",
  Saco: 'Biddeford’s twin across the Saco River — Thornton Academy’s arts and sports programs anchor the calendar.',
  'South Portland':
    "Across the harbor from Portland — community stages, SMCC events and Red Riots sports.",
  Freeport:
    "L.L.Bean's hometown, where the Bean campus, Wolfe's Neck and Freeport Players keep a year-round calendar.",
  Kennebunk:
    'A shipbuilding town turned coastal destination, with a chamber and library calendar that punches above its size.',
  Kennebunkport:
    'Home to Dock Square and the Cape Arundel Inn — small rooms, big summer energy, and events at Ocean and the Nonantum.',
  Camden:
    'Where the mountains meet the sea — the Camden Opera House and a harbor town’s worth of talks, films and music.',
  Rockland:
    'The lobster capital’s calendar runs through the Farnsworth, the Strand Theatre and a working waterfront.',
  'Bar Harbor':
    'The gateway to Acadia National Park — the Criterion Theatre, College of the Atlantic and a dense summer calendar.',
};

export const SEGMENT_COPY: Record<
  string,
  { name: string; heading: (city: string) => string; intro: string }
> = {
  'this-weekend': {
    name: 'This weekend',
    heading: (city) => `Events happening in ${city}, Maine this weekend`,
    intro:
      'Everything Joinaroo has found in town for Saturday and Sunday — concerts, games, markets, shows and community events, each linking to its full event page.',
  },
  concerts: {
    name: 'Concerts',
    heading: (city) => `Concerts and live shows in ${city}, Maine`,
    intro:
      'Live music and stage shows coming up in town — concerts, comedy, theater and film, each linking to its full event page with tickets.',
  },
  free: {
    name: 'Free events',
    heading: (city) => `Free events in ${city}, Maine`,
    intro:
      'Everything coming up in town that costs nothing to attend — talks, markets, community gatherings, library programs and more.',
  },
  family: {
    name: 'Family events',
    heading: (city) => `Family events in ${city}, Maine`,
    intro:
      'Family-friendly events coming up in town — shows, games, festivals and activities that work for kids and parents alike.',
  },
};

export const VENUE_BLURBS: Record<string, string> = {
  'State Theatre':
    "Portland's flagship room — a 1,800-capacity restored 1929 theater on Congress Street that hosts the biggest touring acts that play Maine.",
  AURA: "Portland's modern mid-size concert hall on Center Street, built for touring rock, hip-hop and electronic bills.",
  'Portland House of Music and Events':
    'PHOME, to everyone in town — a two-level room on Congress Street that runs everything from jam bands to tribute nights.',
  'Bayside Bowl':
    'A bowling alley that became one of Portland’s best small music rooms — national touring acts on a stage at the end of the lanes.',
  'Waterville Opera House':
    'A 1902 opera house in downtown Waterville, home to community theater, concerts and the Maine International Film Festival.',
  'Merrill Auditorium':
    "Portland's grand concert hall inside City Hall — the Portland Symphony Orchestra's home stage.",
  SPACE: 'A nonprofit interdisciplinary arts space on Congress Street — experimental music, film and performance.',
  'Cross Insurance Arena':
    "Portland's big arena — Maine Mariners hockey, major tours and the state's largest indoor crowds.",
  'Cross Insurance Center':
    "Bangor's arena and convention center on the Penobscot — big tours, sports and expos.",
  'Collins Center for the Arts':
    'The University of Maine’s performing arts center in Orono — touring theater, orchestras and big campus nights.',
  'City Theater':
    'Biddeford’s restored 1896 opera house — community theater, concerts and film in the heart of the mills district.',
  'One Longfellow Square':
    'Portland’s listening room — an intimate nonprofit stage for folk, jazz and singer-songwriters.',
};
