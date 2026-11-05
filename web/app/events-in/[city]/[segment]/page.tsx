import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import LandingList, {
  LandingShell,
  SegmentNav,
  venueSlugMap,
} from '../../../../components/LandingList';
import {
  SEGMENT_COPY,
  SEGMENTS,
  cityQualifies,
  etNowIso,
  fetchEvents,
  getLandingIndex,
  segmentQualifies,
  weekendWindow,
} from '../../../../lib/landing';

export const revalidate = 3600;

type P = { params: Promise<{ city: string; segment: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { city, segment } = await params;
  const idx = await getLandingIndex();
  const ci = idx.cities.get(city);
  const copy = SEGMENT_COPY[segment];
  if (!ci || !copy || !cityQualifies(ci) || !segmentQualifies(ci, segment))
    return { title: 'Events — Joinaroo' };
  const heading = copy.heading(ci.city);
  const description = `${heading} — every listing Joinaroo has found, with date, time, venue, price and a link to the full event page.`;
  const url = `https://joinaroo.com/events-in/${ci.slug}/${segment}`;
  return {
    title: heading,
    description,
    alternates: { canonical: url },
    openGraph: { title: heading, description, url, type: 'website' },
  };
}

export default async function SegmentPage({ params }: P) {
  const { city, segment } = await params;
  const idx = await getLandingIndex();
  const ci = idx.cities.get(city);
  const copy = SEGMENT_COPY[segment];
  if (!ci || !copy || !cityQualifies(ci) || !segmentQualifies(ci, segment))
    notFound();

  const now = etNowIso();
  let query: Record<string, string>;
  let dataLine: string;
  if (segment === 'this-weekend') {
    const wk = weekendWindow();
    query = { city: ci.city, from: wk.from, to: wk.to };
    dataLine = `Showing ${copy.name.toLowerCase()} for ${wk.label} — ${ci.segments[segment]} events in ${ci.city}.`;
  } else if (segment === 'concerts') {
    query = { city: ci.city, category: 'on-stage', from: now };
    dataLine = `${ci.segments[segment]} stage events are coming up in ${ci.city}.`;
  } else if (segment === 'free') {
    query = { city: ci.city, free: 'true', from: now };
    dataLine = `${ci.segments[segment]} free events are coming up in ${ci.city}.`;
  } else {
    query = { city: ci.city, category: 'family-fun', from: now };
    dataLine = `${ci.segments[segment]} family events are coming up in ${ci.city}.`;
  }
  const { events } = await fetchEvents(query, 60);
  const qualifiedSegs = SEGMENTS.filter((s) => segmentQualifies(ci, s)).map(
    (s) => ({ seg: s, name: SEGMENT_COPY[s].name }),
  );
  return (
    <LandingShell
      crumbs={[
        { label: 'Joinaroo', href: '/' },
        { label: `Events in ${ci.city}, Maine`, href: `/events-in/${ci.slug}` },
        { label: copy.name },
      ]}
      title={copy.heading(ci.city)}
      intro={[copy.intro, dataLine]}
    >
      <SegmentNav
        citySlugPath={ci.slug}
        cityName={ci.city}
        qualified={qualifiedSegs}
        active={segment}
      />
      <LandingList
        events={events}
        venueSlugById={venueSlugMap([...idx.venues.values()])}
      />
    </LandingShell>
  );
}
