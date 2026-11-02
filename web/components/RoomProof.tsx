'use client';

import { useRef, useState } from 'react';
import { API_BASE_URL, type RoomProofData } from '../lib/api';
import { PhotoLightbox, type EventPhoto } from './PhotoGallery';

// Room Proof (Angelo, Nov 2; revised to Spark's review specs same day):
// venue photo-history module on the detail page, above the Photos
// section, for events at a finder-proven venue that have no photos of
// their own yet. Proof photos are borrowed from a past night in the
// same room; each photographer's credit travels under their photo.
// Tapping a thumbnail or the "N photos from inside" line launches the
// proof night's full gallery in the shared lightbox, right on this
// page (Angelo, Nov 2) — the visitor never has to leave to see the
// room. For finder-committed events the panel states a commitment, not
// a forecast ("We'll be checking..."), backed by the venue's followed
// record once the sample is big enough to print. A committed event
// that ends photo-less carries a post-mortem line for 24h instead of
// silently vanishing. The whole module disappears once the event has
// its own photos; comedy, spoken word and film pages never see it
// (genre guard, API-side).
export default function RoomProof({ data }: { data: RoomProofData }) {
  const { proof, prediction, postmortem, venue_name } = data;
  const [photos, setPhotos] = useState<EventPhoto[] | null>(null);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const beaconSent = useRef(false);

  // Gallery-view beacon, same contract as PhotoGallery's: opening the
  // proof gallery counts as a gallery look at the PROOF event's page —
  // its photos are what is being viewed. Once per page load.
  const fireBeacon = () => {
    if (beaconSent.current) return;
    beaconSent.current = true;
    try {
      const body = JSON.stringify({
        page: `/events/${proof.slug}`,
        kind: 'open',
      });
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

  const openGallery = async (startUrl?: string) => {
    let list = photos;
    if (!list) {
      try {
        const r = await fetch(
          `${API_BASE_URL}/api/events/${encodeURIComponent(proof.slug)}/photos`,
        );
        const d = r.ok ? await r.json() : { photos: [] };
        list = (d.photos || []) as EventPhoto[];
        setPhotos(list);
      } catch {
        list = [];
      }
    }
    if (!list || list.length === 0) {
      // Fetch failed: fall back to the proof event's own page.
      window.location.href = `/events/${proof.slug}#photos`;
      return;
    }
    const idx = startUrl
      ? Math.max(
          0,
          list.findIndex((p) => p.url === startUrl),
        )
      : Math.max(
          0,
          list.findIndex((p) => p.url === proof.photos[0]?.url),
        );
    fireBeacon();
    setLightboxIdx(idx);
  };

  const stepLightbox = (dir: 1 | -1) => {
    setLightboxIdx((idx) => {
      if (idx === null || !photos) return idx;
      const next = idx + dir;
      return next < 0 || next >= photos.length ? idx : next;
    });
  };

  return (
    <section className="room-proof">
      <h2 className="rp-heading">
        This room, another night at {venue_name}
      </h2>
      <p className="rp-line">
        <button
          type="button"
          className="rp-line-btn"
          onClick={() => void openGallery()}
        >
          {proof.photo_count} photos from inside {proof.title} —{' '}
          {proof.date_label}
        </button>
      </p>
      <div className="rp-thumbs">
        {proof.photos.map((p, i) => (
          <figure className="rp-fig" key={i}>
            <button
              type="button"
              className="rp-thumb"
              onClick={() => void openGallery(p.url)}
              aria-label={`Open the ${proof.title} photo gallery`}
            >
              <img
                src={p.url}
                alt={`${proof.title} at ${venue_name}`}
                loading="lazy"
              />
            </button>
            {p.credit && (
              <figcaption className="rp-credit">Photo: {p.credit}</figcaption>
            )}
          </figure>
        ))}
      </div>
      {prediction && (
        <div className="rp-pred">
          <p className="rp-pred-line">
            We&rsquo;ll be checking for photos from inside later that night,
            between {prediction.window_label}.
          </p>
          {prediction.followed != null && prediction.with_photos != null && (
            <p className="rp-track">
              {prediction.with_photos} of the last {prediction.followed}{' '}
              {venue_name} shows we followed got photos from inside.
            </p>
          )}
        </div>
      )}
      {postmortem && (
        <p className="rp-post">
          We checked for photos from inside — none surfaced last night.
        </p>
      )}
      {lightboxIdx !== null && photos && photos[lightboxIdx] && (
        <PhotoLightbox
          photos={photos}
          index={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
          onStep={stepLightbox}
        />
      )}
    </section>
  );
}
