'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuth, getPublicProfile, type PublicProfile } from '../../../lib/auth';
import EventCard from '../../../components/EventCard';
import MobileTabs from '../../../components/mobile/MobileTabs';

/** Public profile page: avatar, name, @username, member since, saved events. */
export default function PublicProfilePage() {
  const params = useParams();
  const username = decodeURIComponent(String(params.username ?? ''));
  const { token, authReady } = useAuth();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!authReady || !username) return;
    getPublicProfile(username, token)
      .then(setProfile)
      .catch(() => setNotFound(true));
  }, [username, token, authReady]);

  if (notFound) {
    return (
      <div className="profile-page">
        <p>User not found.</p>
        <p>
          <Link href="/">← Back to events</Link>
        </p>
      </div>
    );
  }
  if (!profile) {
    return (
      <div className="profile-page">
        <p>Loading…</p>
      </div>
    );
  }

  const savesPrivate = profile.saves === 'private';
  const saves = savesPrivate ? [] : (profile.saves as any[]);

  return (
    <div className="profile-page">
      <div className="profile-header">
        {profile.avatar_url ? (
          <img src={profile.avatar_url} alt="" className="profile-avatar" />
        ) : (
          <div className="profile-avatar profile-avatar-default">👤</div>
        )}
        <div>
          <h1 className="profile-display">{profile.display_name}</h1>
          <p className="profile-username">@{profile.username}</p>
          <p className="profile-meta">
            Member since {new Date(profile.created_at).toLocaleDateString()}
          </p>
        </div>
      </div>
      <h2 className="profile-section-title">
        Saved events{savesPrivate ? '' : ` (${saves.length})`}
      </h2>
      {savesPrivate && <p className="profile-private">Event saves set to private.</p>}
      {!savesPrivate && saves.length === 0 && <p className="profile-empty">No saved events yet.</p>}
      {!savesPrivate &&
        saves.map((e) => (
          <Link key={e.id} href={`/events/${e.slug}`} className="card-link">
            <EventCard event={e} />
          </Link>
        ))}
      <p>
        <Link href="/">← Back to events</Link>
      </p>
      <MobileTabs active="events" qs="" />
    </div>
  );
}
