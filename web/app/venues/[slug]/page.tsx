import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import LandingList, { LandingShell } from '../../../components/LandingList';
import {
  VENUE_BLURBS,
  cityQualifies,
  citySlug,
  etNowIso,
  fetchEvents,
  getLandingIndex,
  venueQualifies,
} from '../../../lib/landing';

export const revalidate = 3600;

type P = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { slug } = await params;
  const idx = await getLandingIndex();
  const vi = idx.venues.get(slug);
  if (!vi || !venueQualifies(vi)) return { title: 'Venues — Joinaroo' };
  const description = `Upcoming events at ${vi.name} in ${vi.city}, Maine — dates, times, prices and ticket links for every listing Joinaroo has found at this venue.`;
  const url = `https://joinaroo.com/venues/${vi.slug}`;
  return {
    title: `Events at ${vi.name} — ${vi.city}, Maine`,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: `Events at ${vi.name} — ${vi.city}, Maine`,
      description,
      url,
      type: 'website',
    },
  };
}

export default async function VenuePage({ params }: P) {
  const { slug } = await params;
  const idx = await getLandingIndex();
  const vi = idx.venues.get(slug);
  if (!vi || !venueQualifies(vi)) notFound();

  const { events, total } = await fetchEvents(
    { venue: vi.id, from: etNowIso() },
    60,
  );
  const ci = idx.cities.get(citySlug(vi.city));
  const cityOk = ci && cityQualifies(ci);
  const intro = [
    VENUE_BLURBS[vi.name] ||
      `${vi.name}${vi.address ? `, ${vi.address},` : ''} in ${vi.city}, Maine.`,
    `${total} upcoming events are listed at ${vi.name}, soonest first${total > events.length ? ` — showing the soonest ${events.length}` : ''} — each links to its full event page with tickets and details.`,
  ];
  return (
    <LandingShell
      crumbs={[
        { label: 'Joinaroo', href: '/' },
        ...(cityOk
          ? [
              {
                label: `Events in ${vi.city}, Maine`,
                href: `/events-in/${citySlug(vi.city)}`,
              },
            ]
          : []),
        { label: vi.name },
      ]}
      title={`Events at ${vi.name}`}
      intro={intro}
    >
      {vi.address ? (
        <p className="lp-fact">
          {vi.address} · {vi.city}, Maine
        </p>
      ) : null}
      <LandingList events={events} venueSlugById={new Map()} />
      {cityOk ? (
        <p className="lp-foot">
          See everything happening in{' '}
          <Link href={`/events-in/${citySlug(vi.city)}`}>
            {vi.city}, Maine
          </Link>
          .
        </p>
      ) : null}
    </LandingShell>
  );
}
