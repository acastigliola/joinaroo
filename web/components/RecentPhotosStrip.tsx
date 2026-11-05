'use client';

import { useState } from 'react';
import { API_BASE_URL, type RecentPhotos as RecentPhotosData } from '../lib/api';
import { PhotoLightbox, type EventPhoto } from './PhotoGallery';

/** The pooled photo strip for the "Recent game-day photos" section.
 * Selecting a photo opens the gallery lightbox over the pooled photos
 * (credits included), starting at the clicked photo — the same lightbox
 * the "See recent photos" action launches. Client island; the section
 * shell stays a server component. */

function dateBadge(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
  }).format(new Date(iso));
}

export default function RecentPhotosStrip({
  photos,
}: {
  photos: RecentPhotosData['photos'];
}) {
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const lightboxPhotos: EventPhoto[] = photos.map((p, i) => ({
    id: i,
    event_id: 0,
    url: p.url,
    caption: p.caption ?? null,
    created_at: '',
    source: p.source ?? null,
  }));

  const stepLightbox = (dir: 1 | -1) => {
    setLightboxIdx((idx) => {
      if (idx === null) return idx;
      const next = idx + dir;
      return next < 0 || next >= lightboxPhotos.length ? idx : next;
    });
  };

  return (
    <>
      <div className="recent-strip">
        {photos.map((p, i) => (
          <button
            key={i}
            type="button"
            className="recent-thumb"
            onClick={() => setLightboxIdx(i)}
            aria-label="Open photo in gallery"
          >
            <img
              src={`${API_BASE_URL}${p.url}`}
              alt=""
              loading="lazy"
              className="recent-photo"
            />
            <span className="recent-badge">
              <img
                src="/icons/icon-camera.png"
                alt=""
                className="recent-badge-icon"
              />
              {dateBadge(p.event_starts_at)}
            </span>
          </button>
        ))}
      </div>
      {lightboxIdx !== null && lightboxPhotos[lightboxIdx] && (
        <PhotoLightbox
          photos={lightboxPhotos}
          index={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
          onStep={stepLightbox}
        />
      )}
    </>
  );
}
