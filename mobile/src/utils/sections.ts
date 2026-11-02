// Day/month section headers for the event list ("Closest to you").
// Groups events by Maine-local date:
// - Day labels: weekday name alone for today + next 6 days ("Tuesday"),
//   full "Tuesday, October 20th, 2026" after that.
// - Month labels ("November") once when the month rolls over.
import type { EventItem } from '../types';

const MAINE_TZ = 'America/New_York';

function maineParts(iso: string): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MAINE_TZ,
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

function weekdayName(y: number, m: number, d: number): string {
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    weekday: 'long',
    timeZone: 'UTC',
  });
}

function monthName(y: number, m: number): string {
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, {
    month: 'long',
    timeZone: 'UTC',
  });
}

/**
 * When the LIVE pill comes off an event (Angelo's pill lifetime rule):
 * one hour after ends_at when known; with no end time, midnight ending
 * the event's listing day (device-local, matching todayBounds).
 */
export function livePillExpiresMs(e: {
  starts_at: string;
  ends_at?: string | null;
}): number {
  if (e.ends_at) return +new Date(e.ends_at) + 3_600_000;
  const s = new Date(e.starts_at);
  const midnight = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 1, 0, 0, 0).getTime();
  // Angelo, Oct 25: no-end-time events cap at start + 4h; midnight if sooner.
  return Math.min(midnight, s.getTime() + 4 * 3_600_000);
}

/**
 * When the "More Event Details and Tickets" button leaves the event page
 * (Angelo, Oct 25): midnight ending the event's last day — the local day
 * of ends_at when known, else the local day of starts_at.
 */
export function detailsButtonExpiresMs(e: {
  starts_at: string;
  ends_at?: string | null;
}): number {
  const ref = new Date(e.ends_at ?? e.starts_at);
  return new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + 1, 0, 0, 0).getTime();
}

export type ListRow =
  | { kind: 'month'; key: string; label: string }
  | { kind: 'day'; key: string; label: string }
  | { kind: 'event'; key: string; event: EventItem };

export function buildSectionedRows(events: EventItem[]): ListRow[] {
  const rows: ListRow[] = [];
  const t = maineParts(new Date().toISOString());
  const todayUTC = Date.UTC(t.y, t.m - 1, t.d);
  let lastDayKey = '';
  // Start with the current month so no header is emitted for it up front;
  // month headers appear only when the month actually rolls over.
  let lastMonthKey = `${t.y}-${t.m}`;

  for (const e of events) {
    const { y, m, d } = maineParts(e.starts_at);
    const dayKey = `${y}-${m}-${d}`;
    if (dayKey === lastDayKey) {
      rows.push({ kind: 'event', key: e.slug, event: e });
      continue;
    }
    const monthKey = `${y}-${m}`;
    if (monthKey !== lastMonthKey) {
      rows.push({ kind: 'month', key: `m-${monthKey}`, label: monthName(y, m) });
      lastMonthKey = monthKey;
    }
    const diff = Math.round((Date.UTC(y, m - 1, d) - todayUTC) / 86400000);
    const weekday = weekdayName(y, m, d);
    const label =
      diff >= 0 && diff <= 6
        ? weekday
        : `${weekday}, ${monthName(y, m)} ${ordinal(d)}, ${y}`;
    rows.push({ kind: 'day', key: `d-${dayKey}`, label });
    lastDayKey = dayKey;
    rows.push({ kind: 'event', key: e.slug, event: e });
  }
  return rows;
}
