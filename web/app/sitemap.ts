import type { MetadataRoute } from 'next';
import { API_BASE_URL } from '../lib/api';
import {
  SEGMENTS,
  cityQualifies,
  getLandingIndex,
  segmentQualifies,
  venueQualifies,
} from '../lib/landing';

// Regenerate at most hourly so newly synced events (and newly past ones)
// roll into the sitemap without a redeploy.
export const revalidate = 3600;

const SITE = 'https://joinaroo.com';

type ApiEvent = {
  slug: string;
  starts_at: string;
  updated_at?: string | null;
};

// The events API returns every non-hidden event (past and upcoming) when no
// date filter is given, capped at 200 per page. Page through all of them.
async function fetchAllEvents(): Promise<ApiEvent[]> {
  const all: ApiEvent[] = [];
  const limit = 200;
  let offset = 0;
  for (;;) {
    let data: { events?: ApiEvent[]; total?: number };
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/events?limit=${limit}&offset=${offset}`,
        { next: { revalidate: 3600 } },
      );
      if (!res.ok) break;
      data = await res.json();
    } catch {
      break;
    }
    const events = data.events || [];
    all.push(...events);
    if (!events.length || all.length >= (data.total ?? all.length)) break;
    offset += limit;
  }
  return all;
}

// updated_at may be a SQLite CURRENT_TIMESTAMP string ("YYYY-MM-DD HH:MM:SS",
// UTC) rather than ISO. Normalize before handing it to Date.
function toDate(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
    return new Date(value.replace(' ', 'T') + 'Z');
  }
  return new Date(value);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const events = await fetchAllEvents();

  const eventEntries: MetadataRoute.Sitemap = events.map((e) => {
    const start = toDate(e.starts_at);
    const upcoming = start >= now;
    return {
      url: `${SITE}/events/${e.slug}`,
      lastModified: e.updated_at ? toDate(e.updated_at) : start,
      changeFrequency: upcoming ? 'daily' : 'monthly',
      priority: upcoming ? 0.7 : 0.4,
    };
  });

  // Landing pages (cities / segments / venues) — only the ones that clear
  // the thin-page floors, mirroring the pages' own qualification rules.
  const idx = await getLandingIndex().catch(() => null);
  const landingEntries: MetadataRoute.Sitemap = [];
  if (idx) {
    for (const ci of idx.cities.values()) {
      if (!cityQualifies(ci)) continue;
      landingEntries.push({
        url: `${SITE}/events-in/${ci.slug}`,
        lastModified: now,
        changeFrequency: 'daily',
        priority: 0.8,
      });
      for (const seg of SEGMENTS) {
        if (!segmentQualifies(ci, seg)) continue;
        landingEntries.push({
          url: `${SITE}/events-in/${ci.slug}/${seg}`,
          lastModified: now,
          changeFrequency: 'daily',
          priority: 0.7,
        });
      }
    }
    for (const vi of idx.venues.values()) {
      if (!venueQualifies(vi)) continue;
      landingEntries.push({
        url: `${SITE}/venues/${vi.slug}`,
        lastModified: now,
        changeFrequency: 'daily',
        priority: 0.6,
      });
    }
  }

  return [
    { url: `${SITE}/`, lastModified: now, changeFrequency: 'hourly', priority: 1 },
    { url: `${SITE}/towns`, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${SITE}/categories`, changeFrequency: 'weekly', priority: 0.6 },
    ...landingEntries,
    ...eventEntries,
  ];
}
