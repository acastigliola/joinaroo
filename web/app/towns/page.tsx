import Link from 'next/link';
import MobileTabs from '../../components/mobile/MobileTabs';
import { geocode } from '../../lib/api';
import { MOBILE_TOWNS, isMobileUA } from '../../lib/mobile';
import { headers } from 'next/headers';

export const dynamic = 'force-dynamic';

/** Town picker — mirrors the mobile app's town list. */
export default async function TownsPage() {
  const ua = (await headers()).get('user-agent') || '';
  const mobile = isMobileUA(ua);

  const settled = await Promise.all(
    MOBILE_TOWNS.map((t) =>
      geocode(`${t}, ME`)
        .then((r) => (r.length > 0 ? r[0] : null))
        .catch(() => null),
    ),
  );

  const list = (
    <div className="m-app">
      <h1 className="m-pagetitle">Choose a Maine town</h1>
      {settled.map((r, i) =>
        r ? (
          <Link
            key={`${r.label}-${i}`}
            className="m-townrow"
            href={`/?lat=${r.lat}&lng=${r.lng}&label=${encodeURIComponent(r.label)}`}
          >
            {r.label}
          </Link>
        ) : null,
      )}
      <div style={{ height: 16 }} />
      <MobileTabs active="events" qs="" />
    </div>
  );

  if (!mobile) {
    // Desktop fallback: plain centered list using the same data.
    return list;
  }
  return list;
}
