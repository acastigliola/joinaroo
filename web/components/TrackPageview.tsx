'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

export default function TrackPageview() {
  const pathname = usePathname();
  useEffect(() => {
    try {
      fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page: pathname, referrer: document.referrer || null }),
        keepalive: true,
      }).catch(() => {});
    } catch {}
  }, [pathname]);
  return null;
}
