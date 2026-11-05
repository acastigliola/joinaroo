import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import LandingList, {
  LandingShell,
  SegmentNav,
  venueSlugMap,
} from '../../../components/LandingList';
import {
  CITY_BLURBS,
  SEGMENT_COPY,
  SEGMENTS,
  cityQualifies,
  etNowIso,
  fetchEvents,
  getLandingIndex,
  segmentQualifies,
  venueQualifies,
} from '../../../lib/landing';

export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ city: string }>;
}): Promise<Metadata> {
  const { city } = await params;
  const idx = await getLandingIndex();
  const ci = idx.cities.get(city);
  if (!ci || !cityQualifies(ci)) return { title: 'Events — Joinaroo' };
  const description = `Every upcoming event Joinaroo has found in ${ci.city}, Maine — concerts, games, shows, markets and community events, each with time, venue, price and tickets.`;
  return {
    title: `Events in ${ci.city}, Maine`,
    description,
    alternates: { canonical: `https://joinaroo.com/events-in/${ci.slug}` },
    openGraph: {
      title: `Events in ${ci.city}, Maine`,
      description,
      url: `https://joinaroo.com/events-in/${ci.slug}`,
      type: 'website',
    },
  };
}

export default async function CityPage({
  params,
}: {
  params: Promise<{ city: string }>;
}) {
  const { city } = await params;
  const idx = await getLandingIndex();
  const ci = idx.cities.get(city);
  if (!ci || !cityQualifies(ci)) notFound();

  const { events, total } = await fetchEvents({
    city: ci.city,
    from: etNowIso(),
  });
  const qualifiedSegs = SEGMENTS.filter((s) => segmentQualifies(ci, s)).map(
    (s) => ({ seg: s, name: SEGMENT_COPY[s].name }),
  );
  const venues = ci.venues.filter(venueQualifies);
  const intro = [
    CITY_BLURBS[ci.city] ||
      `${ci.city} is one of the Maine towns Joinaroo tracks every day — every event we find there, in one place.`,
    `Right now Joinaroo lists ${total} upcoming events in ${ci.city} at ${ci.venues.length} venues, soonest first${total > events.length ? ` — showing the soonest ${events.length}` : ''}. Each listing links to its full event page with tickets and details.`,
  ];
  return (
    <LandingShell
      crumbs={[
        { label: 'Joinaroo', href: '/' },
        { label: `Events in ${ci.city}, Maine` },
      ]}
      title={`Events in ${ci.city}, Maine`}
      intro={intro}
    >
      <SegmentNav
        citySlugPath={ci.slug}
        cityName={ci.city}
        qualified={qualifiedSegs}
      />
      <LandingList
        events={events}
        venueSlugById={venueSlugMap([...idx.venues.values()])}
      />
      {venues.length ? (
        <>
          <h2 className="lp-h2">Venues in {ci.city}</h2>
          <ul className="lp-venues">
            {venues.map((v) => (
              <li key={v.id}>
                <Link href={`/venues/${v.slug}`}>{v.name}</Link>
                {` — ${v.count} upcoming events`}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <p className="lp-foot">
        Browse all <Link href="/towns">Maine towns</Link> or{' '}
        <Link href="/categories">event categories</Link>.
      </p>
    </LandingShell>
  );
}
