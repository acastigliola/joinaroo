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
  return {
    title: event.title,
    description: (
      event.description ||
      `${event.title}${venueBits} — ${formatDateLong(event.starts_at)}.`
    ).slice(0, 160),
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

function jsonLd(event: EventItem) {
  const v = event.venue;
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.title,
    description: event.description || undefined,
    image: event.image_url || undefined,
    startDate: event.starts_at,
    endDate: event.ends_at || undefined,
    eventStatus: 'https://schema.org/EventScheduled',
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
    offers: event.cost_free
      ? {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
          availability: 'https://schema.org/InStock',
        }
      : event.cost_text
        ? {
            '@type': 'Offer',
            price: event.cost_text,
            priceCurrency: 'USD',
            description: event.cost_text,
          }
        : undefined,
    url: event.url || undefined,
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

  const actionsEl = (
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

  return (
    <div className="container container-live">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(event)) }}
      />

      {moreGames.length > 0 && <MoreGamesRail items={moreGames} />}

      <article
        className="event-detail event-detail-live"
      >
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
        {isLive && liveEnded && (
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
      {mobile && (
        <>
          <div style={{ height: 84 }} />
          <MobileTabs active="events" qs="" />
        </>
      )}
    </div>
  );
}
