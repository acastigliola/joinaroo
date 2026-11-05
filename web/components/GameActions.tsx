'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth, fetchServerSaves, serverSave, serverUnsave } from '../lib/auth';

const KEY = 'sme:saved-slugs:v1';
/** Save controls on one page (hero star + action-row button) keep in
 * sync through this window event: a toggle in one instance updates
 * every other instance for the same event without a reload. */
const SYNC_EVENT = 'sme:save-sync';

function StarIcon({ filled, size = 20 }: { filled: boolean; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
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

function ShareIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 15V4" />
      <path d="m7.5 8.5 4.5-4.5 4.5 4.5" />
      <path d="M5 13v6a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-6" />
    </svg>
  );
}

function CalendarIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

/**
 * Save control for the desktop GAME detail layout (Spark game spec,
 * Nov 4): the same mechanism as SaveStar/DesktopSave (server-backed
 * when signed in; the same "Sign In Required" prompt when not),
 * rendered in the game layout's three shapes — the 44px glass circle
 * on the hero, the labeled 180x52 "Save Event" row button, and the
 * 52x52 icon button in the upcoming-games row.
 */
export function GameSaveButton({
  slug,
  eventId,
  variant,
}: {
  slug: string;
  eventId: number;
  variant: 'hero' | 'row' | 'icon';
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

  // Keep sibling save controls for this event in sync.
  useEffect(() => {
    const onSync = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d && d.slug === slug && typeof d.saved === 'boolean') {
        setSaved(d.saved);
      }
    };
    window.addEventListener(SYNC_EVENT, onSync);
    return () => window.removeEventListener(SYNC_EVENT, onSync);
  }, [slug]);

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
      const next = !saved;
      setSaved(next);
      window.dispatchEvent(
        new CustomEvent(SYNC_EVENT, { detail: { slug, saved: next } }),
      );
    } catch {
      /* keep current state */
    }
  };

  const cls =
    variant === 'hero'
      ? 'dg-glass-btn'
      : variant === 'row'
        ? 'dg-btn-dark dg-btn-save'
        : 'dg-btn-dark dg-btn-icon';
  return (
    <>
      <button
        type="button"
        className={cls + (saved ? ' dg-saved' : '')}
        onClick={toggle}
        aria-label={saved ? 'Remove from saves' : 'Save this event'}
        aria-pressed={saved}
      >
        <StarIcon filled={saved} size={variant === 'hero' ? 20 : 18} />
        {variant === 'row' && <span>{saved ? 'Saved' : 'Save Event'}</span>}
      </button>
      {showPrompt &&
        createPortal(
          <div className="signin-prompt-backdrop" onClick={() => setShowPrompt(false)}>
            <div className="signin-prompt-card" onClick={(e) => e.stopPropagation()}>
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

/**
 * Share control for the game layout — a REAL share (navigator.share,
 * clipboard fallback with a "Link copied" note), same behavior as
 * DesktopShare, in the game layout's hero/row/icon shapes.
 */
export function GameShareButton({
  title,
  url,
  variant,
}: {
  title: string;
  url: string;
  variant: 'hero' | 'row' | 'icon';
}) {
  const [copied, setCopied] = useState(false);

  const onShare = async () => {
    const shareUrl = url.startsWith('http') ? url : `https://joinaroo.com${url}`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title, url: shareUrl });
      } catch {
        /* user dismissed the share sheet */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable — nothing sensible to fall back to */
    }
  };

  const cls =
    variant === 'hero'
      ? 'dg-glass-btn'
      : variant === 'row'
        ? 'dg-btn-dark dg-btn-share'
        : 'dg-btn-dark dg-btn-icon';
  return (
    <button
      type="button"
      className={cls}
      onClick={onShare}
      aria-label="Share this event"
    >
      <ShareIcon size={variant === 'hero' ? 20 : 18} />
      {variant === 'row' && <span>Share</span>}
      {copied && (
        <span className="d-share-copied" role="status">
          Link copied
        </span>
      )}
    </button>
  );
}

function icsEscape(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function icsUtc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * "Add to My Calendar" for the game layout — REAL (Angelo's standing
 * rule: no placeholder buttons). Generates an .ics file from the
 * event's own data (title, start/end, venue, page URL) and downloads
 * it client-side.
 */
export function GameCalendarButton({
  slug,
  title,
  startsAt,
  endsAt,
  location,
  variant,
}: {
  slug: string;
  title: string;
  startsAt: string;
  endsAt?: string | null;
  location?: string | null;
  variant: 'primary' | 'dark';
}) {
  const onClick = () => {
    const start = new Date(startsAt);
    const end = endsAt
      ? new Date(endsAt)
      : new Date(start.getTime() + 2 * 3600 * 1000);
    const pageUrl = `https://joinaroo.com/events/${slug}`;
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Joinaroo//Events//EN',
      'BEGIN:VEVENT',
      `UID:${slug}@joinaroo.com`,
      `DTSTAMP:${icsUtc(new Date())}`,
      `DTSTART:${icsUtc(start)}`,
      `DTEND:${icsUtc(end)}`,
      `SUMMARY:${icsEscape(title)}`,
      ...(location ? [`LOCATION:${icsEscape(location)}`] : []),
      `DESCRIPTION:${icsEscape(`Event page: ${pageUrl}`)}`,
      `URL:${pageUrl}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ];
    const blob = new Blob([lines.join('\r\n')], {
      type: 'text/calendar;charset=utf-8',
    });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = `${slug}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 4000);
  };

  return (
    <button
      type="button"
      className={variant === 'primary' ? 'dg-btn-primary dg-btn-cal' : 'dg-btn-dark dg-btn-cal-dark'}
      onClick={onClick}
    >
      <CalendarIcon size={18} />
      <span>Add to My Calendar</span>
    </button>
  );
}
