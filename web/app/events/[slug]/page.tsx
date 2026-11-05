import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import LivePanel from '../../../components/LivePanel';
import LiveNearStrip, {
  type StripEvent,
} from '../../../components/LiveNearStrip';
import PersonMenu from '../../../components/PersonMenu';
import PhotoGallery from '../../../components/PhotoGallery';
import DetailsButton from '../../../components/DetailsButton';
import ListedByLink from '../../../components/ListedByLink';
import RecentPhotos from '../../../components/RecentPhotos';
import MoreGamesRail, {
  type MoreGameItem,
} from '../../../components/MoreGamesRail';
import ScorePanel from '../../../components/ScorePanel';
import GameSummary from '../../../components/GameSummary';
import { CommunityPickCard, CommunityBelow } from '../../../components/CommunityBlock';
import RoomProof from '../../../components/RoomProof';
import Peephole from '../../../components/Peephole';
import SaveStar from '../../../components/SaveStar';
import DesktopHomeHeader from '../../../components/DesktopHomeHeader';
import DesktopGame from '../../../components/DesktopGame';
import DesktopSave from '../../../components/DesktopSave';
import DesktopShare from '../../../components/DesktopShare';
import { venueBaseSlug } from '../../../lib/landing';
import MobileTabs from '../../../components/mobile/MobileTabs';
import { headers } from 'next/headers';
import {
  detailsButtonExpiresMs,
  isMobileUA,
  livePillExpiresMs,
  todayBoundsMaine,
} from '../../../lib/mobile';
import {
  EventItem,
  LivePerson,
  formatDateLong,
  formatTimeLong,
  getEvent,
  getEvents,
  mapsUrl,
  sameDayET,
} from '../../../lib/api';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const event = await getEvent(slug).catch(() => null);
  if (!event) return { title: 'Event not found' };
  const venueBits = event.venue
    ? ` at ${event.venue.name}, ${event.venue.city}`
    : '';
  const description = (
    event.description ||
    `${event.title}${venueBits} — ${formatDateLong(event.starts_at)}.`
  ).slice(0, 160);
  const pageUrl = `https://joinaroo.com/events/${event.slug}`;
  const image = event.image_url
    ? event.image_url.startsWith('/')
      ? `https://joinaroo.com${event.image_url}`
      : event.image_url
    : undefined;
  return {
    title: event.title,
    description,
    openGraph: {
      title: event.title,
      description,
      url: pageUrl,
      type: 'website',
      images: image ? [{ url: image }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: event.title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

/** "Austin Carlton" -> "Austin C." (mockup label for people at an event). */
// Chip labels for the single-word recurrence values (Angelo, Oct 25:
// "Repeats Annually", "Repeats Monthly"); phrase values render verbatim.
const RECURRENCE_LABEL: Record<string, string> = {
  annual: 'Annually',
  monthly: 'Monthly',
  weekly: 'Weekly',
  biweekly: 'Biweekly',
  '1st and 3rd Saturdays monthly': '1st & 3rd Saturday Monthly',
  '4th Thursday monthly': '4th Thursday Monthly',
};

function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return parts[0] || name;
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

const EVENT_STATUS_LD: Record<string, string> = {
  scheduled: 'https://schema.org/EventScheduled',
  cancelled: 'https://schema.org/EventCancelled',
  postponed: 'https://schema.org/EventPostponed',
};

/** updated_at arrives as a SQLite UTC string ("YYYY-MM-DD HH:MM:SS") or
 * ISO; normalize to ISO for JSON-LD dateModified. */
function isoFromDbTs(v?: string | null): string | undefined {
  if (!v) return undefined;
  const d = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v)
    ? new Date(`${v.replace(' ', 'T')}Z`)
    : new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Most specific Schema.org Event subtype the data honestly supports
 * (Angelo, Nov 4): category first, then high-precision title signals for
 * the mixed on-stage bucket (concerts, comedy, film, theater share it). */
function eventSchemaType(event: EventItem): string {
  const cat = event.category?.slug;
  const t = event.title.toLowerCase();
  if (cat === 'game-day') return 'SportsEvent';
  // High-precision title signals outrank category: the on-stage bucket
  // mixes concerts/comedy/film/theater, and stage productions often sit
  // in family-fun or seasonal (Maine State Ballet's Nutcracker does).
  if (/\b(comedy|comedian|comedians|stand-up|stand up|improv)\b/.test(t))
    return 'ComedyEvent';
  if (/\b(film|movie|screening|cinema|documentary)\b/.test(t))
    return 'ScreeningEvent';
  if (/\b(musical|opera|ballet|nutcracker)\b/.test(t)) return 'TheaterEvent';
  if (cat === 'taste-maine') return 'FoodEvent';
  if (cat === 'learn') return 'EducationEvent';
  if (cat === 'gallery') return 'ExhibitionEvent';
  if (/\bfestival\b|\bfest\b/.test(t)) return 'Festival';
  if (cat === 'seasonal' && /\bfair\b/.test(t)) return 'Festival';
  if (cat === 'on-stage') return 'MusicEvent';
  return 'Event';
}

/** First clean dollar figure in a free-text price ("$25", "$35.50",
 * "$20-$35" -> "20"); null when the text carries no parseable price, so
 * offers never publish a non-numeric price. */
function priceFromText(text?: string | null): string | null {
  if (!text) return null;
  const m = text.replace(/,/g, '').match(/\$\s*(\d+(?:\.\d{1,2})?)/);
  return m ? m[1] : null;
}

function jsonLd(event: EventItem) {
  const v = event.venue;
  const type = eventSchemaType(event);
  const pageUrl = `https://joinaroo.com/events/${event.slug}`;
  const price = event.cost_free ? '0' : priceFromText(event.cost_text);
  const availability = event.sold_out
    ? 'https://schema.org/SoldOut'
    : 'https://schema.org/InStock';
  // SportsEvent competitors come from the "X vs Y" title — the one
  // performer-class fact the data states outright. Act names are NOT
  // derived from titles (presents/tour/tribute titles lie), so music,
  // comedy and theater pages omit performer rather than guess.
  const vsParts =
    type === 'SportsEvent'
      ? event.title
          .split(/\s+vs\.?\s+/i)
          // "Boothbay — 8-Man Small South Final" -> "Boothbay": the
          // round/tournament suffix is not part of the team name.
          .map((s) => s.split(/\s+[—–]\s+/)[0].trim())
      : [];
  // Performer = the act as billed (Angelo, Nov 4): the title itself,
  // with a leading "X Presents ..." presenter prefix stripped. Stage
  // types only — sports carries competitor, festivals name the event,
  // not an act.
  const performerName = ['MusicEvent', 'ComedyEvent', 'TheaterEvent'].includes(
    type,
  )
    ? event.title.replace(/^[^:]{1,60}?\bpresents\b[:\s]+/i, '').trim()
    : '';
  return {
    '@context': 'https://schema.org',
    '@type': type,
    '@id': `${pageUrl}#event`,
    name: event.title,
    description: event.description || undefined,
    image: event.image_url
      ? [
          event.image_url.startsWith('/')
            ? `https://joinaroo.com${event.image_url}`
            : event.image_url,
        ]
      : undefined,
    startDate: event.starts_at,
    endDate: event.ends_at || undefined,
    eventStatus:
      EVENT_STATUS_LD[event.status || 'scheduled'] ||
      EVENT_STATUS_LD.scheduled,
    dateModified: isoFromDbTs(event.updated_at),
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: v
      ? {
          '@type': 'Place',
          name: v.name,
          address: {
            '@type': 'PostalAddress',
            streetAddress: v.address || undefined,
            addressLocality: v.city,
            addressRegion: 'ME',
            addressCountry: 'US',
          },
          geo:
            v.lat != null && v.lng != null
              ? {
                  '@type': 'GeoCoordinates',
                  latitude: v.lat,
                  longitude: v.lng,
                }
              : undefined,
        }
      : undefined,
    competitor:
      vsParts.length === 2
        ? vsParts.map((name) => ({ '@type': 'SportsTeam', name }))
        : undefined,
    performer: performerName
      ? { '@type': 'PerformingGroup', name: performerName }
      : undefined,
    offers:
      price || event.url
        ? {
            '@type': 'Offer',
            url: event.url || pageUrl,
            price: price || undefined,
            priceCurrency: 'USD',
            availability,
            description:
              !price && event.cost_text ? event.cost_text : undefined,
          }
        : undefined,
    url: pageUrl,
    organizer: event.source
      ? { '@type': 'Organization', name: event.source }
      : undefined,
  };
}

export default async function EventPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const event = await getEvent(slug).catch(() => null);
  if (!event) notFound();

  const ua = (await headers()).get('user-agent') || '';
  const mobile = isMobileUA(ua);

  const cost = event.sold_out
    ? 'Sold out'
    : event.cost_free
      ? 'Free'
      : event.cost_text || 'See details';

  // Live listing: the event has credited photos from people there.
  const livePeople = event.live_people ?? [];
  const isLive = livePeople.length > 0;
  // Events with photos (their own, or pooled recent-photos) render the
  // facts below the photos section instead of under the title (Oct 31).
  const hasPhotos = (event.photo_count ?? 0) > 0 || !!event.recent_photos;
  // Angelo (Oct 25): the panel lists everyone — no "+N more" tile.
  // Angelo (Oct 25): once the live window closes (the same instant the
  // LIVE pill comes off), the panel flips to its ended form — "Event
  // ended / People who attended" — per his mockup.
  const liveEnded = isLive && Date.now() >= livePillExpiresMs(event);
  // "Live Events Near You Right Now" strip (Angelo's mockup, Oct 25):
  // above the hero, list today's other events that carry credited
  // attendee photos — still live first, then nearest to this event's
  // venue. Shows on live pages too (Angelo, Oct 25 evening).
  const isLiveNow = isLive && !liveEnded;
  let stripEvents: StripEvent[] = [];
  // Strip subtitle names the platforms the listed people actually came
  // from (Angelo, Oct 25): one platform -> "People from Instagram are
  // out and about at these events!"; a mix -> "People from Instagram
  // and Facebook are at these events!".
  let stripSub = 'People from Instagram are out and about at these events!';
  // Angelo (Oct 25, evening): the strip shows on EVERY event page,
  // including one that is itself live — only the page's own event is
  // excluded from the cards.
  {
    try {
      const bounds = todayBoundsMaine();
      const { events: todays } = await getEvents({
        from: bounds.from,
        to: bounds.to,
        limit: '200',
      });
      const havMi = (
        a: { lat?: number | null; lng?: number | null },
        b: { lat?: number | null; lng?: number | null },
      ): number | null => {
        if (a.lat == null || a.lng == null || b.lat == null || b.lng == null)
          return null;
        const rad = (d: number) => (d * Math.PI) / 180;
        const dLat = rad(b.lat - a.lat);
        const dLng = rad(b.lng - a.lng);
        const h =
          Math.sin(dLat / 2) ** 2 +
          Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
        return 3959 * 2 * Math.asin(Math.sqrt(h));
      };
      const candidates = todays.filter(
        (e) => e.id !== event.id && (e.live_people?.length ?? 0) > 0,
      );
      const plats = new Set(
        candidates.flatMap((e) =>
          (e.live_people ?? [])
            .map((p) => p.platform)
            .filter(Boolean),
        ) as string[],
      );
      const platName = (pl: string) =>
        pl === 'facebook' ? 'Facebook' : pl === 'x' ? 'X' : 'Instagram';
      const orderedPlats = ['instagram', 'facebook', 'x']
        .filter((pl) => plats.has(pl))
        .map(platName);
      if (orderedPlats.length === 1) {
        stripSub = `People from ${orderedPlats[0]} are out and about at these events!`;
      } else if (orderedPlats.length >= 2) {
        stripSub = `People from ${orderedPlats.slice(0, -1).join(', ')}${orderedPlats.length > 2 ? ',' : ''} and ${orderedPlats[orderedPlats.length - 1]} are at these events!`;
      }
      stripEvents = candidates
        .map((e) => {
          const people = e.live_people ?? [];
          return {
            slug: e.slug,
            title: e.title,
            img: e.live_photo_url ?? e.image_url ?? null,
            focusTop: e.strip_focus === 'top',
            stillLive: Date.now() < livePillExpiresMs(e),
            pillExp: livePillExpiresMs(e),
            count: people.length,
            photoCount: e.photo_count ?? 0,
            // Angelo (Oct 25, later): strip avatars match the main-page
            // cards — at most 5 shown, the rest in a "+N" tile.
            avatars: people.slice(0, 5).map((p) => ({
              url: p.avatar_url ?? null,
              initials: initialsOf(p.name),
              name: p.name,
            })),
            extra: Math.max(0, people.length - 5),
            venueLine: e.venue
              ? `${e.venue.name} · ${e.venue.city}`
              : '',
            distMi: havMi(event.venue ?? {}, e.venue ?? {}),
          };
        })
        .sort(
          (a, b) =>
            Number(b.stillLive) - Number(a.stillLive) ||
            // Live order (Angelo, Oct 25): most people, then longest
            // remaining live status, then nearest.
            b.count - a.count ||
            (b.pillExp ?? 0) - (a.pillExp ?? 0) ||
            (a.distMi ?? 1e9) - (b.distMi ?? 1e9),
        )
        .slice(0, 10);
    } catch {
      stripEvents = [];
    }
  }
  const tookPlaceStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(event.starts_at));
  // Panel links open a DM with the person: Instagram's ig.me/m/<handle>
  // lands straight in the message thread; Facebook's thread URL opens
  // the conversation on facebook.com (username parsed from a profile
  // post URL). Anything else falls back to the source post.
  const personHref = (p: LivePerson) => {
    if (p.platform === 'instagram' && p.handle)
      return `https://ig.me/m/${p.handle}`;
    if (p.platform === 'facebook') {
      if (p.handle) return `https://www.facebook.com/messages/t/${p.handle}`;
      if (p.post_url) {
        const m = p.post_url.match(/facebook\.com\/([^/]+)\/posts\//);
        if (m) return `https://www.facebook.com/messages/t/${m[1]}`;
      }
    }
    return p.post_url;
  };
  // Shared props for the per-person submenu (ended panel ⋮ + live panel
  // avatar tap, Angelo Oct 25): profile / post / DM-message targets.
  const personMenuProps = (p: LivePerson) => {
    const href = personHref(p);
    return {
      platform: p.platform ?? null,
      platformLabel:
        p.platform === 'facebook'
          ? 'Facebook'
          : p.platform === 'x'
            ? 'X'
            : 'Instagram',
      profileUrl:
        p.handle && p.platform === 'instagram'
          ? `https://www.instagram.com/${p.handle}`
          : p.handle && p.platform === 'facebook'
            ? `https://www.facebook.com/${p.handle}`
            : p.handle && p.platform === 'x'
              ? `https://x.com/${p.handle}`
              : null,
      postUrl: p.post_url ?? null,
      messageUrl: href && href !== p.post_url ? href : null,
    };
  };

  // Panel sub-line names every platform the people actually came from
  // (Angelo, Nov 2: the Pumpkin Ball panel read "Instagram" while one of
  // its five people was a Facebook poster — the label was built from the
  // first person only). Same composition as the strip sub above.
  const livePlatformLabel = (() => {
    const plats = new Set(
      livePeople.map((p) => p.platform).filter(Boolean),
    ) as Set<string>;
    const names = ['instagram', 'facebook', 'x']
      .filter((pl) => plats.has(pl))
      .map((pl) =>
        pl === 'facebook' ? 'Facebook' : pl === 'x' ? 'X' : 'Instagram',
      );
    if (names.length <= 1) return names[0] ?? 'Instagram';
    return `${names.slice(0, -1).join(', ')}${names.length > 2 ? ',' : ''} and ${names[names.length - 1]}`;
  })();
  const livePanelPeople = livePeople.map((p) => ({
    name: p.name,
    short: shortName(p.name),
    initials: initialsOf(p.name),
    avatarUrl: p.avatar_url ?? null,
    href: personHref(p) ?? null,
    ...personMenuProps(p),
  }));

  // Live-score panel (Angelo, Oct 27): a tracked game shows its running
  // score here, then the final. Additive — renders in every branch.
  const scoreEl =
    event.live_score &&
    event.live_score.status !== 'scheduled' &&
    event.live_score.home_score != null &&
    event.live_score.away_score != null ? (
      event.game_summary ? (
        <GameSummary
          score={event.live_score}
          summary={event.game_summary}
          startsAt={event.starts_at}
        />
      ) : (
        <ScorePanel score={event.live_score} />
      )
    ) : null;

  const descriptionEl = event.description ? (
    <div className="event-description">
      {event.description.split(/\n\n+/).map((para, i) => (
        <p key={i}>{para}</p>
      ))}
    </div>
  ) : null;

  // Sold-out panel (Angelo, Oct 29, from his listing mockup): sits in the
  // score-panel slot under the title; the COST row reads "Sold out" and
  // the tickets button becomes a gray SOLD OUT button (same expiry rule).
  const soldOutPanel = event.sold_out ? (
    <section className="soldout-panel" aria-label="Sold out">
      <img src="/icons/soldout-ticket.png" alt="" className="soldout-panel-icon" />
      <div className="soldout-panel-text">
        <span className="soldout-panel-title">SOLD OUT</span>
        <span className="soldout-panel-sub">
          Tickets for this event are no longer available.
        </span>
      </div>
    </section>
  ) : null;

  // Cancelled/postponed events keep their page and banner but lose the
  // tickets CTA — there is nothing to buy or attend on the listed date.
  const actionsEl =
    event.status === 'cancelled' || event.status === 'postponed' ? null : (
    <div className="event-actions">
      {event.sold_out ? (
        Date.now() < detailsButtonExpiresMs(event) && (
          <span className="btn btn-soldout" aria-disabled="true">
            <img src="/icons/soldout-ticket-white.png" alt="" className="btn-icon" />
            SOLD OUT
          </span>
        )
      ) : (
        event.url && Date.now() < detailsButtonExpiresMs(event) && (
        <DetailsButton href={event.url} page={`/events/${event.slug}`}>
          <img src="/icons/icon-external-white.png" alt="" className="btn-icon" />
          {event.cost_free ? 'More Event Details' : 'More Event Details and Tickets'}
          <img src="/icons/icon-arrow-white.png" alt="" className="btn-icon btn-arrow" />
        </DetailsButton>
        )
      )}
    </div>
  );

  // Visible freshness stamp (Angelo, Nov 4): the brief asks for a
  // human-readable "Last updated" on the page, from updated_at.
  const updatedDate = event.updated_at
    ? new Date(
        /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(event.updated_at)
          ? `${event.updated_at.replace(' ', 'T')}Z`
          : event.updated_at,
      )
    : null;
  const updatedLabel =
    updatedDate && !Number.isNaN(updatedDate.getTime())
      ? `${new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'long', day: 'numeric', year: 'numeric' }).format(updatedDate)} · ${new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }).format(updatedDate)}`
      : null;

  // Verification stamp (Angelo, Nov 5): when the listing was last
  // checked against its source — "(verified today)" when the check was
  // today (ET), otherwise "(last verified on <date>)".
  const verifiedDate = event.verified_at
    ? new Date(
        /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(event.verified_at)
          ? `${event.verified_at.replace(' ', 'T')}Z`
          : event.verified_at,
      )
    : null;
  const etDay = (d: Date) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    }).format(d);
  const verifiedNote =
    verifiedDate && !Number.isNaN(verifiedDate.getTime())
      ? etDay(verifiedDate) === etDay(new Date())
        ? '(verified today)'
        : `(last verified on ${new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'long', day: 'numeric', year: 'numeric' }).format(verifiedDate)})`
      : null;

  // Status banner (Angelo, Nov 4): a cancelled/postponed event keeps its
  // page with the change stated above the title — same gray panel
  // language as the ended banner — instead of vanishing.
  const statusBanner =
    event.status === 'cancelled' || event.status === 'postponed' ? (
      <div className="ended-banner">
        <div className="ended-head">
          <span className="ended-clock">
            <img src="/icons/icon-clock.png" alt="" />
          </span>
          <span className="ended-head-text">
            <span className="ended-title">
              {event.status === 'cancelled'
                ? 'Event cancelled'
                : 'Event postponed'}
            </span>
            <span className="ended-sub">
              {event.status === 'cancelled'
                ? 'This event has been cancelled. The listing stays up so the change is on the record.'
                : 'This event has been postponed. The new date will be posted here when the organizer announces it.'}
            </span>
          </span>
        </div>
      </div>
    ) : null;

  // Next-occurrence pointer (Angelo, Nov 5): once this event is past
  // (the same midnight line that removes the details button), point at
  // the series' next upcoming occurrence when the API found one.
  const nextOcc = event.next_occurrence ?? null;
  const nextOccEl =
    nextOcc && Date.now() >= detailsButtonExpiresMs(event) ? (
      <Link className="next-occ" href={`/events/${nextOcc.slug}`}>
        <span className="next-occ-label">Next occurrence</span>
        <span className="next-occ-date">
          {formatDateLong(nextOcc.starts_at)}
        </span>
        <span className="next-occ-arrow" aria-hidden="true">
          →
        </span>
      </Link>
    ) : null;

  // Event facts (WHEN / WHERE / COST / LISTED BY). Rendered under the
  // title when the event has no photos, and below the photos section
  // when it has photos (Angelo, Oct 31, 2026).
  const factsEl = (
    <dl className="event-facts">
      <div className="fact-row">
        <img src="/icons/icon-calendar.png" alt="" className="fact-icon" />
        <div className="fact-content">
          <dt>When</dt>
          <dd>
            <time dateTime={event.starts_at}>
              {formatDateLong(event.starts_at)}
            </time>
            {event.ends_at && (
              <>
                {' '}
                –{' '}
                <time dateTime={event.ends_at}>
                  {sameDayET(event.starts_at, event.ends_at)
                    ? formatTimeLong(event.ends_at)
                    : formatDateLong(event.ends_at)}
                </time>
              </>
            )}
          </dd>
        </div>
      </div>
      {event.venue && (
        <div className="fact-row">
          <img src="/icons/icon-pin-outline.png" alt="" className="fact-icon" />
          <div className="fact-content">
            <dt>Where</dt>
            <dd>
              {event.venue.name}
              <br />
              {[event.venue.address, event.venue.city, 'ME']
                .filter(Boolean)
                .join(', ')}
              <br />
              <a
                href={mapsUrl(event)}
                target="_blank"
                rel="noopener noreferrer"
                className="fact-map-link"
              >
                View on map <img src="/icons/icon-arrow-right.png" alt="" className="inline-icon" />
              </a>
            </dd>
          </div>
        </div>
      )}
      <div className="fact-row">
        <img src="/icons/icon-ticket.png" alt="" className="fact-icon" />
        <div className="fact-content">
          <dt>Cost</dt>
          <dd>{cost}</dd>
        </div>
      </div>
      {event.source && (
        <div className="fact-row">
          <img src="/icons/icon-people.png" alt="" className="fact-icon" />
          <div className="fact-content">
            <dt>Listed by</dt>
            <dd>
              {event.url ? (
                <ListedByLink href={event.url} page={`/events/${event.slug}`}>
                  {event.source}
                </ListedByLink>
              ) : (
                event.source
              )}
            </dd>
          </div>
        </div>
      )}
      {updatedLabel && (
        <div className="fact-row">
          <img src="/icons/icon-hourglass.png" alt="" className="fact-icon" />
          <div className="fact-content">
            <dt>Last updated</dt>
            <dd>
              {updatedLabel}
              {verifiedNote ? ` ${verifiedNote}` : ''}
            </dd>
          </div>
        </div>
      )}
    </dl>
  );

  const livePanelEl = isLive && liveEnded ? (
    <section className="ended-panel" aria-label="People who attended this event">
      <div className="ended-people-head">
        <img
          src="/icons/icon-people-gray.png"
          alt=""
          className="ended-people-icon"
        />
        <span>People who attended ({livePeople.length})</span>
      </div>
      <div className="ended-people">
        {livePeople.map((p, i) => {
          const href = personHref(p);
          // Avatar tap opens the same PersonMenu as the live panel
          // (Angelo, Oct 25); the name keeps the message link, same as
          // the live listing.
          const avatarBlock = (
            <span className="ended-avatarwrap">
              {p.avatar_url ? (
                <img
                  className="ended-avatar"
                  src={p.avatar_url}
                  alt={p.name}
                />
              ) : (
                <span className="ended-avatar ended-initials">
                  {initialsOf(p.name)}
                </span>
              )}
              <img
                className="ended-check"
                src="/icons/icon-check-green.png"
                alt=""
              />
            </span>
          );
          const textBlock = (
            <span className="ended-person-text">
              <span className="ended-name">{shortName(p.name)}</span>
              <span className="ended-status">Checked in • Attended</span>
            </span>
          );
          return (
            <div className="ended-person" key={i}>
              <PersonMenu
                {...personMenuProps(p)}
                align="left"
                triggerClassName="person-menu-trigger ended-avatar-trigger"
                ariaLabel={`Actions for ${p.name}`}
              >
                {avatarBlock}
              </PersonMenu>
              {href ? (
                <a
                  className="ended-person-main"
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {textBlock}
                </a>
              ) : (
                <span className="ended-person-main">{textBlock}</span>
              )}
              {href && (
                <a
                  className="ended-msg"
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <img src="/icons/icon-chat.png" alt="" />
                  Message
                </a>
              )}
              <PersonMenu {...personMenuProps(p)} />
            </div>
          );
        })}
      </div>
    </section>
  ) : isLive ? (
    <LivePanel people={livePanelPeople} platformLabel={livePlatformLabel} />
  ) : null;

  // Games rail (Angelo's mockup, Oct 28; statewide on every listing
  // page, Oct 29): the latest scored games first (newest first), then
  // upcoming games soonest first, distances from this event's venue.
  // The page's own event is excluded from its own rail.
  let moreGames: MoreGameItem[] = [];
  {
    try {
      const bounds = todayBoundsMaine();
      const fromIso = new Date(
        new Date(bounds.from).getTime() - 2 * 86400000,
      ).toISOString();
      const { events: gamesRaw } = await getEvents({
        category: 'game-day',
        from: fromIso,
        limit: '60',
      });
      // Participant foot-races (5Ks, fun runs, trail runs) sit in the
      // game-day category but stay off the sports rail (Angelo,
      // Oct 30). Spectator sports only here; the category browse
      // still lists them.
      const RACE_TITLE =
        /\b(\d+\s?k|\d+-miler|marathon|triathlon|duathlon|fun run|road race|trail run|turkey trot|color run|run and walk|run\/walk|hustle)\b/i;
      const games = gamesRaw.filter((e) => !RACE_TITLE.test(e.title));
      const havMi = (
        a: { lat?: number | null; lng?: number | null },
        b: { lat?: number | null; lng?: number | null },
      ): number | null => {
        if (a?.lat == null || a?.lng == null || b?.lat == null || b?.lng == null)
          return null;
        const rad = (d: number) => (d * Math.PI) / 180;
        const dLat = rad(b.lat - a.lat);
        const dLng = rad(b.lng - a.lng);
        const h =
          Math.sin(dLat / 2) ** 2 +
          Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
        return 3959 * 2 * Math.asin(Math.sqrt(h));
      };
      // Rail membership (Angelo, Oct 30): games with a final score,
      // plus upcoming head-to-head matchups that will have a final
      // score (the tracked team games). Non-matchup listings — races,
      // tournaments, harness racing — never produce a final here and
      // stay off.
      const isScored = (e: (typeof games)[number]) =>
        e.live_score &&
        e.live_score.status === 'final' &&
        e.live_score.home_score != null;
      const MATCHUP_TITLE = /\bvs\.?\b|\bat\b/i;
      // Angelo's rail lifecycle (Oct 28): a scored game leads the rail
      // on its game day ("Today") and the day after ("Yesterday"), and
      // drops off at the midnight ending that second day.
      const dayNum = (x: Date) => {
        const parts = new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/New_York',
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
        }).formatToParts(x);
        const get = (t: string) =>
          Number(parts.find((p) => p.type === t)?.value ?? 0);
        return Date.UTC(get('year'), get('month') - 1, get('day')) / 86400000;
      };
      const todayNum = dayNum(new Date());
      // Scored games lead, newest game first (Angelo, Oct 29). A
      // scored card displays on its game day ("Today") and the day
      // after ("Yesterday"), and drops off at the next midnight.
      const scored = games
        .filter(isScored)
        .filter((e) => {
          const age = todayNum - dayNum(new Date(e.starts_at));
          return age >= 0 && age <= 1;
        })
        .sort((a, b) => +new Date(b.starts_at) - +new Date(a.starts_at));
      const upcoming = games
        .filter((e) => !isScored(e))
        .filter((e) => MATCHUP_TITLE.test(e.title))
        .filter((e) => +new Date(e.starts_at) >= Date.now() - 4.5 * 3600000)
        .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));
      moreGames = [...scored, ...upcoming]
        .filter((e) => Number(e.id) !== Number(event.id))
        .slice(0, 10)
        .map((e) => ({
          event: e,
          distanceMi: event.venue ? havMi(event.venue, e.venue ?? {}) : null,
        }));
    } catch {
      moreGames = [];
    }
  }

  // Desktop sidebar (Angelo's detail mockup, Nov 4): other upcoming
  // events at this event's venue — real API data, soonest first, the
  // page's own event excluded. Rendered only in the desktop sidebar
  // (.d-sidebar is display:none below desktop widths).
  let venueEvents: EventItem[] = [];
  if (event.venue) {
    try {
      const vb = todayBoundsMaine();
      const { events: atVenue } = await getEvents({
        venue: String(event.venue.id),
        from: vb.from,
        limit: '12',
      });
      venueEvents = atVenue
        .filter((e) => Number(e.id) !== Number(event.id))
        .slice(0, 3);
    } catch {
      venueEvents = [];
    }
  }
  const relDate = (iso: string) =>
    `${new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' }).format(new Date(iso))}, ${new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' }).format(new Date(iso))} · ${new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))}`;
  // Desktop info-column fact lines (mockup format): date on its own
  // line, then the time range with the zone named once.
  const dDateLine = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(event.starts_at));
  const dTimeLine = event.ends_at
    ? sameDayET(event.starts_at, event.ends_at)
      ? `${formatTimeLong(event.starts_at).replace(/\s*[A-Z]{2,5}$/, '')} – ${formatTimeLong(event.ends_at)}`
      : `${formatTimeLong(event.starts_at)} – ${formatDateLong(event.ends_at)}`
    : formatTimeLong(event.starts_at);

  // Desktop GAME variant (Spark game spec, Nov 4): an event carrying
  // game data — a game_summary, or a live/final tracked score — gets
  // the two-column game layout (664px main + 520px rail) at desktop
  // widths instead of the concert layout. The block is display:none
  // below 901px and the standard pieces stay in the DOM for mobile,
  // so the frozen mobile page is untouched.
  const hasPlayScore =
    !!event.live_score &&
    event.live_score.status !== 'scheduled' &&
    event.live_score.home_score != null &&
    event.live_score.away_score != null;
  const isGame = !!event.game_summary || hasPlayScore;
  const gameState: 'final' | 'live' | 'upcoming' =
    hasPlayScore && event.live_score?.status === 'final'
      ? 'final'
      : hasPlayScore
        ? 'live'
        : 'upcoming';
  const hasRealCost = !!(event.cost_free || event.cost_text || event.sold_out);
  // Preserved modules, built once and mirrored into the game layout
  // (the standard flow keeps its own copies for mobile).
  const peepholeEl =
    event.peephole && Date.now() < detailsButtonExpiresMs(event) ? (
      <Peephole data={event.peephole} />
    ) : null;
  const roomProofEl = event.room_proof ? (
    <RoomProof data={event.room_proof} />
  ) : null;
  const recentPhotosEl = event.recent_photos ? (
    <RecentPhotos
      data={event.recent_photos}
      eventId={Number(event.id)}
      slug={event.slug}
    />
  ) : null;

  return (
    <>
    {/* Desktop detail header (Angelo's detail mockup, Nov 4): the same
        DesktopHomeHeader the homepage uses, in a wrapper that only
        exists at desktop widths (.d-detail-headwrap is display:none
        below 901px, where the shared site header stays in charge). */}
    <div className="d-detail-headwrap">
      <DesktopHomeHeader
        label={event.venue ? `${event.venue.city}, ME` : 'Portland, ME'}
      />
    </div>
    <div className={`container container-live d-detail${isGame ? ' d-detail-game' : ''}`}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(event)) }}
      />

      {moreGames.length > 0 && <MoreGamesRail items={moreGames} />}

      <div className="d-detail-grid">
      <article
        className="event-detail event-detail-live"
      >
        {/* Desktop GAME layout (Spark game spec, Nov 4): rendered
            only for game-data events; .d-game is display:none below
            901px, and at desktop widths the .d-detail-game rules
            hide every other article child plus the concert sidebar,
            so this block owns the desktop game page. */}
        {isGame && (
          <DesktopGame
            event={event}
            state={gameState}
            cost={cost}
            hasRealCost={hasRealCost}
            updatedLabel={updatedLabel}
            statusBanner={statusBanner}
            soldOutPanel={soldOutPanel}
            livePanelEl={livePanelEl}
            peepholeEl={peepholeEl}
            roomProofEl={roomProofEl}
            recentPhotosEl={recentPhotosEl}
          />
        )}
        {/* Desktop top zone (Angelo's detail mockup, Nov 4): hero poster
            card + info column, built from the same event data as the
            standard flow below. .d-top is display:none below 901px;
            at desktop widths the originals it mirrors (hero, tags,
            title, facts, actions) are hidden by CSS and everything
            after them keeps flowing in the main column. The hero is
            the event's ORIGINAL image_url — never sheet art. */}
        <div className="d-top">
          <div className="d-top-hero">
            {event.image_url ? (
              <img
                src={event.image_url}
                alt={event.title}
                className="d-top-img"
              />
            ) : (
              <div className="d-top-img d-top-img-empty" aria-hidden="true" />
            )}
            {isLive && Date.now() < livePillExpiresMs(event) && (
              <img
                src="/icons/icon-live-hero.png"
                alt="Live"
                className="live-hero-badge"
              />
            )}
            {event.sold_out && (
              <span
                className="card-soldout-ribbonwrap card-soldout-ribbonwrap--detail"
                aria-hidden="true"
              >
                <img src="/icons/soldout-ribbon.png" alt="" />
              </span>
            )}
            {(event.photo_count ?? 0) > 0 && (
              <a href="#photos" className="hero-photos-pill">
                <img
                  src="/icons/icon-image.png"
                  alt=""
                  className="hero-photos-icon"
                />
                View all photos ({event.photo_count})
              </a>
            )}
          </div>
          <div className="d-top-info">
            <div className="d-top-chips">
              <Link className={`tag tag-${event.category.slug}`} href={`/?category=${event.category.slug}&categories=${event.category.slug}&anchor=${event.category.slug}`}>{event.category.name}</Link>
              {event.featured && <Link className="featured-badge" href="/">Featured</Link>}
              {event.recurrence && (
                <span className="recurrence-badge">
                  Repeats {RECURRENCE_LABEL[event.recurrence] ?? event.recurrence}
                </span>
              )}
              {event.community && (
                <img
                  className="card-community-pick d-top-cp"
                  src="/icons/community-pick.png"
                  alt="Community Pick — r/portlandme recommends"
                  width={156}
                  height={32}
                />
              )}
              {/* Spec round 2: a real share control at the right of
                  the chips row (navigator.share / clipboard). The
                  spec's bookmark icon is omitted — it would duplicate
                  the hero heart + saves button. */}
              <span className="d-top-chips-right">
                <DesktopShare
                  title={event.title}
                  url={`/events/${event.slug}`}
                />
              </span>
            </div>
            <h1 className="d-top-h1">{event.title}</h1>
            <div className="d-top-facts">
              <div className="d-top-fact">
                <span className="d-top-fact-ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg></span>
                <span>{dDateLine}</span>
              </div>
              <div className="d-top-fact">
                <span className="d-top-fact-ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg></span>
                <span>{dTimeLine}</span>
              </div>
              {event.venue && (
                <div className="d-top-fact">
                  <span className="d-top-fact-ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21.5s-7.5-8-7.5-13a7.5 7.5 0 0 1 15 0c0 5-7.5 13-7.5 13z" /><circle cx="12" cy="8.8" r="2.6" /></svg></span>
                  <span>
                    <Link
                      className="d-top-venue-link"
                      href={`/venues/${venueBaseSlug(event.venue.name, event.venue.city)}`}
                    >
                      {event.venue.name}
                    </Link>
                    <span className="d-top-fact-sub">
                      {[event.venue.address, event.venue.city, 'ME']
                        .filter(Boolean)
                        .join(', ')}
                    </span>
                  </span>
                </div>
              )}
              <div className="d-top-fact">
                <span className="d-top-fact-ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M4 7h16v3.2a2.3 2.3 0 0 0 0 4.6V18H4v-3.2a2.3 2.3 0 0 0 0-4.6V7z" /><path d="M13.5 7v1.8M13.5 11.1v1.8M13.5 15.2V18" strokeDasharray="0.1 3" /></svg></span>
                <span>{cost}</span>
              </div>
              {event.source && (
                <div className="d-top-fact d-top-fact-muted">
                  <span className="d-top-fact-ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="9" cy="8" r="3.4" /><path d="M3.4 19.4c.6-3.2 2.8-4.9 5.6-4.9s5 1.7 5.6 4.9" /><path d="M15.5 5.4a3.4 3.4 0 0 1 0 6.1M17.8 14.9c1.6.6 2.6 2 3 4.5" /></svg></span>
                  <span>
                    Listed by{' '}
                    {event.url ? (
                      <ListedByLink href={event.url} page={`/events/${event.slug}`}>
                        {event.source}
                      </ListedByLink>
                    ) : (
                      event.source
                    )}
                  </span>
                </div>
              )}
              {updatedLabel && (
                <div className="d-top-fact d-top-fact-muted">
                  <span className="d-top-fact-ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg></span>
                  <span>
                    Last updated {updatedLabel}
                    {verifiedNote ? ` ${verifiedNote}` : ''}
                  </span>
                </div>
              )}
            </div>
            <div className="d-top-actions">
              {event.status !== 'cancelled' &&
                event.status !== 'postponed' &&
                (event.sold_out ? (
                  Date.now() < detailsButtonExpiresMs(event) && (
                    <span className="btn btn-soldout d-top-cta" aria-disabled="true">
                      <img src="/icons/soldout-ticket-white.png" alt="" className="btn-icon" />
                      SOLD OUT
                    </span>
                  )
                ) : (
                  event.url &&
                  Date.now() < detailsButtonExpiresMs(event) && (
                    <DetailsButton href={event.url} page={`/events/${event.slug}`}>
                      <img src="/icons/icon-external-white.png" alt="" className="btn-icon" />
                      {event.cost_free ? 'More Event Details' : 'More Event Details and Tickets'}
                      <img src="/icons/icon-arrow-white.png" alt="" className="btn-icon btn-arrow" />
                    </DetailsButton>
                  )
                ))}
              <DesktopSave slug={event.slug} eventId={Number(event.id)} />
            </div>
          </div>
        </div>
        {stripEvents.length > 0 && (
          <LiveNearStrip events={stripEvents} subText={stripSub} />
        )}
        {event.image_url &&
          (isLive ? (
            <div className="event-hero-wrap" id="hero">
              <img
                src={event.image_url}
                alt={event.title}
                className="event-hero event-hero-inwrap"
              />
              {Date.now() < livePillExpiresMs(event) && (
                <img
                  src="/icons/icon-live-hero.png"
                  alt="Live"
                  className="live-hero-badge"
                />
              )}
              {(event.photo_count ?? 0) > 0 && (
                <a href="#photos" className="hero-photos-pill">
                  <img
                    src="/icons/icon-image.png"
                    alt=""
                    className="hero-photos-icon"
                  />
                  View all photos ({event.photo_count})
                </a>
              )}
            </div>
          ) : event.sold_out ? (
            <div className="event-hero-wrap" id="hero">
              <img
                src={event.image_url}
                alt={event.title}
                className="event-hero event-hero-inwrap"
              />
              <span
                className="card-soldout-ribbonwrap card-soldout-ribbonwrap--detail"
                aria-hidden="true"
              >
                <img src="/icons/soldout-ribbon.png" alt="" />
              </span>
            </div>
          ) : (
            <img src={event.image_url} alt={event.title} className="event-hero" id="hero" />
          ))}
        <div className="card-tags">
          <Link className={`tag tag-${event.category.slug}`} href={`/?category=${event.category.slug}&categories=${event.category.slug}&anchor=${event.category.slug}`}>{event.category.name}</Link>
          {event.featured && <Link className="featured-badge" href="/">Featured</Link>}
          {event.recurrence && (
            <span className="recurrence-badge">
              Repeats {RECURRENCE_LABEL[event.recurrence] ?? event.recurrence}
            </span>
          )}
          <SaveStar slug={event.slug} eventId={Number(event.id)} bare />
        </div>
        {event.community && (
          <div className="detail-community-pick">
            <img src="/icons/cb-reddit.png" alt="" />
            <span className="dcp-name">COMMUNITY PICK</span>
            <span className="dcp-sub">&middot; r/portlandme</span>
          </div>
        )}
        {statusBanner}
        {/* Angelo (Nov 5): the ended banner shows for every event past
            its live-pill expiry, not only ones that had check-ins. */}
        {Date.now() >= livePillExpiresMs(event) && (
          <div className="ended-banner">
            <div className="ended-head">
              <span className="ended-clock">
                <img src="/icons/icon-clock.png" alt="" />
              </span>
              <span className="ended-head-text">
                <span className="ended-title">Event ended</span>
                <span className="ended-sub">
                  This event took place on {tookPlaceStr}
                </span>
              </span>
            </div>
          </div>
        )}
        {nextOccEl}
        <h1>{event.title}</h1>

        {soldOutPanel}
        {scoreEl}

        {/* Facts sit in their usual spot only when the event has no photos;
            with photos they move below the photos section (Angelo, Oct 31). */}
        {!hasPhotos && factsEl}
        {!hasPhotos && event.community && (
          <CommunityPickCard data={event.community} />
        )}

        {isLive ? (
          <>
            <PhotoGallery
              slug={event.slug}
              recurrence={event.recurrence}
              variant="live"
            />
            {livePanelEl}
            {factsEl}
            {event.community && (
              <CommunityPickCard data={event.community} />
            )}
            {descriptionEl}
            {actionsEl}
            {event.community && (
              <CommunityBelow data={event.community} />
            )}
            {/* The Peephole (live site-wide, Nov 2): renders wherever
                the API serves peephole data. Sits under the tickets
                button. */}
            {event.peephole && Date.now() < detailsButtonExpiresMs(event) && (
              <Peephole data={event.peephole} />
            )}
          </>
        ) : event.recent_photos ? (
          <>
            <RecentPhotos
              data={event.recent_photos}
              eventId={Number(event.id)}
              slug={event.slug}
            />
            {factsEl}
            {event.community && (
              <CommunityPickCard data={event.community} />
            )}
            {descriptionEl}
            {actionsEl}
            {event.community && (
              <CommunityBelow data={event.community} />
            )}
          </>
        ) : hasPhotos ? (
          <>
            <PhotoGallery slug={event.slug} recurrence={event.recurrence} />
            {factsEl}
            {event.community && (
              <CommunityPickCard data={event.community} />
            )}
            {descriptionEl}
            {actionsEl}
            {event.community && (
              <CommunityBelow data={event.community} />
            )}
          </>
        ) : (
          <>
            {descriptionEl}
            {actionsEl}
            {event.community && (
              <CommunityBelow data={event.community} />
            )}
            {/* The Peephole (live site-wide, Nov 2): renders wherever
                the API serves peephole data. Sits under the tickets
                button. */}
            {event.peephole && Date.now() < detailsButtonExpiresMs(event) && (
              <Peephole data={event.peephole} />
            )}
            {/* Room Proof (Angelo, Nov 2; order per Spark's swap call):
                on a page with no photos of any kind, the proof module
                leads and the Photos empty state follows — persuasion
                first, the "be the first" invite second. Renders only
                when the API serves room_proof (finder-proven venue,
                genre guard passed). */}
            {event.room_proof && <RoomProof data={event.room_proof} />}
            <PhotoGallery slug={event.slug} recurrence={event.recurrence} />
          </>
        )}
      </article>

      {/* Desktop sidebar (Angelo's detail mockup, Nov 4): real data
          only — the venue photo is a genuine photo of the venue
          BUILDING (API VENUE_PHOTO_PICKS) or the card renders without
          one; the venue name sits BELOW the photo as the card heading;
          below it a self-hosted STATIC map image (OSM tiles stitched
          by the API, purple pin on the venue's street address with
          the address drawn beside the pin — the keyless Google embed
          iframe it replaced could not recolor its red pin), wrapped
          in a link to the venue's Google Maps place page, then the
          address + View on Map row; the people panel renders only
          when the event has credited people; the related rows are
          real upcoming events at this venue. The whole aside is
          display:none below 901px. */}
      <aside className="d-sidebar">
        {event.venue && (
          <section className="d-side-panel d-side-venue">
            {event.venue.image_url && (
              <div className="d-side-venue-photo">
                <img src={event.venue.image_url} alt={event.venue.name} />
              </div>
            )}
            <h2 className="d-side-venue-label">
              <img src="/icons/icon-pin-red.png" alt="" />
              {event.venue.name}
            </h2>
            <div className="d-side-map">
              {event.venue.map_url && (
                <a
                  className="d-side-map-linkwrap"
                  href={mapsUrl(event)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <img
                    className="d-side-map-img"
                    src={event.venue.map_url}
                    alt={`Map of ${event.venue.address ?? event.venue.name}`}
                    loading="lazy"
                  />
                </a>
              )}
              <div className="d-side-map-row">
                <div className="d-side-map-addr">
                  {event.venue.address && <span>{event.venue.address}</span>}
                  <span>
                    {[event.venue.city, 'ME'].filter(Boolean).join(', ')}
                  </span>
                </div>
                <a
                  className="d-side-map-link"
                  href={mapsUrl(event)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View on Map
                  <img src="/icons/icon-arrow-white.png" alt="" className="inline-icon" />
                </a>
              </div>
            </div>
          </section>
        )}
        {livePeople.length > 0 && (
          <section className="d-side-panel d-side-people">
            <h2 className="d-side-title">
              {liveEnded
                ? `People who attended (${livePeople.length})`
                : `People here now (${livePeople.length})`}
            </h2>
            <div className="d-side-avatars">
              {livePanelPeople.slice(0, 5).map((p, i) => {
                const inner = p.avatarUrl ? (
                  <img src={p.avatarUrl} alt={p.name} />
                ) : (
                  <span className="d-side-initials">{p.initials}</span>
                );
                return p.postUrl ? (
                  <a
                    key={i}
                    className="d-side-avatar"
                    href={p.postUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={p.name}
                  >
                    {inner}
                  </a>
                ) : (
                  <span key={i} className="d-side-avatar" title={p.name}>
                    {inner}
                  </span>
                );
              })}
              {livePeople.length > 5 && (
                <span className="d-side-avatar d-side-avatar-more">
                  +{livePeople.length - 5}
                </span>
              )}
            </div>
          </section>
        )}
        {event.venue && venueEvents.length > 0 && (
          <section className="d-side-panel d-side-related">
            <h2 className="d-side-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
              Related Events at {event.venue.name}
            </h2>
            <div className="d-side-rel-list">
              {venueEvents.map((e) => (
                <Link
                  key={e.id}
                  className="d-side-rel"
                  href={`/events/${e.slug}`}
                >
                  {e.card_image_url || e.image_url ? (
                    <img
                      src={e.card_image_url || e.image_url || ''}
                      alt=""
                      className="d-side-rel-img"
                    />
                  ) : (
                    <span
                      className="d-side-rel-img d-side-rel-img-empty"
                      aria-hidden="true"
                    />
                  )}
                  <span className="d-side-rel-text">
                    <span className="d-side-rel-title">{e.title}</span>
                    <span className="d-side-rel-date">
                      {relDate(e.starts_at)}
                    </span>
                  </span>
                  <span className="d-side-rel-chev" aria-hidden="true">
                    ›
                  </span>
                </Link>
              ))}
            </div>
            <Link
              className="d-side-more"
              href={`/venues/${venueBaseSlug(event.venue.name, event.venue.city)}`}
            >
              View More at {event.venue.name} →
            </Link>
          </section>
        )}
      </aside>
      </div>
      {mobile && (
        <>
          <div style={{ height: 84 }} />
          <MobileTabs active="events" qs="" />
        </>
      )}
    </div>
    </>
  );
}
