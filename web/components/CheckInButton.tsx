'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth, fetchServerSaves, serverSave, serverUnsave } from '../lib/auth';

/** "I'm going — check in" button on an event-listing-with-photos page
 * (Angelo's mockup, Oct 27). There is no separate check-in backend yet:
 * going = saving the event — the same server-backed save the star uses,
 * with the same sign-in gate and prompt. The label stays the mockup's
 * in both states. */
export default function CheckInButton({ eventId }: { eventId: number }) {
  const { token, authReady, openAuth } = useAuth();
  const [saved, setSaved] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    if (!authReady || !token) return;
    fetchServerSaves(token)
      .then((r) => setSaved(r.saves.some((e: any) => Number(e.id) === eventId)))
      .catch(() => {});
  }, [token, authReady, eventId]);

  const toggle = async () => {
    if (!token) {
      // Not signed in: same "Sign In Required" prompt as the save star.
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
        className={'checkin-btn' + (saved ? ' checkin-btn-on' : '')}
        onClick={toggle}
        aria-pressed={saved}
      >
        <img src="/icons/icon-pin-white.png" alt="" className="checkin-btn-icon" />
        I&apos;m going — check in
      </button>
      {showPrompt &&
        createPortal(
          <div
            className="signin-prompt-backdrop"
            onClick={() => setShowPrompt(false)}
          >
            <div
              className="signin-prompt-card"
              onClick={(e) => e.stopPropagation()}
            >
              <h2>Sign In Required</h2>
              <p>You must be signed in to perform this action.</p>
              <div className="signin-prompt-btns">
                <button
                  type="button"
                  className="signin-prompt-cancel"
                  onClick={() => setShowPrompt(false)}
                >
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
          document.body,
        )}
    </>
  );
}
