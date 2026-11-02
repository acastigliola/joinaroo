import Link from 'next/link';
import EventCard from '../EventCard';
import MobileTabs from './MobileTabs';
import UseLocationButton from './UseLocationButton';
import GeoIconButton from './GeoIconButton';
import { geocode, getCategories, getEvents } from '../../lib/api';
import {
  buildSectionedRows,
  maineFullDate,
  livePillExpiresMs,
  maineWeekday,
  radiusKmFor,
  sortByDayPartDistance,
  todayBoundsMaine,
  nearbyStartMaine,
  weekendBoundsMaine,
  weekendRangeLabel,
  isNextWeekendMaine,
  type RadiusKey,
  type SectionRow,
} from '../../lib/mobile';

export type RawParams = { [key: string]: string | string[] | undefined };

export function first(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

/** Build a / URL preserving the given params plus updates (null deletes). */
export function homeHref(
  base: { lat?: string; lng?: string; label?: string; radius?: RadiusKey; categories?: string; anchor?: string },
  updates: Record<string, string | null> = {},
): string {
  const p = new URLSearchParams();
  if (base.lat && base.lng) {
    p.set('lat', base.lat);
    p.set('lng', base.lng);
  }
  if (base.label) p.set('label', base.label);
  if (base.radius && base.radius !== '25') p.set('radius', base.radius);
  if (base.categories) p.set('categories', base.categories);
  if (base.anchor) p.set('anchor', base.anchor);
  for (const [k, v] of Object.entries(updates)) {
    if (v == null) p.delete(k);
    else p.set(k, v);
  }
  const s = p.toString();
  return s ? `/?${s}` : '/';
}

const RADIUS_OPTIONS: { key: RadiusKey; label: string }[] = [
  { key: '1', label: '1 mi' },
  { key: '5', label: '5 mi' },
  { key: '25', label: '25 mi' },
  { key: '50', label: '50 mi' },
  { key: 'all', label: 'All' },
];

/** Section header: icon + bold title + gray subtitle, per the design mockups. */
function SectionHeader({
  icon,
  title,
  subtitle,
  iconButton,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  iconButton?: React.ReactNode;
}) {
  return (
    <div className="m-section-head">
      {iconButton ?? <img src={icon} alt="" className="m-section-icon" />}
      <div className="m-section-text">
        <h2 className="m-section-title2">{title}</h2>
        {subtitle && <p className="m-section-sub">{subtitle}</p>}
      </div>
    </div>
  );
}

/** Mobile-app Events screen replica, server-rendered. */
export default async function MobileHome({ searchParams }: { searchParams: RawParams }) {
  const selectedCategories = (first(searchParams.categories) || '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
  const categoriesParam = selectedCategories.length > 0 ? [...selectedCategories].sort().join(',') : undefined;
  // Anchor chip: set only by an event detail page's breadcrumb link
  // (?anchor=<slug>). While it is present, that chip holds its promoted
  // slot next to "All" for the whole filtering session (see below).
  const anchorSlug = first(searchParams.anchor) || null;
  const radius = (first(searchParams.radius) as RadiusKey) || '25';
  const locOff = first(searchParams.loc) === 'off';

  let lat = first(searchParams.lat);
  let lng = first(searchParams.lng);
  let label = first(searchParams.label);

  // Default to Portland, ME when no explicit location is set (mirrors the app).
  if (!locOff && !(lat && lng)) {
    try {
      const results = await geocode(label || 'Portland, ME');
      if (results[0]) {
        lat = String(results[0].lat);
        lng = String(results[0].lng);
        label = label || results[0].label;
      }
    } catch {
      lat = undefined;
      lng = undefined;
    }
  }
  if (locOff) {
    lat = undefined;
    lng = undefined;
    label = undefined;
  }
  const located = Boolean(lat && lng);
  const radiusKm = located ? radiusKmFor(radius) : undefined;

  const base = { lat, lng, label, radius, categories: categoriesParam, anchor: anchorSlug ?? undefined };
  const keepQs = (() => {
    const p = new URLSearchParams();
    if (lat && lng) {
      p.set('lat', lat);
      p.set('lng', lng);
    }
    if (label) p.set('label', label);
    const s = p.toString();
    return s ? `?${s}` : '';
  })();
  // Params to preserve when "Use my location" fires (category + radius).
  const keepForGeo = (() => {
    const p = new URLSearchParams();
    if (categoriesParam) p.set('categories', categoriesParam);
    if (anchorSlug) p.set('anchor', anchorSlug);
    if (radius !== '25') p.set('radius', radius);
    return p.toString();
  })();

  let events: Awaited<ReturnType<typeof getEvents>>['events'] = [];
  let total = 0;
  let featured: Awaited<ReturnType<typeof getEvents>>['events'] = [];
  let todayEvents: Awaited<ReturnType<typeof getEvents>>['events'] = [];
  let weekendEvents: Awaited<ReturnType<typeof getEvents>>['events'] = [];
  let categories: Awaited<ReturnType<typeof getCategories>> = [];
  let apiError = '';

  try {
    const [res, cats] = await Promise.all([
      // Nearby starts tomorrow (Angelo, Oct 28): today's events are
      // already listed in the Today section above.
      getEvents({ category: categoriesParam, from: nearbyStartMaine(), lat, lng, radius_km: radiusKm, limit: '200' }),
      getCategories(),
    ]);
    events = sortByDayPartDistance(res.events);
    total = res.total;
    categories = cats;

    {
      const tb = todayBoundsMaine();
      const wb = weekendBoundsMaine();
      const [f, t, w, s] = await Promise.all([
        // Whole featured pool (see page.tsx note): a small fetch limit
        // silently drops live/pinned events ranked below it.
        getEvents({ category: categoriesParam, featured: 'true', from: tb.from, lat, lng, radius_km: radiusKm, limit: '60' }),
        getEvents({ category: categoriesParam, from: tb.from, to: tb.to, lat, lng, radius_km: radiusKm, limit: '50' }),
        getEvents({ category: categoriesParam, from: wb.from, to: wb.to, lat, lng, radius_km: radiusKm, limit: '50' }),
        // Live events are STATEWIDE (Angelo, Oct 25): an event with
        // credited attendee photos shows in everyone's Featured, so
        // fetch today's events with an effectively unbounded radius
        // and merge the live ones into the featured pool below.
        getEvents({ category: categoriesParam, from: tb.from, to: tb.to, lat, lng, radius_km: '10000', limit: '200' }),
      ]);
      // Featured: pinned events first (featured_pin order), then soonest
      // first; ties broken by closest distance. Events already over
      // (ends_at in the past) never appear — unless pinned, and a pin
      // holds only until pin_expires_at: the end of the event's listing
      // day, or ends_at + 2h for late-night events (Angelo, Oct 25).
      const featuredNowMs = Date.now();
      // Still-live events sort ahead of everything else: a live event
      // (credited attendee photos, inside its LIVE-pill window) yields
      // its spot only when it stops being live (Angelo, Oct 25).
      // Live tiers (Angelo, Oct 25): 0 = still live (inside the LIVE
      // pill window), 1 = live earlier today (photos posted, pill
      // expired) — live cards as a block ahead of regular cards.
      const liveRank = (e: (typeof f.events)[number]) =>
        (e.live_people?.length ?? 0) === 0
          ? 2
          : livePillExpiresMs(e) > featuredNowMs
            ? 0
            : 1;
      const fIds = new Set(f.events.map((e) => e.id));
      const liveStatewide = s.events.filter(
        (e) => (e.live_people?.length ?? 0) > 0 && !fIds.has(e.id),
      );
      featured = [...f.events, ...liveStatewide]
        .filter((e) =>
          // A live event holds its Featured spot for its whole listing
          // day — even after it ends, even statewide. The exemption is
          // scoped to events whose listing day is TODAY: yesterday's
          // events (which the featured query's pin lookback still
          // returns) must not ride it past their day (Angelo, Oct 25).
          (e.live_people?.length ?? 0) > 0 &&
          +new Date(e.starts_at) >= +new Date(tb.from) &&
          +new Date(e.starts_at) < +new Date(tb.to)
            ? true
            : e.featured_pin != null
              ? e.pin_expires_at != null &&
                +new Date(e.pin_expires_at) > featuredNowMs
              : !e.ends_at || +new Date(e.ends_at) > featuredNowMs,
        )
        .sort((a, b) => {
          const la = liveRank(a);
          const lb = liveRank(b);
          if (la !== lb) return la - lb;
          if (la < 2) {
            // Live tier order (Angelo, Oct 25): most people first, then
            // the event that stays live the longest (latest pill expiry).
            const pc =
              (b.live_people?.length ?? 0) - (a.live_people?.length ?? 0);
            if (pc !== 0) return pc;
            const pe = livePillExpiresMs(b) - livePillExpiresMs(a);
            if (pe !== 0) return pe;
          }
          const pa = a.featured_pin ?? Number.POSITIVE_INFINITY;
          const pb = b.featured_pin ?? Number.POSITIVE_INFINITY;
          if (pa !== pb) return pa - pb;
          const dt = +new Date(a.starts_at) - +new Date(b.starts_at);
          if (dt !== 0) return dt;
          return (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity);
        })
        .slice(0, 10);
      todayEvents = [...t.events].sort(
        (a, b) => +new Date(a.starts_at) - +new Date(b.starts_at),
      );
      const nowMs = Date.now();
      weekendEvents = w.events
        .filter((e) => +new Date(e.ends_at ?? e.starts_at) > nowMs)
        .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));
    }
  } catch {
    apiError = 'Could not reach the events service.';
  }

  // Chip order: normally the API order. The one exception is the anchor
  // chip named by ?anchor, which only an event detail page's breadcrumb
  // sets: it is promoted next to "All" so the category the user came from
  // is visible without scrolling. The anchor is sticky for the session —
  // every in-page link carries it forward, so the row NEVER reorders while
  // the user selects or deselects chips: other chips light up or go dark
  // in their natural spots, and the anchored chip keeps its slot whether
  // it is selected or not. Arriving fresh (no ?anchor) restores the
  // natural order.
  const orderedCategories = anchorSlug
    ? [
        ...categories.filter((c) => c.slug === anchorSlug),
        ...categories.filter((c) => c.slug !== anchorSlug),
      ]
    : categories;

  return (
    <div className="m-app">
      {/* Location bar */}
      <div className="m-locbar">
        <Link className="m-loclabel" href={`/towns${keepQs}`}>
          <img src="/icons/icon-pin-red.png" alt="" className="m-locicon" />
          <span className="m-loctext">{label || 'No location'}</span>
          <span className="m-locchev">⌄</span>
        </Link>
        <UseLocationButton keep={keepForGeo} />
        <Link className="m-locbtn" href={`/towns${keepQs}`}>
          <img src="/icons/icon-pin-white.png" alt="" className="m-locbtn-icon" />
          Town
        </Link>
      </div>

      {/* Category chips */}
      <div className="m-chips" role="navigation" aria-label="Filter by category">
        <Link
          href={homeHref(base, { categories: null })}
          className={'m-chip' + (selectedCategories.length === 0 ? ' m-chip-active' : '')}
        >
          All
        </Link>
        {orderedCategories.map((c) => {
          const active = selectedCategories.includes(c.slug);
          const next = active
            ? selectedCategories.filter((s) => s !== c.slug)
            : [...selectedCategories, c.slug];
          return (
            <Link
              key={c.slug}
              href={homeHref(base, {
                categories: next.length > 0 ? [...next].sort().join(',') : null,
              })}
              className={'m-chip' + (active ? ' m-chip-active' : '')}
              title={c.tagline}
            >
              {c.name}
            </Link>
          );
        })}
      </div>

      {apiError ? (
        <p className="m-empty" role="alert">
          {apiError}
        </p>
      ) : (
        <>
          {featured.length > 0 && (
            <section aria-label="Featured events">
              <SectionHeader
                icon="/icons/icon-sparkle.png"
                title="Featured Events"
                subtitle="Handpicked happenings near you"
              />
              <div className="m-carousel">
                {featured.map((e) => (
                  <div
                    className={
                      e.card_layout === 'top' || (e.live_people?.length ?? 0) > 0
                        ? 'm-spotcard'
                        : 'm-spotcard m-spotcard--featured'
                    }
                    key={e.slug}
                  >
                    <EventCard event={e} photoCard />
                  </div>
                ))}
              </div>
            </section>
          )}

          {todayEvents.length > 0 && (
            <section aria-label="Today's events">
              <SectionHeader
                icon="/icons/icon-calendar-blue.png"
                title="Today"
                subtitle={maineFullDate()}
              />
              <div className="m-carousel">
                {todayEvents.map((e) => (
                  <div className="m-spotcard" key={e.slug}>
                    <EventCard event={e} dayLabel="Today" photoCard />
                  </div>
                ))}
              </div>
            </section>
          )}

          {weekendEvents.length > 0 && (
            <section aria-label="This weekend's events">
              <SectionHeader
                icon="/icons/icon-calendar-purple.png"
                title={isNextWeekendMaine() ? "Next Weekend" : "This Weekend"}
                subtitle={weekendRangeLabel(weekendEvents.map((e) => e.starts_at))}
              />
              <div className="m-carousel">
                {weekendEvents.map((e) => (
                  <div className="m-spotcard" key={e.slug}>
                    <EventCard event={e} dayLabel={maineWeekday(e.starts_at)} photoCard />
                  </div>
                ))}
              </div>
            </section>
          )}

          <section aria-label="Events">
            <div className="m-listhead">
              <SectionHeader
                icon="/icons/icon-nearby.png"
                title={`${located ? 'Nearby Events' : 'Upcoming'} (${total})`}
                subtitle={located ? 'Events closest to you' : undefined}
                iconButton={
                  <GeoIconButton keep={keepForGeo} icon="/icons/icon-nearby.png" label="Use my location" />
                }
              />
              {located && (
                <div className="m-radius" role="navigation" aria-label="Search radius">
                  {RADIUS_OPTIONS.map((r) => (
                    <Link
                      key={r.key}
                      href={homeHref(base, {
                        radius: r.key === '25' ? null : r.key,
                      })}
                      className={'m-rchip' + (radius === r.key ? ' m-rchip-active' : '')}
                    >
                      {r.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
            {events.length === 0 ? (
              <p className="m-empty">No events found. Try another category or town.</p>
            ) : (
              <div className="m-list">
                {buildSectionedRows(events).map((row: SectionRow) =>
                  row.kind === 'month' ? (
                    <h3 key={row.key} className="m-month-header">
                      {row.label}
                    </h3>
                  ) : row.kind === 'day' ? (
                    <h4 key={row.key} className="m-day-header">
                      {row.label}
                    </h4>
                  ) : (
                    <EventCard key={row.key} event={row.event} photoCard />
                  ),
                )}
              </div>
            )}
          </section>
        </>
      )}

      <MobileTabs active="events" qs={keepQs} />
    </div>
  );
}
