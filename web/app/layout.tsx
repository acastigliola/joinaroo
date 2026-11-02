import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Link from 'next/link';
import './globals.css';
import '../components/mobile/mobile.css';
import { AuthProvider } from '../lib/auth';
import AuthModal from '../components/AuthModal';
import HeaderAvatar from '../components/HeaderAvatar';
import MobileHeaderMenu, { HeaderSearchButton } from '../components/MobileHeaderMenu';
import TrackPageview from '../components/TrackPageview';

export const metadata: Metadata = {
  metadataBase: new URL('https://joinaroo.com'),
  title: {
    default: 'Joinaroo — Find local events near you',
    template: '%s | Joinaroo',
  },
  openGraph: {
    siteName: 'Joinaroo',
  },
  description:
    'Joinaroo — discover local events near you: live music, trivia, tech meetups, food, sports, theater and more.',
  other: {
    'impact-site-verification': '1e0b675c-c946-47bf-8556-c71bda01c1bd',
  },
  icons: {
    icon: '/favicon.png',
    apple: '/favicon.png',
  },
};

const inter = Inter({
  subsets: ['latin'],
  weight: ['700'],
  variable: '--font-inter',
});

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Header: logo left; right side shows the signed-in avatar, plus
  // mobile-only search + hamburger icons (Angelo, Oct 31 — the hamburger
  // menu carries Towns/Categories/My Saves/Sign in). Browse/Categories
  // nav links removed Oct 28.
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7543626142848052"
          crossOrigin="anonymous"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              name: 'Joinaroo',
              url: 'https://joinaroo.com/',
            }),
          }}
        />
      </head>
      <body>
        <AuthProvider>
          <header className="site-header">
          <nav className="nav">
            <Link className="brand" href="/">
              <img src="/joinaroo-logo-v2.png" alt="Joinaroo Local Events" className="brand-logo" />
            </Link>
            <div className="header-actions">
              <HeaderSearchButton />
              <HeaderAvatar />
              <MobileHeaderMenu />
            </div>
          </nav>
        </header>
        <main>{children}</main>
        <TrackPageview />
          <AuthModal />
        </AuthProvider>
      </body>
    </html>
  );
}
