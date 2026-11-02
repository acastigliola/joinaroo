// Public API client for the Southern Maine Events web frontend.
// Talks to the shared SME web-service backend (read-only here).

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export interface Category {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  icon: string;
}

export interface Venue {
  id: string;
  name: string;
  address?: string | null;
  city: string;
  lat?: number | null;
  lng?: number | null;
}

export interface EventItem {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  category: { id: string; slug: string; name: string };
  venue: Venue | null;
  starts_at: string;
  ends_at?: string | null;
  cost_free: boolean;
  cost_text?: string | null;
  url?: string | null;
  source?: string | null;
  image_url?: string | null;
  recurrence?: string | null;
  series_key?: string | null;
  featured: boolean;
  sold_out?: boolean;
  community_pick?: boolean;
  featured_pin?: number | null;
  strip_focus?: string | null;
  photo_focus?: string | null;
  card_image_url?: string | null;
  card_layout?: string | null;
  card_top_ratio?: string | null;
  pin_expires_at?: string | null;
  live_people?: LivePerson[];
  live_score?: LiveScore | null;
  game_summary?: GameSummary | null;
  community?: CommunityBlockData | null;
  live_photo_url?: string | null;
  photo_count?: number;
  recent_photos?: RecentPhotos | null;
  room_proof?: RoomProofData | null;
  peephole?: PeepholeData | null;
  distance_km?: number | null;
  created_at: string;
  updated_at: string;
}

/** Room Proof (Angelo, Nov 2): venue photo-history module data. Present
 * only on a photo-less event at a venue where the finder has a track
 * record: curated proof photos from a past night in that room, plus a
 * prediction block when this event is finder-committed. */
export interface RoomProofData {
  venue_name: string;
  proof: {
    event_id: number;
    slug: string;
    title: string;
    date_label: string;
    photo_count: number;
    photos: { url: string; credit: string | null }[];
  };
  prediction: {
    window_label: string;
    followed: number | null;
    with_photos: number | null;
  } | null;
  postmortem: boolean;
}

/** The Peephole (Spark consult, Nov 2; pilot on Blue October): rooms
 * live right now (>=3 credited photos in the last 90 min), else last
 * night's rooms. Null when nothing qualifies — never an empty state. */
export interface PeepholeData {
  mode: 'live' | 'last_night';
  night_label?: string;
  city_label: string;
  rooms: {
    event_id: number;
    slug: string;
    title: string;
    venue_name: string;
    city: string | null;
    photo_count: number;
    thumb_url: string;
  }[];
}

/** "Event listing with photos" pool: photos borrowed from the same home
 * team's most recent games at this venue, for an upcoming listing that
 * has no photos of its own yet. Null/absent on every other listing. */
export interface RecentPhotos {
  team: string;
  games: { slug: string; starts_at: string; photo_count: number }[];
  photos: {
    url: string;
    event_slug: string;
    event_starts_at: string;
    caption?: string | null;
    source?: {
      name: string;
      business: string | null;
      website: string | null;
      instagram: string | null;
      facebook: string | null;
      email: string | null;
      x_username: string | null;
      x_post_url: string | null;
      ig_username: string | null;
      ig_post_url: string | null;
    } | null;
  }[];
  total: number;
  last_people: LivePerson[];
  last_photo_count: number;
}

/** Live-score state for a tracked game (API: live_score, fed by the
 * score poller). A second liveness signal next to attendee photos:
 * 'live' while the game is being played, 'final' once it ends (finals
 * persist). Null on events with no tracked game. */
export interface LiveScore {
  status: 'scheduled' | 'live' | 'final';
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  period: string | null;
  updated_at: string | null;
}

/** Game-summary module (Angelo, Oct 28): the enriched score header on a
 * tracked game's detail page — logo-vs-logo score, season/conference
 * records, a note panel, and what's-next rows. Stored per event as JSON;
 * the score itself comes from live_score. */
export interface GameSummaryTeam {
  name: string;
  mascot?: string | null;
  logo?: string | null;
}
export interface GameSummaryRecord {
  label: string;
  value: string;
  sub?: string | null;
}
export interface GameSummaryNextRow {
  stage: string;
  date: string;
  time?: string | null;
  place?: string | null;
  detail?: string | null;
  badge?: string | null;
}
export interface GameSummary {
  home: GameSummaryTeam;
  away: GameSummaryTeam;
  records?: GameSummaryRecord[];
  records_logo?: string | null;
  rail_logo?: string | null;
  note?: { title: string; body: string } | null;
  next?: {
    title: string;
    subtitle?: string | null;
    rows: GameSummaryNextRow[];
  } | null;
}

/** Curated r/portlandme community block for an event detail page
 *  (Angelo mockup, Oct 29): thread quotes, related bands, highlights. */
export interface CommunityQuote {
  text: string;
  author: string;
  ago?: string | null;
  avatar_url?: string | null;
  permalink?: string | null;
}

export interface CommunityBand {
  name: string;
  photo?: string | null;
  query: string;
}

export interface CommunityBlockData {
  thread_url: string;
  subreddit: string;
  intro: string;
  feature_quote: CommunityQuote;
  related_bands: CommunityBand[];
  highlights: CommunityQuote[];
}

/** A person whose credited photo is on the event — the "live" card data. */
export interface LivePerson {
  name: string;
  handle?: string | null;
  platform?: string | null;
  avatar_url?: string | null;
  post_url?: string | null;
}

export interface GeocodeResult {
  label: string;
  lat: number;
  lng: number;
}

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`API ${res.status} for ${path}`);
  }
  return (await res.json()) as T;
}

export interface EventQuery {
  q?: string;
  category?: string;
  lat?: string;
  lng?: string;
  radius_km?: string;
  featured?: string;
  limit?: string;
  from?: string;
  to?: string;
}

export async function getEvents(
  opts: EventQuery = {},
): Promise<{ events: EventItem[]; total: number }> {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(opts)) {
    if (v) p.set(k, v);
  }
  if (!p.has('limit')) p.set('limit', '60');
  return apiFetch<{ events: EventItem[]; total: number }>(
    `/api/events?${p.toString()}`,
  );
}

/** Trending event pages (desktop homepage sidebar): top events by
 *  real-human pageviews over the trailing window, house-filtered by
 *  the API. Each item carries its view count in `views`. */
export async function getTrending(
  limit = 4,
): Promise<(EventItem & { views: number })[]> {
  try {
    const data = await apiFetch<{ events: (EventItem & { views: number })[] }>(
      `/api/trending?days=7&limit=${limit}`,
    );
    return data.events;
  } catch {
    return [];
  }
}

export async function getEvent(slug: string): Promise<EventItem | null> {
  const res = await fetch(
    `${API_BASE_URL}/api/events/${encodeURIComponent(slug)}`,
    { cache: 'no-store' },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API ${res.status} for /api/events/${slug}`);
  return (await res.json()) as EventItem;
}

export async function getCategories(): Promise<Category[]> {
  return apiFetch<Category[]>('/api/categories');
}

export async function geocode(q: string): Promise<GeocodeResult[]> {
  return apiFetch<GeocodeResult[]>(
    `/api/geocode?q=${encodeURIComponent(q)}`,
  );
}

/** "Sat, Oct 17 · 1:00 PM" in Maine time. */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'America/New_York',
  }).format(d);
  const time = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
  }).format(d);
  return `${date} · ${time}`;
}

export type DayPart = 'morning' | 'afternoon' | 'evening';

/** Hour of day in Maine time (0–23), derived from the event's ISO timestamp. */
function maineHour(iso: string): number {
  const h = parseInt(
    new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: 'America/New_York',
    }).format(new Date(iso)),
    10,
  );
  return h === 24 ? 0 : h;
}

export function timeOfDay(iso: string): DayPart {
  const h = maineHour(iso);
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  return 'evening';
}

export const DAY_PART_STYLE: Record<
  DayPart,
  { label: string; bar: string; text: string; bg: string }
> = {
  morning: { label: 'Morning', bar: '#FFB300', text: '#B27D00', bg: '#FFFDF4' },
  afternoon: { label: 'Afternoon', bar: '#42A5F5', text: '#1565C0', bg: '#F6FBFF' },
  evening: { label: 'Evening', bar: '#1B3A6B', text: '#1B3A6B', bg: '#F4F6FB' },
};

/** "6:00 PM" in Maine time. */
export function formatTimeMaine(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
  }).format(new Date(iso));
}

/** "Sat, Oct 17 · Morning · 9:00 AM" in Maine time — matches the mobile card. */
export function formatDatePart(iso: string): string {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'America/New_York',
  }).format(d);
  const time = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
  }).format(d);
  return `${date} · ${time}`;
}

/** Full date for event pages, e.g. "Saturday, October 17, 2026 at 1:00 PM EDT". */
export function formatDateLong(iso: string): string {
  const d = new Date(iso);
  return (
    new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'America/New_York',
    }).format(d) +
    ' at ' +
    new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
      timeZone: 'America/New_York',
    }).format(d)
  );
}

/** Time only, e.g. "7:00 PM EDT" — end time when start and end share a day. */
export function formatTimeLong(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
    timeZone: 'America/New_York',
  }).format(new Date(iso));
}

/** True when both timestamps fall on the same calendar day in Maine. */
export function sameDayET(a: string, b: string): boolean {
  const key = (iso: string) =>
    new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: 'America/New_York',
    }).format(new Date(iso));
  return key(a) === key(b);
}

export function formatDistance(km?: number | null): string {
  if (km == null) return '';
  const mi = km * 0.621371;
  if (mi < 0.1) return 'Nearby';
  if (mi < 10) return `${mi.toFixed(1)} mi`;
  return `${Math.round(mi)} mi`;
}

export function mapsUrl(e: EventItem): string {
  const v = e.venue;
  const query = v
    ? [v.name, v.address, v.city, 'ME'].filter(Boolean).join(', ')
    : e.title;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

const ICON_EMOJI: Record<string, string> = {
  moon: '🌙',
  brain: '🧠',
  masks: '🎭',
  code: '💻',
  gamepad: '🎮',
  utensils: '🍽️',
  users: '🏘️',
  smile: '👨‍👩‍👧',
  trophy: '🏆',
  leaf: '🍂',
  book: '📚',
  palette: '🎨',
};

export function categoryEmoji(icon: string): string {
  return ICON_EMOJI[icon] || '🎟️';
}
