import { type RecentPhotos as RecentPhotosData } from '../lib/api';
import CheckInButton from './CheckInButton';
import RecentPhotosActions from './RecentPhotosActions';
import RecentPhotosStrip from './RecentPhotosStrip';

/** "Recent game-day photos" + fans panel (Angelo's mockup, Oct 27) for an
 * "event listing with photos": an upcoming listing with no photos of its
 * own shows the pooled photos from the same home team's last games at
 * this venue (API: recent_photos). Server component; the client islands
 * are the photo strip (gallery lightbox), the actions row (add photo /
 * gallery) and the check-in button. */

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export default function RecentPhotos({
  data,
  eventId,
  slug,
}: {
  data: RecentPhotosData;
  eventId: number;
  slug: string;
}) {
  const { team, games, photos, total, last_people } = data;
  const sub =
    games.length > 1
      ? `From the last ${games.length} ${team} home games`
      : `From the last ${team} home game`;
  const meta =
    last_people.length > 0
      ? `${total} photos shared • ${last_people.length} ${
          last_people.length === 1 ? 'fan' : 'fans'
        } checked in last game`
      : `${total} photos shared`;
  return (
    <>
      <section className="recent-photos" aria-label="Recent game-day photos">
        <div className="recent-head">
          <h2>Recent game-day photos</h2>
          <span className="recent-pill">RECENT HOME GAMES</span>
        </div>
        <p className="recent-sub">{sub}</p>
        <RecentPhotosStrip photos={photos} />
        <div className="recent-meta">
          <span className="recent-meta-text">
            <img src="/icons/icon-image.png" alt="" className="recent-meta-icon" />
            {meta}
          </span>
          <RecentPhotosActions slug={slug} photos={photos} />
        </div>
      </section>
      <section className="fans-panel" aria-label="Fans sharing game-day moments">
        <h3 className="fans-title">Fans are already sharing game-day moments</h3>
        <div className="fans-row">
          {last_people.length > 0 && (
            <span className="fans-avatars">
              {last_people.slice(0, 5).map((p, i) =>
                p.avatar_url ? (
                  <img
                    key={i}
                    src={p.avatar_url}
                    alt={p.name}
                    className="fans-avatar"
                  />
                ) : (
                  <span key={i} className="fans-avatar fans-initials">
                    {initialsOf(p.name)}
                  </span>
                ),
              )}
            </span>
          )}
          <p className="fans-text">
            Join fans who check in and share photos at {team} games.
          </p>
        </div>
        <CheckInButton eventId={eventId} />
      </section>
    </>
  );
}
