import Link from 'next/link';
import SaveStar from './SaveStar';
import CardPhotosLink from './CardPhotosLink';
import {
  DAY_PART_STYLE,
  EventItem,
  formatDatePart,
  formatDistance,
  formatTimeMaine,
  timeOfDay,
} from '../lib/api';
import { livePillExpiresMs } from '../lib/mobile';

/** Distance pill color band (Angelo's desktop mockup, Oct 29; colors
 *  sampled from his asset sheet): <0.5 mi green, <3.5 blue, <7.5 tan,
 *  beyond that pink. */
// Cards are a summary surface: a long prose cost_text (tier lists,
// fee notes) balloons the card — 125 upcoming events carry cost_text
// over 60 chars (Angelo screenshot, Oct 29: the Inspector Hound card's
// 132-char cost filled a 3-line blob and ran under the save star).
// Cards show the headline segment, up to the first ';', '·' or ' — ';
// the event detail page keeps the full cost_text verbatim.
function cardCostText(text: string): string {
  const head = text.split(/[;·]| — /)[0].trim();
  return head || text.trim();
}

function distBand(km?: number | null): string {
  if (km == null) return 'dist-b2';
  const mi = km / 1.60934;
  if (mi < 0.5) return 'dist-b1';
  if (mi < 3.5) return 'dist-b2';
  if (mi < 7.5) return 'dist-b3';
  return 'dist-b4';
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

/** Mirrors the mobile app's EventCard: day-part color coding, same row order. */
export default function EventCard({
  event,
  dayLabel,
  heroPhoto,
  photoCard,
}: {
  event: EventItem;
  dayLabel?: string;
  /**
   * Desktop only (Angelo, Oct 28): show the event's hero photo on the
   * card — a full-width banner, the desktop expression of the live
   * card's photo thumbnail. Mobile surfaces never pass this, so the
   * mobile card stays exactly as designed.
   */
  heroPhoto?: boolean;
  /**
   * Mobile site trial (Angelo, Oct 28, from his mockup): white card with
   * the hero photo inset at the left and the content in a right column.
   * Only MobileHome passes this; live cards keep their frozen variant.
   */
  photoCard?: boolean;
}) {
  const dp = DAY_PART_STYLE[timeOfDay(event.starts_at)];
  const rawCost = event.cost_text?.trim();
  const cost = event.cost_free ? 'Free' : rawCost ? cardCostText(rawCost) : 'See details';
  const distance = formatDistance(event.distance_km);
  const when = dayLabel
    ? `${dayLabel} · ${formatTimeMaine(event.starts_at)}`
    : formatDatePart(event.starts_at);
  const catSlug = event.category.slug.replace(/_/g, '-');
  // Live card: the event has credited photos from people there — show the
  // newest one as a thumbnail with a LIVE pill, plus who's there.
  const livePeople = event.live_people ?? [];
  const isLive = livePeople.length > 0;
  // The LIVE pill comes off one hour after the event ends (the card
  // keeps its live form for the rest of the day). No end time: the pill
  // stays for the listing day, then comes off at midnight.
  const showLivePill = isLive && Date.now() < livePillExpiresMs(event);
  const shownPeople = livePeople.slice(0, 5);
  const extraPeople = livePeople.length - shownPeople.length;
  const costEl = (
    <p className="card-cost">
      {event.cost_free ? <span className="cost-free">Free</span> : cost}
    </p>
  );
  // Photo-card cost row (mockup): Free and prices both render as pills;
  // no price info at all renders as the plain blue "See details".
  // Long pricing drops the pill background entirely — a multi-line
  // pill renders as a giant oval blob (Angelo, Oct 29).
  const photoCost = rawCost ? cardCostText(rawCost) : null;
  const photoCostEl = (
    <p className="card-cost">
      {event.cost_free ? (
        <span className="cost-free">Free</span>
      ) : photoCost ? (
        <span
          className={
            photoCost.length > 44 ? 'cost-price cost-price--plain' : 'cost-price'
          }
        >
          {photoCost}
        </span>
      ) : (
        'See details'
      )}
    </p>
  );
  // Sold-out treatment (Angelo, Oct 29, from his mockup): a red diagonal
  // SOLD OUT ribbon across the photo's top-left corner plus a pink SOLD
  // OUT pill in the body. Live cards keep their frozen variant.
  const soldOut = !!event.sold_out && !isLive;
  const soldOutPill = soldOut ? (
    <p className="card-soldout-pill">
      <img src="/icons/soldout-ticket.png" alt="" />
      SOLD OUT
    </p>
  ) : null;
  const soldOutRibbon = (variant: 'photo' | 'top' | 'hero') =>
    soldOut ? (
      <span
        className={`card-soldout-ribbonwrap card-soldout-ribbonwrap--${variant}`}
        aria-hidden="true"
      >
        <img src="/icons/soldout-ribbon.png" alt="" />
      </span>
    ) : null;
  const tagsEl = (
    <div className="card-tags">
      <span className={`tag tag-${catSlug}`}>{event.category.name}</span>
      {event.featured && <span className="featured-badge">Featured</span>}
      {distance && <span className="card-distance">{distance}</span>}
    </div>
  );
  // Community Pick chip (Angelo, Oct 29, his supplied graphic): a wide
  // pill under the chips row on cards for the r/portlandme watchlist
  // bands' shows. Live cards keep their frozen variant. (Removed and
  // restored the same evening at his direction.)
  const communityPickEl =
    !!event.community_pick && !isLive ? (
      <img
        className="card-community-pick"
        src="/icons/community-pick.png"
        alt="Community Pick — r/portlandme recommends"
        width={156}
        height={32}
      />
    ) : null;
  // Desktop mockup cards (Angelo, Oct 29): the distance leaves the
  // tags row and becomes a color-banded pill overlaid on the hero
  // photo; the body keeps just the category + Featured chips.
  const heroTagsEl = (
    <div className="card-tags">
      <span className={`tag tag-${catSlug}`}>{event.category.name}</span>
      {event.featured && <span className="featured-badge">Featured</span>}
    </div>
  );
  // Desktop mockup cards end with a "See details →" link row. Prices
  // render above it whenever the event has one (Angelo, Oct 29: the
  // mockup's no-price look was reversed the same morning); with no
  // price data the See details row stands alone.
  const seeDetailsEl = (
    <p className="card-see-details">
      See details
      <img src="/icons/icon-arrow-right.png" alt="" className="card-see-arrow" />
    </p>
  );
  const usePhoto = Boolean(photoCard) && !isLive;
  // Top-photo variant (Angelo, Oct 28): for wide key art, the card
  // photo renders as a full-width banner on top of the card instead of
  // the left inset, so a cropped-out main image can show whole.
  const usePhotoTop = usePhoto && event.card_layout === 'top';
  // Live-score line (Angelo, Oct 27): a tracked game in progress or
  // finished shows its score on the card — a second liveness signal
  // next to the photo-driven live treatment.
  const sc = event.live_score;
  const scoreEl =
    sc && sc.status !== 'scheduled' && sc.home_score != null && sc.away_score != null ? (
      <div className="card-score">
        {sc.status === 'live' ? (
          <span className="card-score-live">
            <span className="card-live-dot" />
            LIVE
          </span>
        ) : (
          <span className="card-score-final">FINAL</span>
        )}
        <span className="card-score-text">
          {sc.home_team} {sc.home_score} · {sc.away_team} {sc.away_score}
          {sc.status === 'live' && sc.period ? ` · ${sc.period}` : ''}
        </span>
      </div>
    ) : null;
  // Score strip for mobile photo cards (Angelo's card mockup, Oct 28):
  // a full-width strip at the bottom of the card \u2014 team logos + names
  // on the sides (from the event's game_summary when it has one, names
  // otherwise), status pill over the big score numbers in the middle.
  // The save star keeps its corner below the strip via card padding.
  const gs = event.game_summary;
  const scoreStripEl =
    usePhoto &&
    sc &&
    sc.status !== 'scheduled' &&
    sc.home_score != null &&
    sc.away_score != null ? (
      <div className="card-score-strip">
        <div className="card-score-side">
          {(gs?.records_logo ?? gs?.home?.logo) ? (
            <img
              className="card-score-logo"
              src={gs?.records_logo ?? gs?.home?.logo ?? ''}
              alt=""
            />
          ) : null}
          <span className="card-score-name">{gs?.home?.name ?? sc.home_team}</span>
        </div>
        <div className="card-score-mid">
          {sc.status === 'live' ? (
            <span className="card-score-pill card-score-pill--live">
              ● LIVE{sc.period ? ` \u00B7 ${sc.period}` : ''}
            </span>
          ) : (
            <span className="card-score-pill">FINAL</span>
          )}
          <div className="card-score-nums">
            <span>{sc.home_score}</span>
            <span className="card-score-div" />
            <span>{sc.away_score}</span>
          </div>
        </div>
        <div className="card-score-side">
          {gs?.away?.logo ? (
            <img className="card-score-logo" src={gs.away.logo} alt="" />
          ) : null}
          <span className="card-score-name">{gs?.away?.name ?? sc.away_team}</span>
        </div>
      </div>
    ) : null;
  const titleBlock = (
    <>
      <h3 className="card-title">{event.title}</h3>
      <p className="card-when">{when}</p>
      {event.venue && (
        <p className="card-meta">
          <img src="/icons/icon-pin-gray.png" alt="" className="card-pin" />
          {event.venue.name} · {event.venue.city}
        </p>
      )}
    </>
  );
  return (
    <article
      className={
        'card' +
        (heroPhoto ? ' card--hero' : '') +
        (usePhoto ? ' card--photo' : '') +
        (usePhotoTop ? ' card--photo-top' : '') +
        (scoreStripEl ? ' card--scored' : '')
      }
      style={
        usePhoto
          ? { background: '#FFFFFF' }
          : { background: dp.bg, borderLeft: `4px solid ${dp.bar}` }
      }
    >
      <Link className="card-link" href={`/events/${event.slug}#hero`}>
        {heroPhoto && !isLive && event.image_url && (
          <div className="card-hero-wrap">
            <img className="card-hero-img" src={event.image_url} alt="" />
            {soldOutRibbon('hero')}
            {distance && (
              <span className={`card-hero-dist ${distBand(event.distance_km)}`}>
                {distance}
              </span>
            )}
          </div>
        )}
        {usePhoto ? (
usePhotoTop ? (
            <div className="card-photo-topwrap">
              {(event.card_image_url ?? event.image_url) && (
                <img
                  className="card-photo-top-img"
                  src={event.card_image_url ?? event.image_url ?? ''}
                  alt=""
                  style={{
                    ...(event.photo_focus
                      ? { objectPosition: event.photo_focus }
                      : {}),
                    ...(event.card_top_ratio
                      ? { aspectRatio: event.card_top_ratio }
                      : {}),
                  }}
                />
              )}
              {soldOutRibbon('top')}
              <div className="card-photo-body">
                {tagsEl}
                {communityPickEl}
                {titleBlock}
                {soldOutPill}
                {photoCostEl}
              </div>
              {scoreStripEl}
            </div>
          ) : (
          <>
          <div className="card-photo-row">
            {soldOutRibbon('photo')}
            {(event.card_image_url ?? event.image_url) && (
              <img
                className="card-photo-img"
                src={event.card_image_url ?? event.image_url ?? ''}
                alt=""
                style={
                  event.photo_focus
                    ? { objectPosition: event.photo_focus }
                    : undefined
                }
              />
            )}
            <div className="card-photo-body">
              {tagsEl}
              {communityPickEl}
              {titleBlock}
              {soldOutPill}
              {photoCostEl}
            </div>
          </div>
          {scoreStripEl}
          </>
          )
        ) : (
          <>
            {heroPhoto ? heroTagsEl : tagsEl}
            {communityPickEl}
            {isLive ? (
          <>
            <div className="card-live-main">
              <div className="card-live-body">{titleBlock}</div>
              {event.live_photo_url && (
                <div className="card-live-thumbwrap">
                  <img
                    className="card-live-thumb"
                    src={event.live_photo_url}
                    alt=""
                  />
                  {showLivePill && (
                    <img
                      className="live-pill-img"
                      src="/icons/icon-live.png"
                      alt="Live"
                    />
                  )}
                </div>
              )}
            </div>
            {costEl}
            {showLivePill ? (
              <div className="card-live-row">
                <div className="card-live-avatars">
                  {shownPeople.map((p, i) =>
                    p.avatar_url ? (
                      <img
                        key={i}
                        className="card-live-avatar"
                        src={p.avatar_url}
                        alt={p.name}
                      />
                    ) : (
                      <span
                        key={i}
                        className="card-live-avatar card-live-avatar-initials"
                      >
                        {initialsOf(p.name)}
                      </span>
                    ),
                  )}
                  {extraPeople > 0 && (
                    <span className="card-live-avatar card-live-more">
                      +{extraPeople}
                    </span>
                  )}
                </div>
                <div className="card-live-text">
                  <span className="card-live-count">
                    <span className="card-live-num">{livePeople.length}</span>
                    <span className="card-live-words">
                      {livePeople.length === 1 ? 'person' : 'people'} here now
                    </span>
                  </span>
                  <span className="card-live-sub">
                    <span className="card-live-dot" />
                    Checked in live
                  </span>
                </div>
              </div>
            ) : (
              <div
                className={
                  livePeople.length > 3
                    ? 'card-ended-panel card-ended-panel-stacked'
                    : 'card-ended-panel'
                }
              >
                <div className="card-ended-avatars">
                  {shownPeople.map((p, i) => (
                    <span key={i} className="card-ended-avatarwrap">
                      {p.avatar_url ? (
                        <img
                          className="card-ended-avatar"
                          src={p.avatar_url}
                          alt={p.name}
                        />
                      ) : (
                        <span className="card-ended-avatar card-ended-avatar-initials">
                          {initialsOf(p.name)}
                        </span>
                      )}
                      <img
                        className="card-ended-badge"
                        src="/icons/icon-check-green.png"
                        alt=""
                      />
                    </span>
                  ))}
                  {extraPeople > 0 && (
                    <span className="card-ended-avatarwrap">
                      <span className="card-ended-avatar card-ended-avatar-initials">
                        +{extraPeople}
                      </span>
                    </span>
                  )}
                </div>
                <div className="card-ended-main">
                  <div className="card-ended-text">
                    <span className="card-ended-count">
                      {livePeople.length}{' '}
                      {livePeople.length === 1 ? 'person' : 'people'} attended
                    </span>
                    <span className="card-ended-sub">
                      Checked in · Attendance confirmed
                    </span>
                  </div>
                  <div className="card-ended-actions">
                    <CardPhotosLink
                      slug={event.slug}
                      count={event.photo_count ?? 0}
                    />
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          titleBlock
        )}
        {!isLive && soldOutPill}
        {!isLive &&
          (heroPhoto ? (
            <>
              {(event.cost_free || event.cost_text?.trim()) && costEl}
              {seeDetailsEl}
            </>
          ) : (
            costEl
          ))}
        {!isLive && scoreEl}
          </>
        )}
      </Link>
      <SaveStar slug={event.slug} eventId={Number(event.id)} />
    </article>
  );
}
