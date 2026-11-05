'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Desktop detail-page share control (Spark spec round 2, Nov 4): the
 * share icon at the right of the chips row. It is a REAL share —
 * navigator.share where the platform offers it, falling back to
 * copying the event URL to the clipboard with a brief "Link copied"
 * note. Rendered only inside the desktop detail composition (.d-top),
 * which is hidden below desktop widths. (The spec's bookmark icon is
 * omitted on purpose: it would duplicate the hero heart + "Add to My
 * Saves" save controls already on the page.)
 */
export default function DesktopShare({
  title,
  url,
}: {
  title: string;
  url: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const onShare = async () => {
    const shareUrl = url.startsWith('http')
      ? url
      : `https://joinaroo.com${url}`;
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
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable — nothing sensible to fall back to */
    }
  };

  return (
    <button
      type="button"
      className="d-share-btn"
      onClick={onShare}
      aria-label="Share this event"
    >
      <svg
        width="20"
        height="20"
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
      {copied && (
        <span className="d-share-copied" role="status">
          Link copied
        </span>
      )}
    </button>
  );
}
