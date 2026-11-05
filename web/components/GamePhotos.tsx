'use client';

import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../lib/api';
import { PhotoLightbox, type EventPhoto } from './PhotoGallery';

/**
 * Game Photos panel for the desktop GAME detail right rail (Spark
 * game spec, Nov 4): up to 3 real photo thumbs plus a "View All
 * Photos" link — NO count anywhere, per the spec. Both the thumbs
 * and the link open the existing gallery lightbox, so the full set
 * stays reachable. Renders nothing until real photos are confirmed
 * (the page only mounts it when the payload's photo_count > 0).
 */
export default function GamePhotos({ slug }: { slug: string }) {
  const [photos, setPhotos] = useState<EventPhoto[]>([]);
  const [idx, setIdx] = useState<number | null>(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/events/${encodeURIComponent(slug)}/photos`)
      .then((r) => (r.ok ? r.json() : { photos: [] }))
      .then((d) => setPhotos(d.photos || []))
      .catch(() => {});
  }, [slug]);

  if (photos.length === 0) return null;

  const step = (dir: 1 | -1) => {
    setIdx((cur) => {
      if (cur === null) return cur;
      const next = cur + dir;
      return next < 0 || next >= photos.length ? cur : next;
    });
  };

  return (
    <section className="dg-panel dg-photos" aria-label="Game photos">
      <div className="dg-photos-head">
        <h2 className="dg-panel-title">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#A7B0CC" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-4.35-4.35L6 21" /></svg>
          Game Photos
        </h2>
        <button
          type="button"
          className="dg-viewall"
          onClick={() => setIdx(0)}
        >
          View All Photos ({photos.length}) →
        </button>
      </div>
      <div className="dg-photo-grid">
        {photos.slice(0, 12).map((p, i) => (
          <button
            key={p.id}
            type="button"
            className="dg-photo-thumb"
            onClick={() => setIdx(i)}
            aria-label={p.caption || 'Open photo'}
          >
            <img src={`${API_BASE_URL}${p.url}`} alt={p.caption || ''} loading="lazy" />
          </button>
        ))}
      </div>
      {idx !== null && photos[idx] && (
        <PhotoLightbox
          photos={photos}
          index={idx}
          onClose={() => setIdx(null)}
          onStep={step}
        />
      )}
    </section>
  );
}
