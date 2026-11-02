'use client';

import Link from 'next/link';
import { useAuth } from '../lib/auth';

/** Header avatar for the mobile site: empty when signed out, otherwise a
 *  circle avatar linking to the user's public profile. */
export default function HeaderAvatar() {
  const { user, authReady } = useAuth();
  if (!authReady || !user) return null;
  const initial = (user.display_name || user.username || '?').charAt(0).toUpperCase();
  return (
    <Link href={`/u/${user.username}`} className="header-avatar" aria-label="Your profile">
      {user.avatar_url ? (
        <img src={user.avatar_url} alt="" className="header-avatar-img" />
      ) : (
        <span className="header-avatar-initial">{initial}</span>
      )}
    </Link>
  );
}
