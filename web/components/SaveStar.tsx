'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth, fetchServerSaves, serverSave, serverUnsave } from '../lib/auth';

const KEY = 'sme:saved-slugs:v1';

/** Star toggle for event cards. Server-backed when signed in; shows a
 * "Sign In Required" prompt when not, then opens the auth overlay. */
export default function SaveStar({ slug, eventId, bare }: { slug: string; eventId: number; bare?: boolean }) {
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
      // Not signed in: show the "Sign In Required" prompt first.
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
        className={'save-star' + (saved ? ' save-star-saved' : '') + (bare ? ' save-star-bare' : '')}
        onClick={toggle}
        aria-label={saved ? 'Remove from saves' : 'Save this event'}
        aria-pressed={saved}
      >
        {bare ? (
          <img src="/icons/icon-star-outline.png" alt="" className="save-star-img" />
        ) : saved ? '★' : '☆'}
      </button>
      {/* Portaled to document.body: the event card gets a CSS transform on
          hover, which would otherwise trap this fixed overlay inside the card. */}
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
