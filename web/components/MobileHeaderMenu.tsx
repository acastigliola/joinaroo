'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../lib/auth';

/** Mobile-only header search shortcut — same destination as the Search tab.
 *  Added with the hamburger menu (Angelo, Oct 31, 2026). Hidden on desktop
 *  via the .h-iconbtn media rule in globals.css. */
export function HeaderSearchButton() {
  return (
    <Link href="/search" className="h-iconbtn" aria-label="Search events">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path
          d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M21 21l-4.3-4.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Link>
  );
}

/** Mobile-only hamburger button + dropdown menu: Towns, Categories,
 *  My Saves, and the account item (Sign in when signed out, which opens
 *  the auth modal; My profile when signed in). */
export default function MobileHeaderMenu() {
  const { user, openAuth } = useAuth();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <>
      <button
        type="button"
        className="h-iconbtn"
        aria-label="Menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 6h16 M4 12h16 M4 18h16" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <>
          <div className="m-headmenu-backdrop" onClick={close} />
          <div className="m-headmenu" role="menu">
            <Link href="/towns" onClick={close}>
              Towns
            </Link>
            <Link href="/" onClick={close}>
              Events
            </Link>
            <Link href="/saves" onClick={close}>
              My Saves
            </Link>
            {user ? (
              <Link href={`/u/${user.username}`} onClick={close}>
                My profile
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => {
                  close();
                  openAuth();
                }}
              >
                Sign in
              </button>
            )}
          </div>
        </>
      )}
    </>
  );
}
