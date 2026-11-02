import Link from 'next/link';

type Tab = 'events' | 'saves' | 'search' | 'settings';

const TABS: { key: Tab; label: string; href: string; icon: string }[] = [
  {
    key: 'events',
    label: 'Events',
    href: '/',
    icon: 'M4 4h16v16H4z M4 9h16 M9 9v11',
  },
  {
    key: 'saves',
    label: 'My Saves',
    href: '/saves',
    icon: 'M12 2l2.9 6.26 6.6.57-5 4.36 1.5 6.45L12 16.9 5.99 19.64l1.5-6.45-5-4.36 6.6-.57z',
  },
  {
    key: 'search',
    label: 'Search',
    href: '/search',
    icon: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M21 21l-4.3-4.3',
  },
  {
    key: 'settings',
    label: 'Settings',
    href: '/settings',
    icon: 'M4 6h16 M4 12h16 M4 18h16',
  },
];

/** Bottom tab bar mirroring the mobile app. `qs` preserves location params. */
export default function MobileTabs({ active, qs }: { active: Tab; qs: string }) {
  return (
    <nav className="m-tabs" aria-label="Primary">
      {TABS.map((t) => {
        const href = t.key === 'events' ? `/${qs}` : `${t.href}${qs}`;
        return (
          <Link
            key={t.key}
            href={href}
            className={'m-tab' + (active === t.key ? ' m-tab-active' : '')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d={t.icon} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
