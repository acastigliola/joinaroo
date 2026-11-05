import Link from 'next/link';
import type { EventItem } from '../lib/api';
import {
  absImage,
  eventDateLabel,
  eventTimeLabel,
  priceLine,
  shortDesc,
  type VenueInfo,
} from '../lib/landing';

/** Server-rendered listing list for the landing pages: every row carries
 * the full crawlable facts (title, date, time, venue, summary, price)
 * as plain HTML with a link to the event page — no client JS involved. */
export default function LandingList({
  events,
  venueSlugById,
}: {
  events: EventItem[];
  venueSlugById: Map<string, string>;
}) {
  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: events.map((e, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `https://joinaroo.com/events/${e.slug}`,
    })),
  };
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }}
      />
      <ul className="lp-list">
        {events.map((e) => {
          const img = absImage(e);
          const vSlug = e.venue
            ? venueSlugById.get(String(e.venue.id))
            : undefined;
          return (
            <li className="lp-row" key={e.id}>
              {img ? (
                <img
                  className="lp-thumb"
                  src={img}
                  alt={e.title}
                  loading="lazy"
                  width={112}
                  height={84}
                />
              ) : null}
              <div className="lp-main">
                <h2 className="lp-title">
                  <Link href={`/events/${e.slug}`}>{e.title}</Link>
                </h2>
                <p className="lp-when">
                  {eventDateLabel(e.starts_at)} · {eventTimeLabel(e.starts_at)}
                </p>
                {e.venue ? (
                  <p className="lp-venue">
                    {vSlug ? (
                      <Link href={`/venues/${vSlug}`}>{e.venue.name}</Link>
                    ) : (
                      e.venue.name
                    )}
                    {` · ${e.venue.city}, Maine`}
                  </p>
                ) : null}
                <p className="lp-desc">{shortDesc(e)}</p>
                <p className="lp-price">{priceLine(e)}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function venueSlugMap(venues: VenueInfo[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const v of venues) m.set(v.id, v.slug);
  return m;
}

/** Shared page furniture for landing pages: breadcrumb, H1, intro. */
export function LandingShell({
  crumbs,
  title,
  intro,
  children,
}: {
  crumbs: { label: string; href?: string }[];
  title: string;
  intro: string[];
  children: React.ReactNode;
}) {
  return (
    <main className="lp-wrap">
      <nav className="lp-crumbs" aria-label="Breadcrumb">
        {crumbs.map((c, i) => (
          <span key={i}>
            {i > 0 ? <span className="lp-crumbsep"> / </span> : null}
            {c.href ? <Link href={c.href}>{c.label}</Link> : c.label}
          </span>
        ))}
      </nav>
      <h1 className="lp-h1">{title}</h1>
      {intro.map((p, i) => (
        <p className="lp-intro" key={i}>
          {p}
        </p>
      ))}
      {children}
    </main>
  );
}

/** Sibling-segment chips on city pages (only segments that qualify). */
export function SegmentNav({
  citySlugPath,
  cityName,
  qualified,
  active,
}: {
  citySlugPath: string;
  cityName: string;
  qualified: { seg: string; name: string }[];
  active?: string;
}) {
  return (
    <nav className="lp-segnav" aria-label="Browse by kind">
      <Link
        className={active ? 'lp-seg' : 'lp-seg lp-seg--on'}
        href={`/events-in/${citySlugPath}`}
      >
        All events in {cityName}
      </Link>
      {qualified.map((q) => (
        <Link
          key={q.seg}
          className={active === q.seg ? 'lp-seg lp-seg--on' : 'lp-seg'}
          href={`/events-in/${citySlugPath}/${q.seg}`}
        >
          {q.name}
        </Link>
      ))}
    </nav>
  );
}
