import { EventItem, timeOfDay } from './api';

/** True for phone user-agents (Android, iPhone, etc.). */
export function isMobileUA(ua: string): boolean {
  return /android|iphone|ipad|ipod|mobile|phone|blackberry|iemobile|opera mini/i.test(ua);
}

/** Towns offered in the mobile-style town picker (mirrors the mobile app). */
/** Pinned pilot towns first (Portland, Westbrook, Orono), then every other
 * Maine town that has events, A–Z. Matches the prod venue-city census
 * (Oct 24, 2026); out-of-state away-game cities are excluded. */
export const MOBILE_TOWNS = [
  'Portland',
  'Westbrook',
  'Orono',
  'Arundel',
  'Auburn',
  'Augusta',
  'Bangor',
  'Bar Harbor',
  'Bath',
  'Belfast',
  'Biddeford',
  'Boothbay',
  'Boothbay Harbor',
  'Brewer',
  'Brunswick',
  'Bucksport',
  'Camden',
  'Cumberland',
  'East Boothbay',
  'Eastport',
  'Eliot',
  'Ellsworth',
  'Freeport',
  'Gardiner',
  'Gorham',
  'Hallowell',
  'Kennebunk',
  'Kennebunkport',
  'Kittery',
  'Lewiston',
  'Millinocket',
  'North Berwick',
  'Oakland',
  'Ogunquit',
  'Old Orchard Beach',
  'Old Town',
  'Patten',
  'Rockland',
  'Saco',
  'Sanford',
  'Scarborough',
  'Searsport',
  'Sidney',
  'Skowhegan',
  'South Berwick',
  'South Portland',
  'Southport',
  'Springvale',
  'Topsham',
  'Union',
  'Unity',
  'Waterboro',
  'Waterville',
  'Wells',
  'Wiscasset',
  'York',
];

export type RadiusKey = '1' | '5' | '25' | '50' | 'all';

/** 1 mi ≈ 1.6 km, 5 mi ≈ 8 km, 25 mi ≈ 40 km, 50 mi ≈ 80 km. "All" uses a huge radius (API has no unfiltered mode). */
export function radiusKmFor(key: RadiusKey): string {
  if (key === '1') return '1.6';
  if (key === '5') return '8';
  if (key === '25') return '40';
  if (key === '50') return '80';
  return '20000';
}

const PART_ORDER: Record<string, number> = { morning: 0, afternoon: 1, evening: 2 };

/** Mobile-app sort: calendar day, then morning → afternoon → evening, then distance. */
export function sortByDayPartDistance(list: EventItem[]): EventItem[] {
  return [...list].sort((a, b) => {
    // Sort by Maine calendar date (must match buildSectionedRows grouping,
    // otherwise day headers duplicate when UTC and Maine dates disagree).
    const ma = maineYMD(a.starts_at);
    const mb = maineYMD(b.starts_at);
    if (ma.y !== mb.y) return ma.y - mb.y;
    if (ma.m !== mb.m) return ma.m - mb.m;
    if (ma.d !== mb.d) return ma.d - mb.d;
    const pa = PART_ORDER[timeOfDay(a.starts_at)] ?? 3;
    const pb = PART_ORDER[timeOfDay(b.starts_at)] ?? 3;
    if (pa !== pb) return pa - pb;
    return (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity);
  });
}

// ---- Maine-time date helpers (the site displays everything in America/New_York) ----

function maineParts(d: Date): { y: number; m: number; day: number; dow: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  }).formatToParts(d);
  const get = (t: string) => parseInt(parts.find((p) => p.type === t)!.value, 10);
  const dowStr = parts.find((p) => p.type === 'weekday')!.value;
  return {
    y: get('year'),
    m: get('month'),
    day: get('day'),
    dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(dowStr),
  };
}

/** Numeric UTC offset of America/New_York on a given date, e.g. "-04:00". */
function maineOffset(y: number, m: number, day: number): string {
  const probe = new Date(Date.UTC(y, m - 1, day, 12));
  const s = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    timeZoneName: 'shortOffset',
  }).format(probe);
  const mm = s.match(/GMT([+-])(\d{1,2})/);
  if (!mm) return '-04:00';
  return `${mm[1] === '+' ? '+' : '-'}${mm[2].padStart(2, '0')}:00`;
}

function maineISO(
  y: number,
  m: number,
  day: number,
  hh: number,
  mi: number,
  ss: number,
): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${y}-${p(m)}-${p(day)}T${p(hh)}:${p(mi)}:${p(ss)}${maineOffset(y, m, day)}`;
}

function addDays(y: number, m: number, day: number, n: number): { y: number; m: number; day: number } {
  const d = new Date(Date.UTC(y, m - 1, day + n));
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

// TEMPORARY DAY FREEZE (Angelo, late Oct 24, 2026): hold the listing day
// at Saturday, October 24 past midnight while he keeps working with the
// current layout. Set DAY_FREEZE_ISO back to null to resume the normal
// midnight rollover.
const DAY_FREEZE_ISO: string | null = null;
export function listingNow(): Date {
  return DAY_FREEZE_ISO ? new Date(DAY_FREEZE_ISO) : new Date();
}

/** Today's bounds in Maine time for the API from/to filters. */
export function todayBoundsMaine(): { from: string; to: string } {
  const { y, m, day } = maineParts(listingNow());
  return { from: maineISO(y, m, day, 0, 0, 0), to: maineISO(y, m, day, 23, 59, 59) };
}

/**
 * Tomorrow's start in Maine time. The Nearby/Upcoming list starts here
 * (Angelo, Oct 28): today's events already have their own Today section,
 * so listing them again under Nearby is duplication.
 */
export function tomorrowStartMaine(): string {
  const { y, m, day } = maineParts(listingNow());
  const nx = addDays(y, m, day, 1);
  return maineISO(nx.y, nx.m, nx.day, 0, 0, 0);
}

/**
 * When the Nearby/Upcoming list starts (Angelo, Oct 29, refined):
 * Mon–Wed the weekend is still days away, so Nearby starts tomorrow
 * and flows through it. Thu–Sun the Weekend section owns Fri–Sun,
 * so Nearby jumps to Monday — no day listed twice, and on Sunday
 * the Mon–Thu gap week stays covered.
 */
export function nearbyStartMaine(): string {
  const now = maineParts(listingNow());
  const ahead = now.dow >= 1 && now.dow <= 3 ? 1 : (8 - now.dow) % 7;
  const d = addDays(now.y, now.m, now.day, ahead);
  return maineISO(d.y, d.m, d.day, 0, 0, 0);
}

/**
 * When the LIVE pill comes off an event (Angelo's pill lifetime rule):
 * one hour after ends_at when an end time is known; with no end time,
 * midnight ending the event's Maine listing day. Before this helper the
 * no-end-time case never expired, so past events kept the pill forever.
 */
export function livePillExpiresMs(e: {
  starts_at: string;
  ends_at?: string | null;
}): number {
  if (e.ends_at) return +new Date(e.ends_at) + 3_600_000;
  const { y, m, day } = maineParts(new Date(e.starts_at));
  const nx = addDays(y, m, day, 1);
  // Angelo, Oct 25: no-end-time events are capped at start + 4h (a 1:30 PM
  // matinee stops reading "here now" by evening); midnight still applies
  // when it comes first.
  return Math.min(
    +new Date(maineISO(nx.y, nx.m, nx.day, 0, 0, 0)),
    +new Date(e.starts_at) + 4 * 3_600_000,
  );
}

/**
 * When the "More Event Details and Tickets" button leaves the event page
 * (Angelo, Oct 25): midnight ending the event's last day — the Maine day
 * of ends_at when known, else the Maine day of starts_at.
 */
export function detailsButtonExpiresMs(e: {
  starts_at: string;
  ends_at?: string | null;
}): number {
  const ref = new Date(e.ends_at ?? e.starts_at);
  const { y, m, day } = maineParts(ref);
  const nx = addDays(y, m, day, 1);
  return +new Date(maineISO(nx.y, nx.m, nx.day, 0, 0, 0));
}

/**
 * This weekend's bounds in Maine time (Fri 00:00 – Sun 23:59).
 * Mon–Thu -> the coming Fri–Sun. Sat/Sun -> the weekend already underway.
 * Friday -> Sat–Sun only: Friday itself belongs to Today (Angelo, Oct 30).
 */
export function weekendBoundsMaine(): { from: string; to: string } {
  const now = maineParts(listingNow());
  let fri = { y: now.y, m: now.m, day: now.day };
  if (now.dow === 6) fri = addDays(now.y, now.m, now.day, -1);
  else if (now.dow === 0) fri = addDays(now.y, now.m, now.day, 5); // Sunday: next weekend
  else if (now.dow >= 1 && now.dow <= 4) fri = addDays(now.y, now.m, now.day, 5 - now.dow);
  const sun = addDays(fri.y, fri.m, fri.day, 2);
  const start = now.dow === 5 ? addDays(fri.y, fri.m, fri.day, 1) : fri;
  return {
    from: maineISO(start.y, start.m, start.day, 0, 0, 0),
    to: maineISO(sun.y, sun.m, sun.day, 23, 59, 59),
  };
}

/** True when today is Sunday (Maine) — the weekend section shows next weekend. */
export function isNextWeekendMaine(): boolean {
  return maineParts(listingNow()).dow === 0;
}

/** Full weekday name in Maine time, e.g. "Friday". */
export function maineWeekday(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    timeZone: 'America/New_York',
  }).format(new Date(iso));
}

/** Full weekday name for today in Maine time, e.g. "Tuesday". */
export function maineTodayName(): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    timeZone: 'America/New_York',
  }).format(listingNow());
}

/** Full date for today in Maine time, e.g. "Thursday, October 16". */
export function maineFullDate(): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/New_York',
  }).format(listingNow());
}

/** Short date in Maine time, e.g. "Fri, Oct 17". */
export function maineShortDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'America/New_York',
  }).format(new Date(iso));
}

/** Weekend range label from event start dates, e.g. "Fri, Oct 17 – Sun, Oct 19".
 *  The start of the range is clamped to today (Maine time) — on Saturday the
 *  label shows "Sat, Oct 18 – Sun, Oct 19", not Friday's date. */
export function weekendRangeLabel(startsAts: string[]): string {
  if (startsAts.length === 0) return '';
  const sorted = [...startsAts].sort();
  // Clamp the range start to today (Maine) so past days don't appear.
  const todayYMD = maineYMD(listingNow().toISOString());
  const todayStr = `${todayYMD.y}-${String(todayYMD.m).padStart(2, '0')}-${String(todayYMD.d).padStart(2, '0')}`;
  // Find the first event date that is today or later.
  let startIdx = sorted.findIndex((iso) => {
    const d = maineYMD(iso);
    const ds = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
    return ds >= todayStr;
  });
  if (startIdx === -1) startIdx = 0; // fallback: use earliest
  const startLabel = maineShortDate(sorted[startIdx]);
  const endLabel = maineShortDate(sorted[sorted.length - 1]);
  // If start and end are the same day, show just one date.
  if (startLabel === endLabel) return startLabel;
  return `${startLabel} – ${endLabel}`;
}

function maineYMD(iso: string): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return { y: Number(get('year')), m: Number(get('month')), d: Number(get('day')) };
}

function ordinal(n: number): string {
  if (n >= 11 && n <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export type SectionRow =
  | { kind: 'month'; key: string; label: string }
  | { kind: 'day'; key: string; label: string }
  | { kind: 'event'; key: string; event: EventItem };

/**
 * Group events under day/month headers for the "Closest to you" list.
 * Day labels: weekday alone for today + next 6 days, else "Tuesday, October 20th, 2026".
 * A month label ("November") is emitted once when the month rolls over.
 */
export function buildSectionedRows(events: EventItem[]): SectionRow[] {
  const rows: SectionRow[] = [];
  const t = maineYMD(listingNow().toISOString());
  const todayUTC = Date.UTC(t.y, t.m - 1, t.d);
  let lastDayKey = '';
  let lastMonthKey = `${t.y}-${t.m}`;

  for (const e of events) {
    const { y, m, d } = maineYMD(e.starts_at);
    const dayKey = `${y}-${m}-${d}`;
    if (dayKey !== lastDayKey) {
      const monthKey = `${y}-${m}`;
      if (monthKey !== lastMonthKey) {
        rows.push({
          kind: 'month',
          key: `m-${monthKey}`,
          label: new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, {
            month: 'long',
            timeZone: 'UTC',
          }),
        });
        lastMonthKey = monthKey;
      }
      const diff = Math.round((Date.UTC(y, m - 1, d) - todayUTC) / 86400000);
      const weekday = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
        weekday: 'long',
        timeZone: 'UTC',
      });
      const label =
        diff >= 0 && diff <= 6
          ? weekday
          : `${weekday}, ${new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, {
              month: 'long',
              timeZone: 'UTC',
            })} ${ordinal(d)}, ${y}`;
      rows.push({ kind: 'day', key: `d-${dayKey}`, label });
      lastDayKey = dayKey;
    }
    rows.push({ kind: 'event', key: e.slug, event: e });
  }
  return rows;
}
