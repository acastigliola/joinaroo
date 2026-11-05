'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth, fetchServerSaves, serverSave, serverUnsave } from '../lib/auth';

const KEY = 'sme:saved-slugs:v1';

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill={filled ? '#ffb300' : 'none'}
      aria-hidden="true"
    >
      <path
        d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
        stroke={filled ? '#ffb300' : 'currentColor'}
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Desktop detail-page save controls (Angelo's detail mockup, Nov 4):
 * the star overlay on the hero poster + the outlined "Add to My Saves"
 * button beside the tickets CTA. One component, one saved state, both
 * controls — the save mechanism is SaveStar's exactly (server-backed
 * when signed in; the same "Sign In Required" prompt when not). Rendered
 * only inside the desktop detail composition (.d-top), which is hidden
 * below desktop widths where the page's bare SaveStar remains the
 * control.
 */
export default function DesktopSave({
  slug,
  eventId,
}: {
  slug: string;
  eventId: number;
}) {
  const { token, authReady, openAuth } = useAuth();
  const [saved, setSaved] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    if (!authReady) return;
    if (token) {
      fetchServerSaves(token)
        .then((r) => setSaved(r.saves.some((e: any) => Number(e.id) === eventId)))
        .catch(() => {});
    } else {
      try {
        const raw = localStorage.getItem(KEY);
        const arr = raw ? JSON.parse(raw) : [];
        setSaved(Array.isArray(arr) && arr.includes(slug));
      } catch {
        setSaved(false);
      }
    }
  }, [slug, eventId, token, authReady]);

  const toggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!token) {
      setShowPrompt(true);
      return;
    }
    try {
      if (saved) {
        await serverUnsave(token, eventId);
      } else {
        await serverSave(token, eventId);
      }
      setSaved(!saved);
    } catch {
      /* keep current state */
    }
  };

  return (
    <>
      <button
        type="button"
        className={'d-save-heart' + (saved ? ' d-save-heart-saved' : '')}
        onClick={toggle}
        aria-label={saved ? 'Remove from saves' : 'Save this event'}
        aria-pressed={saved}
      >
        <StarIcon filled={saved} />
      </button>
      <button
        type="button"
        className={'d-save-btn' + (saved ? ' d-save-btn-saved' : '')}
        onClick={toggle}
        aria-pressed={saved}
      >
        <StarIcon filled={saved} />
        <span>{saved ? 'Saved' : 'Add to My Saves'}</span>
      </button>
      {showPrompt && createPortal(
        <div className="signin-prompt-backdrop" onClick={() => setShowPrompt(false)}>
          <div className="signin-prompt-card" onClick={(e) => e.stopPropagation()}>
            <h2>Sign In Required</h2>
            <p>You must be signed in to perform this action.</p>
            <div className="signin-prompt-btns">
              <button type="button" className="signin-prompt-cancel" onClick={() => setShowPrompt(false)}>
                CANCEL
              </button>
              <button
                type="button"
                className="signin-prompt-signin"
                onClick={() => {
                  setShowPrompt(false);
                  openAuth('signup', eventId);
                }}
              >
                SIGN IN
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
