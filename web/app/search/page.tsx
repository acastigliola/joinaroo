import EventCard from '../../components/EventCard';
import MobileTabs from '../../components/mobile/MobileTabs';
import { first } from '../../components/mobile/MobileHome';
import { geocode, getEvents } from '../../lib/api';
import { radiusKmFor, sortByDayPartDistance } from '../../lib/mobile';

export const dynamic = 'force-dynamic';

type RawParams = { [key: string]: string | string[] | undefined };

/** Search tab replica — mirrors the mobile app's Search screen. */
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

  const keepQs = (() => {
    const p = new URLSearchParams();
    if (lat && lng) {
      p.set('lat', lat);
      p.set('lng', lng);
    }
    if (label) p.set('label', label);
    const s = p.toString();
    return s ? `?${s}` : '';
  })();

  return (
    <div className="m-app">
      <form className="m-searchbox" action="/search" method="get">
        <input
          className="m-input"
          type="search"
          name="q"
          placeholder="Search events by name…"
          defaultValue={q || ''}
          autoComplete="off"
        />
        <input
          className="m-input"
          type="text"
          name="city"
          placeholder="City (e.g. Portland)"
          defaultValue={city || ''}
          autoComplete="off"
        />
        {lat && lng ? (
          <>
            <input type="hidden" name="lat" value={lat} />
            <input type="hidden" name="lng" value={lng} />
          </>
        ) : null}
        {label ? <input type="hidden" name="label" value={label} /> : null}
        <button className="m-btn" type="submit">
          Search
        </button>
      </form>

      {apiError ? (
        <p className="m-empty" role="alert">
          {apiError}
        </p>
      ) : searched ? (
        <>
          <h2 className="m-section-title">
            {total} result{total === 1 ? '' : 's'}
            {label ? ` near ${label}` : ''}
          </h2>
          {events.length === 0 ? (
            <p className="m-empty">No events found. Try another search.</p>
          ) : (
            <div className="m-list">
              {events.map((e) => (
                <EventCard key={e.slug} event={e} />
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="m-empty">Search by event name, optionally near a city.</p>
      )}

      <MobileTabs active="search" qs={keepQs} />
    </div>
  );
}
