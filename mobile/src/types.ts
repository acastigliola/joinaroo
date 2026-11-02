// Types matching ~/workspace/smevents/CONTRACT.md (API Contract v1, POC)

export interface Category {
  id: string | number;
  slug: string;
  name: string;
  tagline?: string | null;
  icon?: string | null;
}

export interface Venue {
  id: string | number;
  name: string;
  address?: string | null;
  city: string;
  lat?: number | null;
  lng?: number | null;
}

/** A person whose credited photo is on the event — the "live" card data. */
export interface LivePerson {
  name: string;
  handle?: string | null;
  platform?: string | null;
  avatar_url?: string | null;
  post_url?: string | null;
}

/** "Event listing with photos" pool (API recent_photos): photos borrowed
 * from the same home team's most recent games at this venue, for an
 * upcoming listing that has no photos of its own yet. */
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
 * tracked game's detail page — team mascots/logos, season/conference
 * records, a note panel, and what's-next rows. Mirrors web. */
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
  note?: { title: string; body: string } | null;
  next?: {
    title: string;
    subtitle?: string | null;
    rows: GameSummaryNextRow[];
  } | null;
}

/** Curated r/portlandme community block (Angelo mockup, Oct 29):
 * thread quotes, related bands, highlights. Mirrors web. */
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

export interface EventItem {
  id: string | number;
  slug: string;
  title: string;
  description?: string | null;
  category: Category;
  venue: Venue;
  starts_at: string; // ISO 8601
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
  pin_expires_at?: string | null;
  live_people?: LivePerson[];
  live_photo_url?: string | null;
  photo_count?: number;
  recent_photos?: RecentPhotos | null;
  /** Live-score state for a tracked game (API live_score, fed by the
   * score poller): 'live' during play, 'final' after; null when the
   * event has no tracked game. */
  live_score?: LiveScore | null;
  game_summary?: GameSummary | null;
  community?: CommunityBlockData | null;
  /** Card-image curation fields (API): derivative image, layout
   * ('top' = banner card), banner aspect, and focus point. */
  card_image_url?: string | null;
  card_layout?: string | null;
  card_top_ratio?: number | null;
  photo_focus?: string | null;
  /** Present only when the query included lat+lng; null otherwise. */
  distance_km?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface EventsResponse {
  events: EventItem[];
  total: number;
}

export interface GeoResult {
  label: string;
  lat: number;
  lng: number;
}
