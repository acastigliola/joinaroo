'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import SearchBar from './SearchBar';
import HeaderAvatar from './HeaderAvatar';
import { useAuth } from '../lib/auth';

/**
 * Desktop homepage header from Angelo's mockup (Oct 29): navy band,
 * logo left, search pill center, location pill, My Saves, and a blue
 * Sign in button (the avatar when signed in). Rendered only by the
 * desktop homepage, which hides the shared site header; every other
 * page keeps the standard header.
 */
export default function DesktopHomeHeader({
  label,
  searchInitial,
}: {
  label?: string;
  searchInitial?: string;
}) {
  const { user, authReady, openAuth } = useAuth();
  return (
    <header className="d-header">
      <div className="d-header-in">
        <Link className="brand" href="/">
          <img
            src="/joinaroo-logo-v2.png"
            alt="Joinaroo Local Events"
            className="brand-logo"
          />
          {/* Neon lockup cut from Angelo's mockup sheet (Nov 4): shown
              only at desktop widths by CSS; the standard logo keeps
              every narrower rendering unchanged. */}
          <img
            src="/neon/logo-lockup.png"
            alt="Joinaroo Local Events"
            className="brand-logo-neon"
          />
        </Link>
        <nav className="d-nav" aria-label="Primary">
          <Link className="d-nav-link d-nav-active" href="/">
            Events
          </Link>
          <Link className="d-nav-link" href="/towns">
            Venues
          </Link>
          <Link className="d-nav-link" href="/search">
            Artists
          </Link>
          <Link className="d-nav-link" href="/events-in/portland-me">
            Explore
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
          </Link>
        </nav>
        <div className="d-header-search">
          <Suspense>
            <SearchBar initial={searchInitial || ''} variant="pill" />
          </Suspense>
        </div>
        <a className="d-loc-pill" href="#d-location">
          <img src="/icons/icon-pin-red.png" alt="" className="d-loc-pin" />
          <span>{label || 'Portland, ME'}</span>
          <svg
            className="d-loc-caret"
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
        <Link className="d-saves" href="/saves">
          <svg
            width="21"
            height="21"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M12 20.5C7 16.5 3.5 13.2 3.5 9.3 3.5 6.4 5.7 4.5 8.2 4.5c1.5 0 3 .8 3.8 2.1.8-1.3 2.3-2.1 3.8-2.1 2.5 0 4.7 1.9 4.7 4.8 0 3.9-3.5 7.2-8.5 11.2z"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinejoin="round"
            />
          </svg>
          <span>My Saves</span>
        </Link>
        {authReady && user ? (
          <HeaderAvatar />
        ) : (
          <button
            type="button"
            className="d-signin"
            onClick={() => openAuth('login')}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <circle cx="12" cy="8" r="4" fill="currentColor" />
              <path
                d="M4 20.5c1.2-3.6 4.3-5.4 8-5.4s6.8 1.8 8 5.4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <span>Sign in</span>
          </button>
        )}
      </div>
    </header>
  );
}
