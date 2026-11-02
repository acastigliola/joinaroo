'use client';

import type { ReactNode } from 'react';

// "More Event Details" button with a click beacon (Angelo, Oct 31, 2026):
// fires a one-way beacon on click so analytics can join the click to the
// visitor's pageview trail — who arrived (e.g. from Google), opened an
// event, and clicked through to the source before leaving. Fire-and-
// forget: sendBeacon never blocks or delays the click, failures silent.
export default function DetailsButton({
  href,
  page,
  children,
}: {
  href: string;
  page: string;
  children: ReactNode;
}) {
  const fire = () => {
    try {
      const body = JSON.stringify({ page });
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        navigator.sendBeacon(
          '/api/track/details-click',
          new Blob([body], { type: 'application/json' }),
        );
      } else {
        fetch('/api/track/details-click', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          keepalive: true,
        }).catch(() => {});
      }
    } catch {}
  };
  return (
    <a
      className="btn"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={fire}
    >
      {children}
    </a>
  );
}
