import type { ReactNode } from 'react';
import type { EventItem } from '../lib/api';
import { formatDateLong, formatTimeLong, mapsUrl, sameDayET } from '../lib/api';
import DetailsButton from './DetailsButton';
import ListedByLink from './ListedByLink';
import PhotoGallery from './PhotoGallery';
import GamePhotos from './GamePhotos';
import {
  GameCalendarButton,
  GameSaveButton,
  GameShareButton,
} from './GameActions';
import { detailsButtonExpiresMs } from '../lib/mobile';

/**
 * Desktop GAME detail layout (Spark game spec, Nov 4): the sports
 * variant of the desktop detail page, applied when an event carries
 * game data (game_summary, or a live/final tracked score). Two
 * columns inside the same 1280px design hold — 664px main + 520px
 * rail — replacing the concert layout's 344/536/288 grid. The whole
 * block is display:none below 901px (the frozen mobile flow, light
 * GameSummary stack included, renders exactly as before) and the
 * standard desktop pieces are hidden for game pages by the
 * .d-detail-game rules in globals.css.
 *
 * Real data only (Angelo's standing rules): records, score, note and
 * What's Next come from the event's own game_summary / live_score;
 * where a team's record is absent the panel renders only the team
 * whose record exists. The FINAL panel art is used ONLY for finished
 * games; a game in progress gets the dark matchup panel with the
 * real live score. "Add to My Calendar" downloads a real .ics.
 */

type GameState = 'final' | 'live' | 'upcoming';

/** Away-slot mascot mirrors: original asset -> mirrored copy whose
 * mascot faces LEFT, toward the home team, per the class-wide facing
 * rule. Add an entry when a right-facing asset is banked into away
 * slots only. */
const AWAY_LOGO_MIRRORS: Record<string, string> = {
  '/icons/games/logo-panthers.png': '/icons/games/logo-panthers-flip.png',
};

const TZ = 'America/New_York';

function dateShort(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(iso));
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Relative age from a quote's real post time (epoch seconds), the
 * same computation CommunityBlock uses; the stored `ago` string is a
 * harvest-day fossil kept only as a fallback. */
function quoteAgo(postedAt?: number | null, fallback?: string | null): string | undefined {
  if (postedAt) {
    const s = Math.max(0, Math.floor(Date.now() / 1000) - postedAt);
    if (s < 60) return 'just now';
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d}d ago`;
    const mo = Math.floor(d / 30);
    if (mo < 12) return `${mo}mo ago`;
    return `${Math.floor(mo / 12)}y ago`;
  }
  return fallback ?? undefined;
}

const IC = {
  calendar: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
  ),
  clock: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
  ),
  pin: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21.5s-7.5-8-7.5-13a7.5 7.5 0 0 1 15 0c0 5-7.5 13-7.5 13z" /><circle cx="12" cy="8.8" r="2.6" /></svg>
  ),
  trophy: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18 4h3v2a5 5 0 0 1-5 5h-.42A6 6 0 0 1 13 14.92V17h3v2H8v-2h3v-2.08A6 6 0 0 1 8.42 11H8a5 5 0 0 1-5-5V4h3V3h12v1zM5 6.73A3 3 0 0 0 7.65 9 10.9 10.9 0 0 1 5 6.73zM19 6.73A10.9 10.9 0 0 1 16.35 9 3 3 0 0 0 19 6.73z" /></svg>
  ),
  chart: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#A7B0CC" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>
  ),
  doc: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A7B0CC" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M16 13H8" /><path d="M16 17H8" /><path d="M10 9H8" /></svg>
  ),
  info: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A7B0CC" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></svg>
  ),
  chat: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A7B0CC" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
  ),
};

export default function DesktopGame({
  event,
  state,
  cost,
  hasRealCost,
  updatedLabel,
  statusBanner,
  soldOutPanel,
  livePanelEl,
  peepholeEl,
  roomProofEl,
  recentPhotosEl,
}: {
  event: EventItem;
  state: GameState;
  cost: string;
  hasRealCost: boolean;
  updatedLabel: string | null;
  statusBanner: ReactNode;
  soldOutPanel: ReactNode;
  livePanelEl: ReactNode;
  peepholeEl: ReactNode;
  roomProofEl: ReactNode;
  recentPhotosEl: ReactNode;
}) {
  const summary = event.game_summary ?? null;
  const score = event.live_score ?? null;
  const venue = event.venue ?? null;

  // Teams: the summary's billed teams (with mascot art) when present,
  // else the score feed's names, else the "X vs Y" title split. A
  // missing mascot renders name/text only — never a substitute image.
  const vsParts = event.title
    .split(/\s+vs\.?\s+/i)
    .map((s) => s.split(/\s+[—–]\s+/)[0].trim());
  const home = {
    name: summary?.home.name ?? score?.home_team ?? vsParts[0] ?? '',
    mascot: summary?.home.mascot ?? null,
    logo: summary?.home.logo ?? null,
  };
  const away = {
    name: summary?.away.name ?? score?.away_team ?? vsParts[1] ?? '',
    mascot: summary?.away.mascot ?? null,
    // Mascot facing rule: the away mascot faces LEFT toward the home team.
    // These library assets are banked right-facing but appear only in away
    // slots, so the desktop panels render their mirrored copies. Scoped to
    // this component — the shared file also feeds frozen surfaces (the
    // standard GameSummary and score cards), which stay untouched.
    logo: summary?.away.logo
      ? (AWAY_LOGO_MIRRORS[summary.away.logo] ?? summary.away.logo)
      : null,
  };

  const dShort = dateShort(event.starts_at);
  const timeRange = event.ends_at
    ? sameDayET(event.starts_at, event.ends_at)
      ? `${formatTimeLong(event.starts_at).replace(/\s*[A-Z]{2,5}$/, '')} – ${formatTimeLong(event.ends_at)}`
      : `${formatTimeLong(event.starts_at)} – ${formatDateLong(event.ends_at)}`
    : formatTimeLong(event.starts_at);
  const venueLine = venue
    ? [venue.address, venue.city, 'ME'].filter(Boolean).join(', ')
    : null;
  const calLocation = venue
    ? [venue.name, venue.address, venue.city ? `${venue.city}, ME` : null]
        .filter(Boolean)
        .join(', ')
    : null;
  const pageUrl = `/events/${event.slug}`;

  // Action row (spec states): FINISHED/LIVE = Calendar + Save Event +
  // Share, no tickets. UPCOMING = tickets primary (when the standard
  // rules allow one) + Calendar dark + Save icon + Share icon.
  const noTickets =
    event.status === 'cancelled' || event.status === 'postponed';
  const ticketsBtn =
    state === 'upcoming' && !noTickets
      ? event.sold_out
        ? Date.now() < detailsButtonExpiresMs(event) && (
            <span className="dg-btn-dark dg-btn-tickets-off" aria-disabled="true">
              <img src="/icons/soldout-ticket-white.png" alt="" className="dg-btn-ic-img" />
              SOLD OUT
            </span>
          )
        : event.url &&
          Date.now() < detailsButtonExpiresMs(event) && (
            <DetailsButton href={event.url} page={pageUrl}>
              <img src="/icons/icon-external-white.png" alt="" className="btn-icon" />
              {event.cost_free
                ? 'More Event Details'
                : 'More Event Details and Tickets'}
              <img src="/icons/icon-arrow-white.png" alt="" className="btn-icon btn-arrow" />
            </DetailsButton>
          )
      : null;

  const calProps = {
    slug: event.slug,
    title: event.title,
    startsAt: event.starts_at,
    endsAt: event.ends_at,
    location: calLocation,
  };

  const actionsEl =
    state === 'upcoming' && ticketsBtn ? (
      <div className="dg-actions">
        {ticketsBtn}
        <GameCalendarButton {...calProps} variant="dark" />
        <GameSaveButton slug={event.slug} eventId={Number(event.id)} variant="icon" />
        <GameShareButton title={event.title} url={pageUrl} variant="icon" />
      </div>
    ) : (
      <div className="dg-actions">
        <GameCalendarButton {...calProps} variant="primary" />
        <GameSaveButton slug={event.slug} eventId={Number(event.id)} variant="row" />
        <GameShareButton title={event.title} url={pageUrl} variant="row" />
      </div>
    );

  const teamCol = (
    t: { name: string; mascot: string | null; logo: string | null },
    size: number,
  ) => (
    <div className="dg-team">
      {t.logo ? (
        <img
          src={t.logo}
          alt=""
          className="dg-team-logo"
          style={{ width: size, height: size }}
        />
      ) : null}
      <span className="dg-team-name">{t.name}</span>
      {t.mascot ? <span className="dg-team-mascot">{t.mascot}</span> : null}
    </div>
  );

  // --- right-rail score panel, by state ---
  let scorePanel: ReactNode = null;
  if (state === 'final' && score) {
    scorePanel = (
      <section className="dg-final" aria-label="Final score">
        <div className="dg-final-scrim" aria-hidden="true" />
        <div className="dg-final-in">
          <span className="dg-final-date">{dShort}</span>
          <div className="dg-final-row">
            {teamCol(home, 88)}
            <strong className="dg-final-score">
              {score.home_score} - {score.away_score}
            </strong>
            {teamCol(away, 88)}
          </div>
        </div>
      </section>
    );
  } else if (state === 'live' && score) {
    scorePanel = (
      <section className="dg-panel dg-matchup" aria-label="Live score">
        <div className="dg-matchup-top">
          <span className="dg-live-pill">
            <span className="card-live-dot" />
            LIVE{score.period ? ` · ${score.period}` : ''}
          </span>
          <span className="dg-matchup-date">{dShort}</span>
        </div>
        <div className="dg-matchup-row">
          {teamCol(home, 80)}
          <strong className="dg-matchup-score">
            {score.home_score} - {score.away_score}
          </strong>
          {teamCol(away, 80)}
        </div>
      </section>
    );
  } else {
    scorePanel = (
      <section className="dg-panel dg-matchup" aria-label="Matchup">
        <div className="dg-matchup-top dg-matchup-top-center">
          <span className="dg-upnext-pill">UP NEXT</span>
        </div>
        <div className="dg-matchup-row">
          {teamCol(home, 80)}
          <span className="dg-vs">VS</span>
          {teamCol(away, 80)}
        </div>
        <p className="dg-matchup-meta">
          {dShort} · {timeRange}
        </p>
        {venue ? (
          <p className="dg-matchup-meta">
            {venue.name} · {venue.city}, ME
          </p>
        ) : null}
      </section>
    );
  }

  // --- records: only the teams whose records the data actually
  // carries (the stored records are the home team's season/conference
  // lines; the other column is never invented). ---
  const records = summary?.records ?? [];
  const recordsPanel =
    records.length > 0 ? (
      <section className="dg-panel dg-records" aria-label="Season and conference record">
        <h2 className="dg-panel-title">
          {IC.chart}
          Season &amp; Conference Record
        </h2>
        <p className="dg-records-team">
          {home.name}
          {home.mascot ? ` (${titleCase(home.mascot)})` : ''}
        </p>
        <div className="dg-rec-rows">
          {records.map((r) => {
            const parts = r.value.split('-').map((s) => s.trim());
            const labels = r.sub ? r.sub.split(/\s+/).filter(Boolean) : [];
            const aligned = parts.length > 1 && parts.length === labels.length;
            const label = titleCase(
              r.label.replace(new RegExp(`^${home.name.toUpperCase()}\\s+`), ''),
            );
            return (
              <div className="dg-rec-row" key={r.label}>
                <span className="dg-rec-label">{label}</span>
                {aligned ? (
                  <span className="dg-rec-grid">
                    {parts.map((p, i) => (
                      <span className="dg-rec-cell" key={i}>
                        {i > 0 ? <span className="dg-rec-dash">-</span> : null}
                        <span className="dg-rec-part">
                          <span className="dg-rec-value">{p}</span>
                          <span className="dg-rec-sub">{labels[i]}</span>
                        </span>
                      </span>
                    ))}
                  </span>
                ) : (
                  <span className="dg-rec-value">
                    {r.value}
                    {r.sub ? <span className="dg-rec-sub-inline"> {r.sub}</span> : null}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </section>
    ) : null;

  const notePanel = summary?.note ? (
    <section className="dg-note" aria-label={summary.note.title}>
      <h2 className="dg-note-title">
        <span className="dg-note-icon">{IC.trophy}</span>
        {summary.note.title}
      </h2>
      <p className="dg-note-body">{summary.note.body}</p>
    </section>
  ) : null;

  const nextPanel =
    summary?.next && summary.next.rows.length > 0 ? (
      <section className="dg-panel dg-next" aria-label={summary.next.title}>
        <h2 className="dg-panel-title">
          {IC.calendar}
          {summary.next.title}
        </h2>
        {summary.next.subtitle ? (
          <p className="dg-next-sub">{summary.next.subtitle}</p>
        ) : null}
        <div className="dg-next-rows">
          {summary.next.rows.map((row) => (
            <div className="dg-next-row" key={row.stage}>
              <span className="dg-next-dot" aria-hidden="true" />
              <div className="dg-next-main">
                <span className="dg-next-stage">{row.stage}</span>
                <span className="dg-next-when">
                  {row.date}
                  {row.time ? ` · ${row.time}` : ''}
                </span>
              </div>
              <div className="dg-next-right">
                {row.badge ? <span className="dg-next-badge">{row.badge}</span> : null}
                {row.place ? (
                  <span className="dg-next-place">
                    <span className="dg-next-place-line">
                      {IC.pin}
                      {row.place.split(' · ')[0]}
                    </span>
                    {row.place.includes(' · ') ? (
                      <span className="dg-next-place-sub">
                        {row.place.split(' · ').slice(1).join(' · ')}
                      </span>
                    ) : null}
                  </span>
                ) : null}
                {row.detail ? <span className="dg-next-detail">{row.detail}</span> : null}
              </div>
            </div>
          ))}
        </div>
      </section>
    ) : null;

  // Fans Are Saying: the event's real community thread, one quote —
  // rendered only when a thread exists, never a placeholder.
  const community = event.community ?? null;
  const fansPanel = community ? (
    <section className="dg-panel dg-fans" aria-label="Fans are saying">
      <h2 className="dg-panel-title">
        {IC.chat}
        Fans Are Saying
      </h2>
      <figure className="dg-fans-quote">
        <span className="dg-fans-mark" aria-hidden="true">
          &ldquo;
        </span>
        <blockquote>{community.feature_quote.text}</blockquote>
        <figcaption className="dg-fans-meta">
          {community.feature_quote.avatar_url ? (
            <img
              className="dg-fans-avatar"
              src={community.feature_quote.avatar_url}
              alt=""
            />
          ) : (
            <span className="dg-fans-avatar dg-fans-avatar-fallback" aria-hidden="true">
              {community.feature_quote.author.charAt(0).toUpperCase()}
            </span>
          )}
          <span className="dg-fans-author">{community.feature_quote.author}</span>
          {quoteAgo(community.feature_quote.posted_at, community.feature_quote.ago) ? (
            <span className="dg-fans-ago">
              · {quoteAgo(community.feature_quote.posted_at, community.feature_quote.ago)}
            </span>
          ) : null}
          <a
            className="dg-fans-link"
            href={community.thread_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            View Thread →
          </a>
        </figcaption>
      </figure>
    </section>
  ) : null;

  const photoCount = event.photo_count ?? 0;

  return (
    <div className="d-game">
      <div className="dg-main">
        {statusBanner}
        <div className="dg-hero">
          {event.image_url ? (
            <img src={event.image_url} alt={event.title} className="dg-hero-img" />
          ) : (
            <div className="dg-hero-img dg-hero-empty" aria-hidden="true" />
          )}
          {event.category?.slug === 'game-day' && (
            <span className="dg-day-pill">
              {IC.trophy}
              Game Day
            </span>
          )}
          {event.sold_out && (
            <span className="card-soldout-ribbonwrap card-soldout-ribbonwrap--detail" aria-hidden="true">
              <img src="/icons/soldout-ribbon.png" alt="" />
            </span>
          )}
          <div className="dg-hero-btns">
            <GameSaveButton slug={event.slug} eventId={Number(event.id)} variant="hero" />
            <GameShareButton title={event.title} url={pageUrl} variant="hero" />
          </div>
        </div>

        <h1 className="dg-h1">{event.title}</h1>

        <div className="dg-facts">
          <div className="dg-fact">
            <span className="dg-fact-ic">{IC.calendar}</span>
            <span>{dShort}</span>
            <span className="dg-fact-ic dg-fact-ic-gap">{IC.clock}</span>
            <span>{timeRange}</span>
          </div>
          {venue && (
            <div className="dg-fact">
              <span className="dg-fact-ic">{IC.pin}</span>
              <span>
                {venue.name}
                {venueLine ? <span className="dg-fact-sub">{venueLine}</span> : null}
              </span>
            </div>
          )}
          {event.source && (
            <div className="dg-fact dg-fact-muted">
              <span>
                Listed by{' '}
                {event.url ? (
                  <ListedByLink href={event.url} page={pageUrl}>
                    {event.source}
                  </ListedByLink>
                ) : (
                  event.source
                )}
              </span>
            </div>
          )}
          {updatedLabel && (
            <div className="dg-fact dg-fact-muted">
              <span>Last updated {updatedLabel}</span>
            </div>
          )}
        </div>

        {soldOutPanel}
        {actionsEl}

        {event.description ? (
          <section className="dg-panel dg-about" aria-label="About this game">
            <h2 className="dg-panel-title">
              {IC.doc}
              About This Game
            </h2>
            {event.description.split(/\n\n+/).map((para, i) => (
              <p key={i} className="dg-about-body">
                {para}
              </p>
            ))}
          </section>
        ) : null}

        <section className="dg-panel dg-details" aria-label="Event details">
          <h2 className="dg-panel-title">
            {IC.info}
            Event Details
          </h2>
          <div className="dg-det-rows">
            <div className="dg-det-row">
              <span className="dg-det-ic">{IC.calendar}</span>
              <span className="dg-det-label">When</span>
              <span className="dg-det-value">
                {formatDateLong(event.starts_at)}
                <br />
                {timeRange}
              </span>
            </div>
            {venue && (
              <div className="dg-det-row">
                <span className="dg-det-ic">{IC.pin}</span>
                <span className="dg-det-label">Where</span>
                <span className="dg-det-value">
                  {venue.name}
                  {venueLine ? (
                    <>
                      <br />
                      {venueLine}
                    </>
                  ) : null}
                  <br />
                  <a
                    href={mapsUrl(event)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="dg-map-link"
                  >
                    View on Map →
                  </a>
                </span>
              </div>
            )}
            {hasRealCost && (
              <div className="dg-det-row">
                <span className="dg-det-ic">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16v3.2a2.3 2.3 0 0 0 0 4.6V18H4v-3.2a2.3 2.3 0 0 0 0-4.6V7z" /><path d="M13.5 7v1.8M13.5 11.1v1.8M13.5 15.2V18" strokeDasharray="0.1 3" /></svg>
                </span>
                <span className="dg-det-label">Cost</span>
                <span className="dg-det-value">{cost}</span>
              </div>
            )}
            {event.source && (
              <div className="dg-det-row">
                <span className="dg-det-ic">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="9" cy="8" r="3.4" /><path d="M3.4 19.4c.6-3.2 2.8-4.9 5.6-4.9s5 1.7 5.6 4.9" /><path d="M15.5 5.4a3.4 3.4 0 0 1 0 6.1M17.8 14.9c1.6.6 2.6 2 3 4.5" /></svg>
                </span>
                <span className="dg-det-label">Listed By</span>
                <span className="dg-det-value">
                  {event.url ? (
                    <ListedByLink href={event.url} page={pageUrl}>
                      {event.source}
                    </ListedByLink>
                  ) : (
                    event.source
                  )}
                </span>
              </div>
            )}
            {updatedLabel && (
              <div className="dg-det-row">
                <span className="dg-det-ic">{IC.clock}</span>
                <span className="dg-det-label">Last Updated</span>
                <span className="dg-det-value">{updatedLabel}</span>
              </div>
            )}
          </div>
        </section>

        {recentPhotosEl}
        {photoCount === 0 && !event.recent_photos ? (
          <PhotoGallery slug={event.slug} recurrence={event.recurrence} />
        ) : null}
        {livePanelEl}
        {peepholeEl}
        {roomProofEl}
      </div>

      <div className="dg-rail">
        {scorePanel}
        {recordsPanel}
        {notePanel}
        {nextPanel}
        {photoCount > 0 ? <GamePhotos slug={event.slug} /> : null}
        {fansPanel}
      </div>
    </div>
  );
}
