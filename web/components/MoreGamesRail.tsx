import Link from 'next/link';
import type { EventItem } from '../lib/api';

export interface MoreGameItem {
  event: EventItem;
  distanceMi: number | null;
}

// Games rail in the mockup card style (Angelo, Oct 28): full-bleed
// photo, chips on the photo, score panel overlapping the photo's
// bottom edge when the game has a live/final score, title/when/venue
// underneath.
function railWhen(iso: string): string {
  const d = new Date(iso);
  const tz = 'America/New_York';
  const dayKey = (x: Date) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    }).format(x);
  const today = dayKey(new Date());
  const yesterday = dayKey(new Date(Date.now() - 86400000));
  const mine = dayKey(d);
  // Today/Yesterday are relative; everything ahead shows its date
  // ("Fri, Oct 30") — no "Tomorrow" (Angelo, Oct 29).
  const date =
    mine === today
      ? 'Today'
      : mine === yesterday
        ? 'Yesterday'
        : new Intl.DateTimeFormat('en-US', {
            timeZone: tz,
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          }).format(d);
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
  return `${date} · ${time}`;
}

export default function MoreGamesRail({ items }: { items: MoreGameItem[] }) {
  if (!items.length) return null;
  return (
    <section className="more-games">
      <div className="more-games-head more-games-head--linkonly">
        <Link className="more-games-all" href="/?categories=game-day">
          See all →
        </Link>
      </div>
      <div className="more-games-row">
        {items.map(({ event: e, distanceMi }) => {
          const sc = e.live_score;
          const gs = e.game_summary;
          const scored =
            sc &&
            sc.status !== 'scheduled' &&
            sc.home_score != null &&
            sc.away_score != null;
          const catSlug = e.category.slug.replace(/_/g, '-');
          // Landscape 3/2 box: a non-'top' card_image_url is a portrait
          // inset-box crop (e.g. Angelo's QB crop on 2677) — cover-cropping
          // it into 3/2 decapitates the subject. Wide boxes take the full
          // hero (photo_focus still applies); only 'top' banners, which are
          // made wide, come from card_image_url.
          const railImg =
            e.card_layout === 'top'
              ? e.card_image_url ?? e.image_url
              : e.image_url ?? e.card_image_url;
          return (
            <Link key={e.id} href={`/events/${e.slug}#hero`} className="mg-card">
              <div className="mg-photo">
                {railImg ? (
                  <img
                    className="mg-img"
                    src={railImg ?? ''}
                    alt=""
                    style={
                      e.photo_focus
                        ? { objectPosition: e.photo_focus }
                        : undefined
                    }
                  />
                ) : null}
                <span className={`tag tag-${catSlug}`}>{e.category.name}</span>
                {distanceMi != null && (
                  <span className="mg-dist">{distanceMi.toFixed(1)} mi</span>
                )}
              </div>
              {scored ? (
                <div className="mg-score">
                  {sc.status === 'live' ? (
                    <span className="mg-pill mg-pill--live">
                      ● LIVE{sc.period ? ` · ${sc.period}` : ''}
                    </span>
                  ) : (
                    <span className="mg-pill">FINAL</span>
                  )}
                  <div className="mg-score-row">
                    <div className="mg-side">
                      {(gs?.rail_logo ?? gs?.records_logo ?? gs?.home?.logo) ? (
                        <img
                          className="mg-logo"
                          src={gs?.rail_logo ?? gs?.records_logo ?? gs?.home?.logo ?? ''}
                          alt=""
                        />
                      ) : null}
                      <span className="mg-name">
                        {gs?.home?.name ?? sc.home_team}
                      </span>
                    </div>
                    <div className="mg-nums">
                      <span>{sc.home_score}</span>
                      <span className="mg-div" />
                      <span>{sc.away_score}</span>
                    </div>
                    <div className="mg-side">
                      {gs?.away?.logo ? (
                        <img className="mg-logo" src={gs.away.logo} alt="" />
                      ) : null}
                      <span className="mg-name">
                        {gs?.away?.name ?? sc.away_team}
                      </span>
                    </div>
                  </div>
                </div>
              ) : null}
              <div className="mg-body">
                <h3 className="mg-title">{e.title}</h3>
                <p className="mg-when">{railWhen(e.starts_at)}</p>
                {e.venue && (
                  <p className="mg-venue">
                    {e.venue.name} · {e.venue.city}
                  </p>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
