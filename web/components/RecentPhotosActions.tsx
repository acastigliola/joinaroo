'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { API_BASE_URL, type RecentPhotos as RecentPhotosData } from '../lib/api';
import { useAuth } from '../lib/auth';
import { PhotoLightbox, type EventPhoto } from './PhotoGallery';

/** Actions row under the recent-photos strip (Angelo, Oct 27): an
 * "Add a photo" button on the left — the same gated upload flow as the
 * event gallery, targeting THIS event — and "See recent photos" on the
 * right, which launches the gallery lightbox over the pooled photos
 * (credits included) instead of navigating away. */
export default function RecentPhotosActions({
  slug,
  photos,
}: {
  slug: string;
  photos: RecentPhotosData['photos'];
}) {
  const { token, openAuth } = useAuth();
  const router = useRouter();
  const [pending, setPending] = useState<{ dataUrl: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const awaitingAuth = useRef(false);

  const lightboxPhotos: EventPhoto[] = photos.map((p, i) => ({
    id: i,
    event_id: 0,
    url: p.url,
    caption: p.caption ?? null,
    created_at: '',
    source: p.source ?? null,
  }));

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
        awaitingAuth.current = true;
        setShowPrompt(true);
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Upload failed (${res.status})`);
      }
      setPending(null);
      // The event now has a photo of its own, so it leaves this listing
      // type — refresh and the page re-renders with its own gallery.
      router.refresh();
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

  const onUploadClick = () => {
    if (!pending) return;
    if (!token) {
      awaitingAuth.current = true;
      setShowPrompt(true);
      return;
    }
    void doUpload(token, pending.dataUrl);
  };

  const stepLightbox = (dir: 1 | -1) => {
    setLightboxIdx((idx) => {
      if (idx === null) return idx;
      const next = idx + dir;
      return next < 0 || next >= lightboxPhotos.length ? idx : next;
    });
  };

  return (
    <>
      <div className="recent-actions">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          <img src="/icons/icon-camera.png" alt="" className="btn-icon" />
          Add a photo
        </button>
        <button
          type="button"
          className="recent-see"
          onClick={() => setLightboxIdx(0)}
        >
          See recent photos
          <img
            src="/icons/icon-arrow-right.png"
            alt=""
            className="inline-icon"
          />
        </button>
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
