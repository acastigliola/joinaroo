'use client';

import type { ReactNode } from 'react';

// "Listed by" source link with a click beacon (Angelo, Nov 1, 2026):
// the LISTED BY fact row links the source name to the event's own URL —
// the second door to the source, and the only outbound path left on an
// ended page once the details button expires. Fire-and-forget:
// sendBeacon never blocks or delays the click, failures silent. Same
// shape as DetailsButton's beacon so analytics can treat them alike.
export default function ListedByLink({
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
          '/api/track/listedby-click',
          new Blob([body], { type: 'application/json' }),
        );
      } else {
        fetch('/api/track/listedby-click', {
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
      className="fact-source-link"
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={fire}
    >
      {children}
    </a>
  );
}
