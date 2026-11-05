import {
  SEGMENTS,
  SEGMENT_COPY,
  cityQualifies,
  getLandingIndex,
  segmentQualifies,
  venueQualifies,
} from '../../lib/landing';

// llms.txt (Angelo, Nov 4): a plain-text map of the site for language
// models. Generated from the same qualification index as the sitemap, so
// every link in it is a live page with real listings — never a stub —
// and it refreshes on the same hourly cadence as the landing pages.
export const revalidate = 3600;

const SITE = 'https://joinaroo.com';

export async function GET() {
  const idx = await getLandingIndex();
  const cities = [...idx.cities.values()]
    .filter(cityQualifies)
    .sort((a, b) => b.count - a.count);
  const venues = [...idx.venues.values()]
    .filter(venueQualifies)
    .sort((a, b) => b.count - a.count);

  const lines: string[] = [
    '# Joinaroo',
    '',
    '> Joinaroo is an event discovery site for Maine. It lists concerts, sports, theater, comedy, festivals, markets, classes and community events across the state — with the deepest coverage in Portland and Orono — and links every listing to its original source for tickets and details.',
    '',
    'Joinaroo sweeps venue, organizer and community sources daily, so listings carry current dates, times, venues, prices and ticket links. Each event page states its status (scheduled, postponed or cancelled), shows when it was last updated, and carries Schema.org Event structured data. Listings marked live also show real photos taken inside the event by attendees.',
    '',
    '## Event listings by city',
    '',
    ...cities.map(
      (ci) =>
        `- [Events in ${ci.city}, Maine](${SITE}/events-in/${ci.slug}): ${ci.count} upcoming events at ${ci.venues.length} venues`,
    ),
    '',
    '## This weekend, concerts, free and family events',
    '',
  ];
  for (const ci of cities) {
    for (const seg of SEGMENTS) {
      if (!segmentQualifies(ci, seg)) continue;
      lines.push(
        `- [${SEGMENT_COPY[seg].heading(ci.city)}](${SITE}/events-in/${ci.slug}/${seg}): ${ci.segments[seg]} events`,
      );
    }
  }
  lines.push(
    '',
    '## Venues',
    '',
    ...venues.map(
      (vi) =>
        `- [${vi.name} — ${vi.city}, Maine](${SITE}/venues/${vi.slug}): ${vi.count} upcoming events`,
    ),
    '',
    '## Browse',
    '',
    `- [Joinaroo home](${SITE}/): featured, today, this weekend and nearby events across Maine`,
    `- [Maine towns](${SITE}/towns): every town Joinaroo tracks`,
    `- [Event categories](${SITE}/categories): concerts, game day, family fun, food, learning and more`,
    `- [Sitemap](${SITE}/sitemap.xml): every event, city and venue page on the site`,
    '',
    '## Optional',
    '',
    `- [Privacy policy](${SITE}/privacy)`,
    `- [Terms](${SITE}/terms)`,
    '',
  );
  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
