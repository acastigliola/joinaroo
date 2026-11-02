'use client';

import { useRef, useState } from 'react';
import { API_BASE_URL, type PeepholeData } from '../lib/api';
import { PhotoLightbox, type EventPhoto } from './PhotoGallery';

// The Peephole (Spark consult, Nov 2; pilot on Blue October): a slim
// city-status strip under the tickets button. Rooms that are live
// right now (>=3 credited photos landed in the last 90 minutes), or —
// when nothing is live — last night's rooms. The API only sends it
// when at least one room clears the gate, so it never renders an
// empty state. Tapping a room peeks inside: that event's gallery in
// the shared lightbox, in place, same as Room Proof.
export default function Peephole({ data }: { data: PeepholeData }) {
  const [gallery, setGallery] = useState<{
    slug: string;
    photos: EventPhoto[];
    idx: number;
  } | null>(null);
  const cache = useRef(new Map<string, EventPhoto[]>());
  const beaconSent = useRef(new Set<string>());

  // Gallery-view beacon, same contract as PhotoGallery's: opening a
  // room's gallery counts as a gallery look at THAT event's page.
  const fireBeacon = (slug: string) => {
    if (beaconSent.current.has(slug)) return;
    beaconSent.current.add(slug);
    try {
      const body = JSON.stringify({ page: `/events/${slug}`, kind: 'open' });
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        navigator.sendBeacon(
          '/api/track/photo-view',
          new Blob([body], { type: 'application/json' }),
        );
      } else {
        fetch('/api/track/photo-view', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          keepalive: true,
        }).catch(() => {});
      }
    } catch {}
  };

  const peek = async (slug: string, thumbUrl: string) => {
    let list = cache.current.get(slug);
    if (!list) {
      try {
        const r = await fetch(
          `${API_BASE_URL}/api/events/${encodeURIComponent(slug)}/photos`,
        );
        const d = r.ok ? await r.json() : { photos: [] };
        list = (d.photos || []) as EventPhoto[];
        cache.current.set(slug, list);
      } catch {
        list = [];
      }
    }
    if (!list || list.length === 0) {
      window.location.href = `/events/${slug}#photos`;
      return;
    }
    const idx = Math.max(
      0,
      list.findIndex((p) => p.url === thumbUrl),
    );
    fireBeacon(slug);
    setGallery({ slug, photos: list, idx });
  };

  const step = (dir: 1 | -1) => {
    setGallery((g) => {
      if (!g) return g;
      const next = g.idx + dir;
      return next < 0 || next >= g.photos.length ? g : { ...g, idx: next };
    });
  };

  const live = data.mode === 'live';
  return (
    <section className="peephole" aria-label={live ? 'Live now' : 'Last night'}>
      <div className="ph-head">
        <span className={live ? 'ph-dot ph-dot-live' : 'ph-dot'} aria-hidden />
        <span className="ph-head-text">
          {live ? 'LIVE NOW' : data.night_label || 'LAST NIGHT'} IN{' '}
          {data.city_label}
        </span>
      </div>
      <div className="ph-rooms">
        {data.rooms.map((r) => (
          <button
            type="button"
            className="ph-room"
            key={r.event_id}
            onClick={() => void peek(r.slug, r.thumb_url)}
            aria-label={`Peek inside ${r.title} at ${r.venue_name}`}
          >
            <img src={r.thumb_url} alt="" loading="lazy" />
            <span className="ph-meta">
              <span className="ph-venue">{r.title}</span>
              <span className="ph-sub">
                {r.venue_name} · {r.photo_count}
                {live ? ' tonight' : ' photos'}
              </span>
            </span>
          </button>
        ))}
      </div>
      {gallery && gallery.photos[gallery.idx] && (
        <PhotoLightbox
          photos={gallery.photos}
          index={gallery.idx}
          onClose={() => setGallery(null)}
          onStep={step}
        />
      )}
    </section>
  );
}
