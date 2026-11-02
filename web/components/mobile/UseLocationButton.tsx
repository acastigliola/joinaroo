'use client';

import { useState } from 'react';

/** "Use my location" — browser geolocation, then reload with lat/lng params. */
export default function UseLocationButton({ keep }: { keep: string }) {
  const [busy, setBusy] = useState(false);

  const onClick = () => {
    if (!navigator.geolocation) return;
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = new URLSearchParams(keep);
        p.set('lat', String(pos.coords.latitude));
        p.set('lng', String(pos.coords.longitude));
        p.set('label', 'Your location');
        p.delete('loc');
        window.location.href = `/?${p.toString()}`;
      },
      () => setBusy(false),
      { timeout: 10000 },
    );
  };

  return (
    <button className="m-locbtn" onClick={onClick} disabled={busy}>
      {busy ? (
        '…'
      ) : (
        <>
          <img src="/icons/icon-crosshair.png" alt="" className="m-locbtn-icon" />
          Use my location
        </>
      )}
    </button>
  );
}
