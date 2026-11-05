'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

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

export default function SearchBar({
  initial,
  variant,
  placeholder,
  locationLabel,
}: {
  initial: string;
  /** 'pill' = the desktop mockup header search (Angelo, Oct 29): a
   *  white rounded pill with a leading search icon and no button —
   *  Enter submits. 'hero' = the neon desktop homepage hero search
   *  (Angelo, Nov 4): white pill with the location jump-link inside,
   *  plus a gradient "Find Events" submit button beside it. Default
   *  keeps the input + Search button form. */
  variant?: 'pill' | 'hero';
  placeholder?: string;
  /** Hero variant only: label for the in-bar location jump-link. */
  locationLabel?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(initial);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    router.push(withParams(searchParams, { q: value.trim() || null }));
  }

  if (variant === 'hero') {
    return (
      <form className="search-hero" onSubmit={submit} role="search">
        <div className="search-hero-bar">
          <img src="/icons/icon-search.png" alt="" className="search-pill-icon" />
          <input
            type="search"
            className="search-hero-input"
            placeholder={placeholder || 'Search events, venues, artists...'}
            aria-label="Search events"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <span className="search-hero-div" aria-hidden="true" />
          <a className="search-hero-loc" href="#d-location">
            <img src="/icons/icon-pin-gray.png" alt="" className="search-hero-pin" />
            <span>{locationLabel || 'Portland, ME'}</span>
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M6 9l6 6 6-6"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
        </div>
        <button type="submit" className="search-hero-btn">
          Find Events <span aria-hidden="true">→</span>
        </button>
      </form>
    );
  }

  if (variant === 'pill') {
    return (
      <form className="search-pill" onSubmit={submit} role="search">
        <img src="/icons/icon-search.png" alt="" className="search-pill-icon" />
        <input
          type="search"
          className="search-pill-input"
          placeholder={placeholder || 'Search events, venues, artists...'}
          aria-label="Search events"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </form>
    );
  }

  return (
    <form className="search-form" onSubmit={submit} role="search">
      <input
        type="search"
        className="search-input"
        placeholder="Search events…"
        aria-label="Search events"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button type="submit" className="btn">
        Search
      </button>
    </form>
  );
}
