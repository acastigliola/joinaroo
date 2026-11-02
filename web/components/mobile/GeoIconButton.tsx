'use client';

import { useState } from 'react';

/** Icon-only button running the same geolocation flow as UseLocationButton. */
export default function GeoIconButton({
  keep,
  icon,
  label,
}: {
  keep: string;
  icon: string;
  label: string;
}) {
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
    <button
      type="button"
      className="m-iconbtn"
      onClick={onClick}
      disabled={busy}
      aria-label={label}
      title={label}
    >
      <img src={icon} alt="" className="m-section-icon" style={{ opacity: busy ? 0.5 : 1 }} />
    </button>
  );
}
