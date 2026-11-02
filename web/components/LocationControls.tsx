'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useRef, useState } from 'react';

interface Suggestion {
  label: string;
  lat: number;
  lng: number;
}

function withParams(
  sp: URLSearchParams,
  updates: Record<string, string | null>,
): string {
  const p = new URLSearchParams(sp.toString());
  for (const [k, v] of Object.entries(updates)) {
    if (v == null || v === '') p.delete(k);
    else p.set(k, v);
  }
  const s = p.toString();
  return s ? `/?${s}` : '/';
}

export default function LocationControls({
  currentLabel,
  located,
}: {
  currentLabel?: string;
  located: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [town, setTown] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function setLocation(lat: number, lng: number, label: string) {
    setSuggestions([]);
    setTown('');
    setError('');
    router.push(
      withParams(searchParams, {
        lat: String(lat),
        lng: String(lng),
        label,
        loc: null,
      }),
    );
  }

  async function onTownInput(v: string) {
    setTown(v);
    setError('');
    if (timer.current) clearTimeout(timer.current);
    if (v.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    timer.current = setTimeout(async () => {
      try {
        // Proxied through the Next.js route handler so the browser
        // never needs direct CORS access to the API backend.
        const res = await fetch(
          `/api/geocode?q=${encodeURIComponent(v.trim())}`,
        );
        if (res.ok) setSuggestions((await res.json()) as Suggestion[]);
      } catch {
        /* suggestions are best-effort */
      }
    }, 250);
  }

  async function submitTown(e: React.FormEvent) {
    e.preventDefault();
    const q = town.trim();
    if (!q) return;
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error('geocode failed');
      const list = (await res.json()) as Suggestion[];
      if (list[0]) setLocation(list[0].lat, list[0].lng, list[0].label);
      else setError(`No Maine town found for "${q}"`);
    } catch {
      setError('Could not look up that town');
    }
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported on this device');
      return;
    }
    setLocating(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setLocation(
          pos.coords.latitude,
          pos.coords.longitude,
          'Current location',
        );
      },
      () => {
        setLocating(false);
        setError('Could not get your location');
      },
      { timeout: 10000 },
    );
  }

  function clearLocation() {
    setError('');
    router.push(
      withParams(searchParams, {
        lat: null,
        lng: null,
        label: null,
        loc: 'off',
      }),
    );
  }

  return (
    <div className="location-controls">
      <button
        type="button"
        className="btn btn-secondary loc-btn"
        onClick={useMyLocation}
        disabled={locating}
      >
        {locating ? (
          'Locating…'
        ) : (
          <>
            <img src="/icons/icon-pin-red.png" alt="" className="loc-btn-pin" />
            Use my location
          </>
        )}
      </button>
      <form className="town-form" onSubmit={submitTown}>
        <span className="town-input-wrap">
          <img src="/icons/icon-pin-gray.png" alt="" className="town-pin" />
          <input
            type="text"
            className="town-input"
            placeholder={currentLabel || 'Portland, ME'}
            aria-label="Pick a Maine town"
            value={town}
            onChange={(e) => onTownInput(e.target.value)}
            list="town-suggestions"
            autoComplete="off"
          />
        </span>
        <datalist id="town-suggestions">
          {suggestions.map((s) => (
            <option key={s.label} value={s.label} />
          ))}
        </datalist>
        <button type="submit" className="btn btn-secondary">
          Set town
        </button>
      </form>
      {located && (
        <button type="button" className="btn-link" onClick={clearLocation}>
          Clear location
        </button>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
