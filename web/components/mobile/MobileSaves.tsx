'use client';

import { useEffect, useState } from 'react';
import EventCard from '../EventCard';
import MobileTabs from './MobileTabs';
import { EventItem } from '../../lib/api';
import { useAuth, fetchServerSaves } from '../../lib/auth';

/** "My Saves" tab — server-backed when signed in, signup prompt when not. */
export default function MobileSaves({ qs }: { qs: string }) {
  const { token, authReady, openAuth } = useAuth();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authReady) return;
    if (!token) {
      setLoading(false);
      return;
    }
    fetchServerSaves(token)
      .then((r) => {
        const now = Date.now();
        const items = (r.saves as EventItem[])
          .filter((e) => new Date(e.starts_at).getTime() >= now - 1000 * 60 * 60 * 12)
          .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));
        setEvents(items);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [token, authReady]);

  return (
    <div className="m-page">
      <h1 className="m-title">My Saves</h1>
      {loading ? (
        <p className="m-empty">Loading…</p>
      ) : !token ? (
        <div className="m-empty">
          <p>Sign up to save events and sync them to your account.</p>
          <p style={{ marginTop: 12 }}>
            <button onClick={() => openAuth('signup')} className="auth-primary" style={{ display: 'inline-block' }}>
              Log in / Sign up
            </button>
          </p>
        </div>
      ) : events.length === 0 ? (
        <p className="m-empty">
          No saved events yet. Tap the ☆ on any event card to save it here.
        </p>
      ) : (
        <div className="m-list">
          {events.map((e) => (
            <EventCard key={e.slug} event={e} />
          ))}
        </div>
      )}
      <MobileTabs active="saves" qs={qs} />
    </div>
  );
}
