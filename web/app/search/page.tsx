import SearchLive from '../../components/mobile/SearchLive';
import { first } from '../../components/mobile/MobileHome';
import { geocode, getEvents } from '../../lib/api';
import { radiusKmFor, sortByDayPartDistance } from '../../lib/mobile';

export const dynamic = 'force-dynamic';

type RawParams = { [key: string]: string | string[] | undefined };

/** Search tab — mirrors the mobile app's Search screen. The server
 *  resolves the URL's initial query (city geocode + first fetch) so the
 *  first paint matches a submitted search; SearchLive then takes over
 *  and updates results as the user types, like the app. */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<RawParams>;
}) {
  const sp = await searchParams;
  const q = first(sp.q)?.trim() || undefined;
  const city = first(sp.city)?.trim() || undefined;

  let lat = first(sp.lat);
  let lng = first(sp.lng);
  let label = first(sp.label);

  // Resolve the city field to coordinates (mirrors the app's city input).
  if (city && !(lat && lng)) {
    try {
      const r = await geocode(city);
      if (r[0]) {
        lat = String(r[0].lat);
        lng = String(r[0].lng);
        label = label || r[0].label;
      }
    } catch {
      /* leave unset */
    }
  }

  const searched = Boolean(q || city);
  let events: Awaited<ReturnType<typeof getEvents>>['events'] = [];
  let total = 0;
  let apiError = '';

  if (searched) {
    try {
      const res = await getEvents({
        q,
        lat,
        lng,
        radius_km: lat && lng ? radiusKmFor('25') : undefined,
        limit: '60',
      });
      events = sortByDayPartDistance(res.events);
      total = res.total;
    } catch {
      apiError = 'Could not reach the events service.';
    }
  }

  return (
    <div className="m-app">
      <SearchLive
        initialQ={q || ''}
        initialCity={city || ''}
        initialLat={lat}
        initialLng={lng}
        initialLabel={label}
        initialEvents={events}
        initialTotal={total}
        initialSearched={searched}
        initialError={apiError}
      />
    </div>
  );
}
