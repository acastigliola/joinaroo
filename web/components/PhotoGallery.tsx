'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { API_BASE_URL } from '../lib/api';
import { useAuth } from '../lib/auth';

export interface EventPhoto {
  id: number;
  event_id: number;
  url: string;
  caption: string | null;
  created_at: string;
  user_id?: number | null;
  uploaded_by?: {
    username: string;
    display_name: string;
    avatar_url: string | null;
  } | null;
  source?: {
    name: string;
    business: string | null;
    website: string | null;
    instagram: string | null;
    facebook: string | null;
    email: string | null;
    x_username: string | null;
    x_post_url: string | null;
    ig_username: string | null;
    ig_post_url: string | null;
  } | null;
}

/** Full-screen photo viewer with credit rendering, shared by the event
 * gallery and the "event listing with photos" recent-photos section.
 * The parent owns the index state; this component owns keyboard/touch
 * navigation, the scroll lock and neighbour preloading. */
export function PhotoLightbox({
  photos,
  index,
  onClose,
  onStep,
}: {
  photos: EventPhoto[];
  index: number;
  onClose: () => void;
  onStep: (dir: 1 | -1) => void;
}) {
  const touchStartX = useRef<number | null>(null);

  // Keyboard navigation + body scroll lock while the lightbox is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') onStep(1);
      if (e.key === 'ArrowLeft') onStep(-1);
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, photos.length]);

  // Preload the neighbouring photos so stepping/swiping feels instant.
  useEffect(() => {
    for (const n of [index - 1, index + 1]) {
      if (n >= 0 && n < photos.length) {
        const img = new Image();
        img.src = `${API_BASE_URL}${photos[n].url}`;
      }
    }
  }, [index, photos]);

  const photo = photos[index];
  if (!photo) return null;

  return createPortal(
    <div
      className="lightbox-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      onClick={onClose}
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        if (touchStartX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchStartX.current;
        touchStartX.current = null;
        if (dx <= -40) onStep(1);
        else if (dx >= 40) onStep(-1);
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.93)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span
        aria-live="polite"
        style={{
          position: 'absolute',
          top: 16,
          left: 20,
          color: '#fff',
          fontSize: 15,
          fontWeight: 600,
          letterSpacing: '0.02em',
        }}
      >
        {index + 1} of {photos.length}
      </span>
      <button
        type="button"
        aria-label="Close photo viewer"
        onClick={onClose}
        style={{
          position: 'absolute',
          top: 8,
          right: 12,
          background: 'none',
          border: 'none',
          color: '#fff',
          fontSize: 34,
          lineHeight: 1,
          padding: 8,
          cursor: 'pointer',
        }}
      >
        ×
      </button>
      <button
        type="button"
        aria-label="Previous photo"
        disabled={index === 0}
        onClick={(e) => {
          e.stopPropagation();
          onStep(-1);
        }}
        style={{
          position: 'absolute',
          left: 6,
          top: '50%',
          transform: 'translateY(-50%)',
          background: 'rgba(255,255,255,0.12)',
          border: 'none',
          borderRadius: '50%',
          width: 48,
          height: 48,
          color: '#fff',
          fontSize: 28,
          lineHeight: 1,
          cursor: 'pointer',
          opacity: index === 0 ? 0.3 : 1,
        }}
      >
        ‹
      </button>
      <img
        src={`${API_BASE_URL}${photo.url}`}
        alt={photo.caption || 'Event photo'}
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '94vw',
          maxHeight: '86vh',
          objectFit: 'contain',
          borderRadius: 6,
          userSelect: 'none',
        }}
      />
      <button
        type="button"
        aria-label="Next photo"
        disabled={index === photos.length - 1}
        onClick={(e) => {
          e.stopPropagation();
          onStep(1);
        }}
        style={{
          position: 'absolute',
          right: 6,
          top: '50%',
          transform: 'translateY(-50%)',
          background: 'rgba(255,255,255,0.12)',
          border: 'none',
          borderRadius: '50%',
          width: 48,
          height: 48,
          color: '#fff',
          fontSize: 28,
          lineHeight: 1,
          cursor: 'pointer',
          opacity: index === photos.length - 1 ? 0.3 : 1,
        }}
      >
        ›
      </button>
      {(photo.caption || photo.source) && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            bottom: 14,
            left: 0,
            right: 0,
            textAlign: 'center',
            padding: '0 20px',
          }}
        >
          {photo.caption && (
            <p style={{ color: '#eee', fontSize: 14, margin: '0 0 4px' }}>
              {photo.caption}
            </p>
          )}
          {(photo.source?.x_post_url ||
            photo.source?.ig_post_url ||
            photo.source?.facebook) && (
            <p style={{ margin: 0 }}>
              <a
                href={
                  photo.source!.x_post_url ??
                  photo.source!.ig_post_url ??
                  photo.source!.facebook!
                }
                target="_blank"
                rel="noreferrer"
                style={{
                  color: '#fff',
                  fontSize: 14,
                  textDecoration: 'none',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                {photo.source!.x_post_url ? (
                  <img
                    src="/icons/icon-x.svg"
                    alt="X"
                    style={{ width: 18, height: 18, flexShrink: 0 }}
                  />
                ) : photo.source!.ig_post_url ? (
                  <img
                    src="/icons/icon-instagram.svg"
                    alt="Instagram"
                    style={{ width: 20, height: 20, flexShrink: 0 }}
                  />
                ) : (
                  <img
                    src="/icons/icon-facebook.png"
                    alt="Facebook"
                    style={{ width: 20, height: 20, flexShrink: 0 }}
                  />
                )}
                <span style={{ textAlign: 'left' }}>
                  {photo.source!.name}
                  {(photo.source!.x_username ??
                    photo.source!.ig_username) &&
                    ` - @${photo.source!.x_username ?? photo.source!.ig_username}`}
                </span>
              </a>
            </p>
          )}
          {photo.source && !photo.source!.x_post_url && !photo.source!.ig_post_url && !photo.source!.facebook && (
            <p style={{ color: '#eee', fontSize: 14, margin: 0 }}>
              Photographer:{' '}
              {photo.source!.email ? (
                <a
                  href={`mailto:${photo.source!.email}`}
                  style={{ color: '#fff', textDecoration: 'underline' }}
                >
                  {photo.source!.name}
                </a>
              ) : (
                photo.source!.name
              )}
            </p>
          )}
          {photo.source?.business && !photo.source!.x_post_url && !photo.source!.ig_post_url && !photo.source!.facebook && (
            <p style={{ color: '#eee', fontSize: 14, margin: '4px 0 0' }}>
              Studio:{' '}
              {photo.source!.website ? (
                <a
                  href={photo.source!.website}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: '#fff', textDecoration: 'underline' }}
                >
                  {photo.source!.business}
                </a>
              ) : (
                photo.source!.business
              )}
            </p>
          )}
          {photo.source?.instagram && !photo.source!.x_post_url && !photo.source!.ig_post_url && !photo.source!.facebook && (
            <p style={{ margin: '8px 0 0' }}>
              <a
                href={photo.source!.instagram}
                target="_blank"
                rel="noreferrer"
                aria-label={`${photo.source!.name} on Instagram`}
                style={{ display: 'inline-block', lineHeight: 0 }}
              >
                <img
                  src="/icons/icon-instagram.svg"
                  alt="Instagram"
                  style={{ width: 26, height: 26 }}
                />
              </a>
            </p>
          )}
        </div>
      )}
    </div>,
    document.body,
  );
}

export default function PhotoGallery({
  slug,
  recurrence,
  variant,
}: {
  slug: string;
  recurrence?: string | null;
  /** 'live' renders the live-listing layout: "Photos from this event"
   * heading, a View all link, and a horizontal thumbnail row. */
  variant?: 'live';
}) {
  const live = variant === 'live';
  const { token, openAuth } = useAuth();
  const [photos, setPhotos] = useState<EventPhoto[]>([]);
  const [pending, setPending] = useState<{ dataUrl: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Set when an upload is waiting on sign-in, so it resumes automatically
  // once a token lands (same process as the save star's post-login save).
  const awaitingAuth = useRef(false);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/events/${encodeURIComponent(slug)}/photos`)
      .then((r) => (r.ok ? r.json() : { photos: [] }))
      .then((d) => setPhotos(d.photos || []))
      .catch(() => {});
  }, [slug]);

  // Gallery-view beacon (Angelo, Oct 31, 2026): the first time a visitor
  // actually looks at more photos on this page load — opens the lightbox,
  // or scrolls the live photo row sideways to photos that were not on
  // screen — fire a one-way beacon so the analytics report can count real
  // gallery looks. Once per page load across both triggers. Fire-and-
  // forget — sendBeacon never blocks or delays the page, failures silent.
  const galleryBeaconSent = useRef(false);
  const fireGalleryBeacon = (kind: 'open' | 'scroll') => {
    if (galleryBeaconSent.current) return;
    galleryBeaconSent.current = true;
    try {
      const body = JSON.stringify({ page: `/events/${slug}`, kind });
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
  useEffect(() => {
    if (lightboxIdx === null) return;
    fireGalleryBeacon('open');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightboxIdx, slug]);

  // Photo-row scroll beacon (Angelo, Oct 31, 2026): how many thumbnails
  // fit on screen depends on the visitor's screen, so nothing is counted
  // in thumbnails — after the row first paints, record the index of the
  // first thumbnail that starts completely off the row's right edge on
  // THIS screen. When a sideways scroll brings any part of that photo
  // (or a later one) into the row, the visitor has deliberately gone
  // looking at more photos: fire the same gallery beacon. If every photo
  // fits on screen there is nothing to scroll to and it never fires.
  const rowRef = useRef<HTMLDivElement | null>(null);
  const firstHiddenIdxRef = useRef<number | null>(null);
  useEffect(() => {
    if (!live || photos.length === 0) return;
    firstHiddenIdxRef.current = null;
    const measure = () => {
      const row = rowRef.current;
      if (!row) return;
      const rowRight = row.getBoundingClientRect().right;
      const thumbs = row.querySelectorAll('.photo-thumb');
      let firstHidden: number | null = null;
      thumbs.forEach((t, i) => {
        if (firstHidden === null && t.getBoundingClientRect().left >= rowRight - 1) {
          firstHidden = i;
        }
      });
      firstHiddenIdxRef.current = firstHidden;
    };
    const raf = requestAnimationFrame(measure);
    // A resize before any scroll re-bases the measurement on the new
    // screen size, so the trigger stays honest to what was on screen.
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, photos.length]);
  const onRowScroll = () => {
    if (galleryBeaconSent.current) return;
    const hiddenIdx = firstHiddenIdxRef.current;
    const row = rowRef.current;
    if (hiddenIdx === null || !row) return;
    const thumb = row.querySelectorAll('.photo-thumb')[hiddenIdx];
    if (!thumb) return;
    if (thumb.getBoundingClientRect().left < row.getBoundingClientRect().right - 1) {
      fireGalleryBeacon('scroll');
    }
  };

  const doUpload = async (tk: string, dataUrl: string) => {
    setError(null);
    setUploading(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/events/${encodeURIComponent(slug)}/photos`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tk}`,
          },
          body: JSON.stringify({ image_data: dataUrl }),
        },
      );
      if (res.status === 401) {
        // Session expired between page load and upload: re-run the gate.
        awaitingAuth.current = true;
        setShowPrompt(true);
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Upload failed (${res.status})`);
      }
      const photo = (await res.json()) as EventPhoto;
      setPhotos((prev) => [photo, ...prev]);
      setPending(null);
    } catch (e: any) {
      setError(e?.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  // Resume a gated upload as soon as sign-in completes.
  useEffect(() => {
    if (token && awaitingAuth.current && pending) {
      awaitingAuth.current = false;
      void doUpload(token, pending.dataUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, pending]);

  const onFile = async (file: File | undefined) => {
    if (inputRef.current) inputRef.current.value = '';
    if (!file) return;
    setError(null);
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    setPending({ dataUrl });
  };

  const stepLightbox = (dir: 1 | -1) => {
    setLightboxIdx((idx) => {
      if (idx === null) return idx;
      const next = idx + dir;
      return next < 0 || next >= photos.length ? idx : next;
    });
  };

  const onUploadClick = () => {
    if (!pending) return;
    if (!token) {
      // Not signed in: same "Sign In Required" prompt as the save star.
      awaitingAuth.current = true;
      setShowPrompt(true);
      return;
    }
    void doUpload(token, pending.dataUrl);
  };

  return (
    <section
      className={live ? 'photo-gallery photo-gallery-live' : 'photo-gallery'}
      aria-label="Event photos"
      id="photos"
    >
      <div className={live ? 'photo-header photo-header-live' : 'photo-header'}>
        <h2>{live ? 'Photos from this event' : 'Photos'}</h2>
        {live ? (
          photos.length > 0 && (
            <button
              type="button"
              className="view-all-link"
              onClick={() => setLightboxIdx(0)}
            >
              View all ({photos.length})
              <img src="/icons/icon-arrow-right.png" alt="" className="inline-icon" />
            </button>
          )
        ) : (
          <span className="photo-header-actions">
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
            >
              <img src="/icons/icon-camera.png" alt="" className="btn-icon" />
              Add a photo
            </button>
          </span>
        )}
      </div>
      {pending && (
        <div
          className="photo-pending"
          style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '12px 0' }}
        >
          <img
            src={pending.dataUrl}
            alt=""
            style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8 }}
          />
          <span style={{ flex: 1, fontSize: 14, color: '#444' }}>Photo ready to upload</span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onUploadClick}
            disabled={uploading}
          >
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setPending(null)}
            disabled={uploading}
          >
            Remove
          </button>
        </div>
      )}
      {photos.length > 0 ? (
        <div
          className={live ? 'photo-row' : 'photo-grid'}
          ref={live ? rowRef : undefined}
          onScroll={live ? onRowScroll : undefined}
        >
          {photos.map((p, i) => (
            <img
              key={p.id}
              src={`${API_BASE_URL}${p.url}`}
              alt={p.caption || 'Event photo'}
              className="photo-thumb"
              loading="lazy"
              onClick={() => setLightboxIdx(i)}
              style={{ cursor: 'zoom-in' }}
            />
          ))}
        </div>
      ) : (
        <div className="photo-empty-box">
          <img src="/icons/icon-image.png" alt="" className="photo-empty-icon" />
          <p>No photos yet.</p>
          <p className="photo-empty-sub">Be the first to add a photo of this event!</p>
        </div>
      )}
      {live && (
        <div className="photo-add-below">
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            <img src="/icons/icon-camera.png" alt="" className="btn-icon" />
            Add a photo
          </button>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="photo-input-hidden"
        onChange={(e) => onFile(e.target.files?.[0])}
        disabled={uploading}
        aria-label="Upload an event photo"
      />
      {uploading && <span className="photo-uploading">Uploading…</span>}
      {error && <p className="photo-error">{error}</p>}
      {showPrompt &&
        createPortal(
          <div
            className="signin-prompt-backdrop"
            onClick={() => {
              awaitingAuth.current = false;
              setShowPrompt(false);
            }}
          >
            <div className="signin-prompt-card" onClick={(e) => e.stopPropagation()}>
              <h2>Sign In Required</h2>
              <p>You must be signed in to perform this action.</p>
              <div className="signin-prompt-btns">
                <button
                  type="button"
                  className="signin-prompt-cancel"
                  onClick={() => {
                    awaitingAuth.current = false;
                    setShowPrompt(false);
                  }}
                >
                  CANCEL
                </button>
                <button
                  type="button"
                  className="signin-prompt-signin"
                  onClick={() => {
                    setShowPrompt(false);
                    openAuth('signup');
                  }}
                >
                  SIGN IN
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
      {lightboxIdx !== null && photos[lightboxIdx] && (
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
