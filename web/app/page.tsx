import { Suspense, type ReactNode } from 'react';
import Link from 'next/link';
import { headers } from 'next/headers';
import EventCard from '../components/EventCard';
import LocationControls from '../components/LocationControls';
import DesktopHomeHeader from '../components/DesktopHomeHeader';
import MobileHome from '../components/mobile/MobileHome';
import { geocode, getCategories, getEvents, getTrending } from '../lib/api';
import {
  buildSectionedRows,
  isMobileUA,
  isNextWeekendMaine,
  livePillExpiresMs,
  maineFullDate,
  maineWeekday,
  sortByDayPartDistance,
  todayBoundsMaine,
  nearbyStartMaine,
  weekendBoundsMaine,
  weekendRangeLabel,
} from '../lib/mobile';

export const dynamic = 'force-dynamic';

type RawParams = { [key: string]: string | string[] | undefined };

function first(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

/** Build a / URL preserving the base params plus updates (null deletes).
 *  Mirrors MobileHome's homeHref so the desktop chips behave identically. */
function chipHref(
  base: {
    q?: string;
    lat?: string;
    lng?: string;
    label?: string;
    categories?: string;
    anchor?: string;
  },
  updates: Record<string, string | null> = {},
): string {
  const p = new URLSearchParams();
  if (base.q) p.set('q', base.q);
  if (base.lat && base.lng) {
    p.set('lat', base.lat);
    p.set('lng', base.lng);
  }
  if (base.label) p.set('label', base.label);
  if (base.categories) p.set('categories', base.categories);
  if (base.anchor) p.set('anchor', base.anchor);
  for (const [k, v] of Object.entries(updates)) {
    if (v == null) p.delete(k);
    else p.set(k, v);
  }
  const s = p.toString();
  return s ? `/?${s}` : '/';
}

/** Section header matching the mobile design: icon + bold title + gray
 *  subtitle, plus the desktop mockup's right-side "View all →" link
 *  (Angelo, Oct 29) where a section is capped. */
function DesktopSectionHeader({
  icon,
  title,
  subtitle,
  allHref,
  allLabel,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  allHref?: string;
  allLabel?: string;
}) {
  return (
    <div className="d-section-head">
      <img src={icon} alt="" className="d-section-icon" />
      <div>
        <h2 className="d-section-title">{title}</h2>
        {subtitle && <p className="d-section-sub">{subtitle}</p>}
      </div>
      {allHref && allLabel && (
        <Link href={allHref} className="d-section-all">
          {allLabel}
          <img src="/icons/icon-arrow-right.png" alt="" />
        </Link>
      )}
    </div>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<RawParams>;
}) {
  const sp = await searchParams;
  const q = first(sp.q)?.trim() || undefined;
  // Category chips are MULTI-select, same as mobile (Angelo, Oct 28):
  // ?categories=a,b,c. The legacy single ?category= still parses as a
  // one-chip selection so old links keep working.
  const selectedCategories = (first(sp.categories) || first(sp.category) || '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
  const categoriesParam =
    selectedCategories.length > 0
      ? [...selectedCategories].sort().join(',')
      : undefined;
  // Anchor chip, same as mobile: set by an event detail page's category
  // link; that chip holds its promoted slot next to "All" all session.
  const anchorSlug = first(sp.anchor) || null;
  const locOff = first(sp.loc) === 'off';
  // Desktop mockup "View all →" links (Angelo, Oct 29): a capped
  // section expands in place via ?expand=<section>.
  const expand = first(sp.expand) || null;

  // Phones get the mobile-app replica UI (?view=desktop forces the desktop site).
  const view = first(sp.view);
  const ua = (await headers()).get('user-agent') || '';
  if (view === 'mobile' || (view !== 'desktop' && isMobileUA(ua))) {
    return <MobileHome searchParams={sp} />;
  }

  let lat = first(sp.lat);
  let lng = first(sp.lng);
  let label = first(sp.label);

  // Default to Portland, ME when no explicit location is set.
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

  let events: Awaited<ReturnType<typeof getEvents>>['events'] = [];
  let trending: Awaited<ReturnType<typeof getTrending>> = [];
  let total = 0;
  let featured: Awaited<ReturnType<typeof getEvents>>['events'] = [];
  let todayEvents: Awaited<ReturnType<typeof getEvents>>['events'] = [];
  let weekendEvents: Awaited<ReturnType<typeof getEvents>>['events'] = [];
  let categories: Awaited<ReturnType<typeof getCategories>> = [];
  let apiError = '';

  // The homepage renders the four sections — Featured Events, Today,
  // This Weekend, Nearby Events — same as mobile (Angelo, Oct 28),
  // including while category chips are selected: the sections then
  // populate from the selected categories, exactly like mobile.
  // Only a search switches to the single results list.
  const browse = !q;
  // Desktop has no radius chips; its sections use mobile's default
  // radius (25 mi = 40 km) so the counts match across platforms. With
  // no radius_km the API falls back to 50 km, which quietly pulled
  // ~30% more events into the desktop sections (Angelo, Oct 28).
  const DESKTOP_RADIUS_KM = '40';

  try {
    const [res, cats] = await Promise.all([
      // In browse mode the main list is Nearby, which starts tomorrow:
      // today's events already have their own Today section.
      getEvents({
        q,
        category: categoriesParam,
        from: browse ? nearbyStartMaine() : new Date().toISOString(),
        lat,
        lng,
        // Explicit in every mode (Angelo, Oct 28): search/category
        // views use the same 40 km as the sections and mobile search,
        // not the API's 50 km default.
        radius_km: DESKTOP_RADIUS_KM,
        // Mobile's Nearby fetch takes 200; without an explicit limit
        // the client default (60) truncates the desktop list — the
        // API orders by distance, so whole day groups lost their
        // farther events (Angelo, Oct 28: Thursday showed 2 vs 8).
        limit: browse ? '200' : '60',
      }),
      getCategories(),
    ]);
    events = res.events;
    total = res.total;
    categories = cats;
    if (browse) {
      // Fetch the whole featured pool, not just a page of it: the
      // live/pin ordering below must see every candidate or a live or
      // pinned event ranked past the fetch limit silently drops out
      // (Angelo, Oct 25 — Halloween Bash was #16 in the response).
      const tb = todayBoundsMaine();
      const wb = weekendBoundsMaine();
      const [f, s, t, w] = await Promise.all([
        getEvents({ category: categoriesParam, featured: 'true', from: tb.from, lat, lng, radius_km: DESKTOP_RADIUS_KM, limit: '60' }),
        // Live events are STATEWIDE (Angelo, Oct 25): an event with
        // credited attendee photos shows in everyone's Featured, so
        // fetch today's events with an effectively unbounded radius
        // and merge the live ones into the featured pool below.
        getEvents({ category: categoriesParam, from: tb.from, to: tb.to, lat, lng, radius_km: '10000', limit: '200' }),
        getEvents({ category: categoriesParam, from: tb.from, to: tb.to, lat, lng, radius_km: DESKTOP_RADIUS_KM, limit: '50' }),
        getEvents({ category: categoriesParam, from: wb.from, to: wb.to, lat, lng, radius_km: DESKTOP_RADIUS_KM, limit: '50' }),
      ]);
      // Pinned events first (featured_pin order), then soonest first;
      // events already over (ends_at in the past) never appear — unless
      // pinned, and a pin holds only until pin_expires_at: the end of
      // the event's listing day, or ends_at + 2h for late-night events
      // (Angelo, Oct 25).
      const featuredNowMs = Date.now();
      // Still-live events first (credited photos, inside the LIVE-pill
      // window), then pins, then soonest (Angelo, Oct 25).
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
          // Distance tie-break, identical to mobile/native (Angelo, Oct 28).
          return (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity);
        })
        .slice(0, expand === 'featured' ? 18 : 6);
      trending = await getTrending(4);
      todayEvents = [...t.events].sort(
        (a, b) => +new Date(a.starts_at) - +new Date(b.starts_at),
      );
      const nowMs = Date.now();
      weekendEvents = w.events
        .filter((e) => +new Date(e.ends_at ?? e.starts_at) > nowMs)
        .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));
    }
  } catch (e) {
    apiError =
      'Could not reach the events service. Is the API running on ' +
      (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000') +
      '?';
  }

  const featuredSlugs = new Set(featured.map((e) => e.slug));
  const rest = events.filter((e) => !featuredSlugs.has(e.slug));

  // Chip order, same as mobile: normally the API order; the anchor chip
  // (?anchor, set by an event detail page's category link) is promoted
  // next to "All" and keeps that slot for the whole filtering session.
  const chipBase = {
    q,
    lat,
    lng,
    label,
    categories: categoriesParam,
    anchor: anchorSlug ?? undefined,
  };
  const orderedCategories = anchorSlug
    ? [
        ...categories.filter((c) => c.slug === anchorSlug),
        ...categories.filter((c) => c.slug !== anchorSlug),
      ]
    : categories;

  // Nearby list with the mobile day/month grouping: day headers with a
  // card grid under each day.
  const nearbyBlocks: ReactNode[] = [];
  if (browse) {
    let pending: typeof rest = [];
    const flush = (key: string) => {
      if (pending.length === 0) return;
      const cards = pending;
      pending = [];
      nearbyBlocks.push(
        <div className="grid" key={key}>
          {cards.map((e) => (
            <EventCard key={e.slug} event={e} heroPhoto />
          ))}
        </div>,
      );
    };
    for (const row of buildSectionedRows(sortByDayPartDistance(rest))) {
      if (row.kind === 'event') {
        pending.push(row.event);
        continue;
      }
      flush(`g-${row.key}`);
      nearbyBlocks.push(
        row.kind === 'month' ? (
          <h3 key={row.key} className="d-month-header">
            {row.label}
          </h3>
        ) : (
          <h4 key={row.key} className="d-day-header">
            {row.label}
          </h4>
        ),
      );
    }
    flush('g-end');
  }

  return (
    <div className="d-home">
      <DesktopHomeHeader label={label} searchInitial={q || ''} />
      <section className="d-hero">
        <div className="d-wrap">
          <h1>What&rsquo;s happening near you in Maine</h1>
          <p className="d-hero-sub">
            Discover concerts, comedy, sports, festivals and more.
          </p>
        </div>
      </section>

      <div className="d-wrap">
        <div className="d-filterrow" id="d-location">
          <Suspense>
            <LocationControls currentLabel={label} located={located} />
          </Suspense>
          {categories.length > 0 && (
            <div className="chips" aria-label="Filter by category">
              <Link
                href={chipHref(chipBase, { categories: null })}
                className={
                  'chip' + (selectedCategories.length === 0 ? ' chip-active' : '')
                }
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
                    href={chipHref(chipBase, {
                      categories:
                        next.length > 0 ? [...next].sort().join(',') : null,
                    })}
                    className={'chip' + (active ? ' chip-active' : '')}
                    title={c.tagline}
                  >
                    {c.name}
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {apiError ? (
          <div className="alert" role="alert">
            {apiError}
          </div>
        ) : browse ? (
          <div className="d-columns">
            <div className="d-main">
            {featured.length > 0 && (
              <section aria-label="Featured events">
                <DesktopSectionHeader
                  icon="/icons/icon-sparkle.png"
                  title="Featured Events"
                  subtitle="Handpicked happenings near you"
                  allHref={
                    expand !== 'featured' && featured.length >= 6
                      ? chipHref(chipBase, { expand: 'featured' })
                      : undefined
                  }
                  allLabel="View all featured events"
                />
                <div className="grid">
                  {featured.map((e) => (
                    <EventCard key={e.slug} event={e} heroPhoto />
                  ))}
                </div>
              </section>
            )}

            {todayEvents.length > 0 && (
              <section aria-label="Today's events">
                <DesktopSectionHeader
                  icon="/icons/icon-calendar-blue.png"
                  title="Today"
                  subtitle={maineFullDate()}
                  allHref={
                    expand !== 'today' && todayEvents.length > 6
                      ? chipHref(chipBase, { expand: 'today' })
                      : undefined
                  }
                  allLabel="View all today's events"
                />
                <div className="grid">
                  {(expand === 'today'
                    ? todayEvents
                    : todayEvents.slice(0, 6)
                  ).map((e) => (
                    <EventCard key={e.slug} event={e} dayLabel="Today" heroPhoto />
                  ))}
                </div>
              </section>
            )}

            {weekendEvents.length > 0 && (
              <section aria-label="This weekend's events">
                <DesktopSectionHeader
                  icon="/icons/icon-calendar-purple.png"
                  title={isNextWeekendMaine() ? 'Next Weekend' : 'This Weekend'}
                  subtitle={weekendRangeLabel(
                    weekendEvents.map((e) => e.starts_at),
                  )}
                />
                <div className="grid">
                  {weekendEvents.map((e) => (
                    <EventCard
                      key={e.slug}
                      event={e}
                      dayLabel={maineWeekday(e.starts_at)}
                      heroPhoto
                    />
                  ))}
                </div>
              </section>
            )}

            <section aria-label="Events">
              <DesktopSectionHeader
                icon="/icons/icon-nearby.png"
                title={`${located ? 'Nearby Events' : 'Upcoming'} (${total})`}
                subtitle={located ? 'Events closest to you' : undefined}
              />
              {rest.length === 0 ? (
                <p className="empty">
                  No events found. Try a different search, category, or
                  location.
                </p>
              ) : (
                nearbyBlocks
              )}
            </section>
            </div>
            {trending.length > 0 && (
              <aside className="d-side">
                <div className="d-trend">
                  <div className="d-trend-head">
                    <svg
                      className="d-trend-flame"
                      width="22"
                      height="22"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        d="M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z"
                        fill="#F2600C"
                      />
                    </svg>
                    <div>
                      <h3 className="d-trend-title">Trending this week</h3>
                      <p className="d-trend-sub">Popular with Joinaroo users</p>
                    </div>
                  </div>
                  <ol className="d-trend-list">
                    {trending.map((e, i) => (
                      <li key={e.slug}>
                        <Link
                          href={`/events/${e.slug}#hero`}
                          className="d-trend-row"
                        >
                          <span className="d-trend-num">{i + 1}</span>
                          {e.image_url && (
                            <img
                              className="d-trend-thumb"
                              src={e.image_url}
                              alt=""
                            />
                          )}
                          <span className="d-trend-name">{e.title}</span>
                          <img
                            className="d-trend-chev"
                            src="/icons/icon-chevron-blue.png"
                            alt=""
                          />
                        </Link>
                      </li>
                    ))}
                  </ol>
                </div>
              </aside>
            )}
          </div>
        ) : (
          <>
            {featured.length > 0 && (
              <section aria-label="Featured events">
                <h2 className="section-title">⭐ Featured</h2>
                <div className="spotlight">
                  {featured.map((e) => (
                    <EventCard key={e.slug} event={e} heroPhoto />
                  ))}
                </div>
              </section>
            )}

            <section aria-label="Events">
              <h2 className="section-title">
                {q || categoriesParam
                  ? `${total} result${total === 1 ? '' : 's'}`
                  : 'Upcoming events'}
                {located && (
                  <span className="section-sub"> · nearest first</span>
                )}
              </h2>
              {rest.length === 0 ? (
                <p className="empty">
                  No events found. Try a different search, category, or
                  location.
                </p>
              ) : (
                <div className="grid">
                  {rest.map((e) => (
                    <EventCard key={e.slug} event={e} heroPhoto />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
