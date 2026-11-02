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
}: {
  initial: string;
  /** 'pill' = the desktop mockup header search (Angelo, Oct 29): a
   *  white rounded pill with a leading search icon and no button —
   *  Enter submits. Default keeps the input + Search button form. */
  variant?: 'pill';
  placeholder?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(initial);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    router.push(withParams(searchParams, { q: value.trim() || null }));
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
