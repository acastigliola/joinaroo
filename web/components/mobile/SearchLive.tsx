'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import EventCard from '../EventCard';
import MobileTabs from './MobileTabs';
import { geocode, getEvents, type EventItem } from '../../lib/api';
import { radiusKmFor, sortByDayPartDistance } from '../../lib/mobile';

interface Loc {
  lat?: string;
  lng?: string;
  label?: string;
}

/** Live search — mirrors the mobile app's Search screen (Angelo, Nov 5):
 *  results update as the user types (450ms debounce, the app's exact
 *  timing), with the app's state flow: spinner while searching, result
 *  count, "no events match" empty state, error with Retry, and a hint
 *  before the first search. The server page hands over the initial
 *  (URL-driven) results so first paint matches the old submit flow;
 *  typing takes over from there. Same query semantics as the old page:
 *  the city field geocodes to a 25 mi radius, and the tab-carried
 *  location applies when the city field is empty. */
export default function SearchLive({
  initialQ,
  initialCity,
  initialLat,
  initialLng,
  initialLabel,
  initialEvents,
  initialTotal,
  initialSearched,
  initialError,
}: {
  initialQ: string;
  initialCity: string;
  initialLat?: string;
  initialLng?: string;
  initialLabel?: string;
  initialEvents: EventItem[];
  initialTotal: number;
  initialSearched: boolean;
  initialError: string;
}) {
  const baseLoc: Loc = { lat: initialLat, lng: initialLng, label: initialLabel };

  const [q, setQ] = useState(initialQ);
  const [city, setCity] = useState(initialCity);
  const [results, setResults] = useState<EventItem[]>(initialEvents);
  const [total, setTotal] = useState(initialTotal);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(initialSearched);
  const [error, setError] = useState<string | null>(initialError || null);
  const [loc, setLoc] = useState<Loc>(baseLoc);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstRun = useRef(true);
  const reqId = useRef(0);
  const locRef = useRef<Loc>(baseLoc);
  const baseLocRef = useRef<Loc>(baseLoc);
  // The city string the current loc was geocoded from ('' = base loc).
  const geoForRef = useRef(initialCity || '');

  const syncUrl = useCallback((qText: string, cityText: string, l: Loc) => {
    const p = new URLSearchParams();
    if (qText) p.set('q', qText);
    if (cityText) p.set('city', cityText);
    if (l.lat && l.lng) {
      p.set('lat', l.lat);
      p.set('lng', l.lng);
    }
    if (l.label) p.set('label', l.label);
    const s = p.toString();
    const target = s ? `/search?${s}` : '/search';
    if (window.location.pathname + window.location.search !== target) {
      window.history.replaceState(null, '', target);
    }
  }, []);

  const runSearch = useCallback(
    async (text: string, cityText: string) => {
      const query = text.trim();
      const cityQ = cityText.trim();
      if (!query && !cityQ) {
        reqId.current += 1;
        setResults([]);
        setTotal(0);
        setSearched(false);
        setError(null);
        setSearching(false);
        syncUrl('', '', locRef.current);
        return;
      }
      const myReq = ++reqId.current;
      setSearching(true);
      setError(null);
      try {
        let l = locRef.current;
        if (cityQ) {
          if (geoForRef.current !== cityQ) {
            geoForRef.current = cityQ;
            try {
              const r = await geocode(cityQ);
              l = r[0]
                ? {
                    lat: String(r[0].lat),
                    lng: String(r[0].lng),
                    label: r[0].label,
                  }
                : {};
            } catch {
              l = {};
            }
            locRef.current = l;
            setLoc(l);
          }
        } else if (geoForRef.current !== '') {
          geoForRef.current = '';
          l = baseLocRef.current;
          locRef.current = l;
          setLoc(l);
        }
        const res = await getEvents({
          q: query || undefined,
          lat: l.lat,
          lng: l.lng,
          radius_km: l.lat && l.lng ? radiusKmFor('25') : undefined,
          limit: '60',
        });
        if (reqId.current !== myReq) return;
        setResults(sortByDayPartDistance(res.events));
        setTotal(res.total);
        setSearched(true);
        syncUrl(query, cityQ, l);
      } catch {
        if (reqId.current !== myReq) return;
        setError('Could not reach the events service.');
      } finally {
        if (reqId.current === myReq) setSearching(false);
      }
    },
    [syncUrl],
  );

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => runSearch(q, city), 450);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q, city, runSearch]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (timer.current) clearTimeout(timer.current);
    runSearch(q, city);
  }

  const tabsQs = (() => {
    const p = new URLSearchParams();
    if (loc.lat && loc.lng) {
      p.set('lat', loc.lat);
      p.set('lng', loc.lng);
    }
    if (loc.label) p.set('label', loc.label);
    const s = p.toString();
    return s ? `?${s}` : '';
  })();

  return (
    <>
      <form className="m-searchbox" action="/search" method="get" onSubmit={submit}>
        <input
          className="m-input"
          type="search"
          name="q"
          placeholder="Search events by name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoComplete="off"
          autoCapitalize="none"
        />
        <input
          className="m-input"
          type="text"
          name="city"
          placeholder="City (e.g. Portland)"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          autoComplete="off"
          autoCapitalize="words"
        />
        <button className="m-btn" type="submit">
          Search
        </button>
      </form>

      {searching ? (
        <div className="m-center">
          <div className="m-spinner" aria-label="Searching" />
        </div>
      ) : error ? (
        <div className="m-center">
          <p className="m-empty" role="alert">
            {error}
          </p>
          <button className="m-btn" type="button" onClick={() => runSearch(q, city)}>
            Retry
          </button>
        </div>
      ) : searched ? (
        <>
          <h2 className="m-section-title">
            {total} result{total === 1 ? '' : 's'}
            {loc.label ? ` near ${loc.label}` : ''}
          </h2>
          {results.length === 0 ? (
            <p className="m-empty">
              No events match. Try different keywords or clear the city filter.
            </p>
          ) : (
            <div className="m-list">
              {results.map((e) => (
                <EventCard key={e.slug} event={e} />
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="m-empty">Type to search event names and descriptions.</p>
      )}

      <MobileTabs active="search" qs={tabsQs} />
    </>
  );
}
