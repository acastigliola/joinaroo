import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { geocode, getCategories, getEvents } from '../api';
import type { Category, EventItem, GeoResult } from '../types';
import { useApp, type UserLocation } from '../store';
import { useAuth, fetchServerSaves, serverSave, serverUnsave } from '../lib/auth';
import EventCard, { timeOfDay } from '../components/EventCard';
import AppHeader from '../components/AppHeader';
import {
  buildSectionedRows,
  livePillExpiresMs,
  type ListRow,
} from '../utils/sections';
import type { RootStackParamList } from '../../App';

type Nav = NativeStackNavigationProp<RootStackParamList>;

// Featured Events carousel cards run wider than the other carousels
// (Angelo, Oct 29; mirrors the mobile site) so the chips row, distance
// and Community Pick chip are not squeezed in portrait.
const SPOT_CARD_WIDE = Math.min(Dimensions.get('window').width * 0.96, 440);

const PAGE_SIZE = 100;

/** Pinned pilot towns first (Portland, Westbrook, Orono), then every other
 * Maine town that has events, A–Z. Mirrors MOBILE_TOWNS in the web app. */
const DEFAULT_TOWNS = [
  'Portland',
  'Westbrook',
  'Orono',
  'Arundel',
  'Auburn',
  'Augusta',
  'Bangor',
  'Bar Harbor',
  'Bath',
  'Belfast',
  'Biddeford',
  'Boothbay',
  'Boothbay Harbor',
  'Brewer',
  'Brunswick',
  'Bucksport',
  'Camden',
  'Cumberland',
  'East Boothbay',
  'Eastport',
  'Eliot',
  'Ellsworth',
  'Freeport',
  'Gardiner',
  'Gorham',
  'Hallowell',
  'Kennebunk',
  'Kennebunkport',
  'Kittery',
  'Lewiston',
  'Millinocket',
  'North Berwick',
  'Oakland',
  'Ogunquit',
  'Old Orchard Beach',
  'Old Town',
  'Patten',
  'Rockland',
  'Saco',
  'Sanford',
  'Scarborough',
  'Searsport',
  'Sidney',
  'Skowhegan',
  'South Berwick',
  'South Portland',
  'Southport',
  'Springvale',
  'Topsham',
  'Union',
  'Unity',
  'Waterboro',
  'Waterville',
  'Wells',
  'Wiscasset',
  'York',
];

function sortEvents(list: EventItem[]): EventItem[] {
  const withDist = list.filter((e) => e.distance_km != null);
  if (withDist.length > 0) {
    return [...list].sort((a, b) => (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity));
  }
  return [...list].sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));
}

/** Featured: still-live events first, then pinned (pin order), then
 * soonest; ties by distance. "Still live" = credited attendee photos
 * and inside the LIVE-pill window (livePillExpiresMs rule). */
function sortFeatured(list: EventItem[]): EventItem[] {
  const nowMs = Date.now();
  // Live tiers (Angelo, Oct 25): 0 = still live (inside the LIVE pill
  // window), 1 = live earlier today (photos posted, pill expired) —
  // live cards as a block ahead of regular cards.
  const liveRank = (e: EventItem) =>
    (e.live_people?.length ?? 0) === 0
      ? 2
      : livePillExpiresMs(e) > nowMs
        ? 0
        : 1;
  return [...list].sort((a, b) => {
    const la = liveRank(a);
    const lb = liveRank(b);
    if (la !== lb) return la - lb;
    if (la < 2) {
      // Live tier order (Angelo, Oct 25): most people first, then the
      // event that stays live the longest (latest pill expiry).
      const pc = (b.live_people?.length ?? 0) - (a.live_people?.length ?? 0);
      if (pc !== 0) return pc;
      const pe = livePillExpiresMs(b) - livePillExpiresMs(a);
      if (pe !== 0) return pe;
    }
    const pa = a.featured_pin ?? Number.POSITIVE_INFINITY;
    const pb = b.featured_pin ?? Number.POSITIVE_INFINITY;
    if (pa !== pb) return pa - pb;
    const dt = +new Date(a.starts_at) - +new Date(b.starts_at);
    if (dt !== 0) return dt;
    return (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity);
  });
}

const PART_ORDER = { morning: 0, afternoon: 1, evening: 2 } as const;

/** Main list sort: calendar day, then morning → afternoon → evening, then distance. */
function sortByDayPartDistance(list: EventItem[]): EventItem[] {
  return [...list].sort((a, b) => {
    const da = new Date(a.starts_at);
    const db = new Date(b.starts_at);
    if (da.getFullYear() !== db.getFullYear()) return da.getFullYear() - db.getFullYear();
    if (da.getMonth() !== db.getMonth()) return da.getMonth() - db.getMonth();
    if (da.getDate() !== db.getDate()) return da.getDate() - db.getDate();
    const pa = PART_ORDER[timeOfDay(a.starts_at)];
    const pb = PART_ORDER[timeOfDay(b.starts_at)];
    if (pa !== pb) return pa - pb;
    return (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity);
  });
}

type RadiusKey = '1' | '5' | '25' | '50' | 'all';

const RADIUS_OPTIONS: { key: RadiusKey; label: string }[] = [
  { key: '1', label: '1 mi' },
  { key: '5', label: '5 mi' },
  { key: '25', label: '25 mi' },
  { key: '50', label: '50 mi' },
  { key: 'all', label: 'All' },
];

/** Full date in Maine time, e.g. "Thursday, October 16". */
function maineFullDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/New_York',
  });
}

/** Short date in Maine time, e.g. "Fri, Oct 17". */
function maineShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'America/New_York',
  });
}

/** Maine YMD for date comparisons. */
function maineYMD(iso: string): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return { y: Number(get('year')), m: Number(get('month')), d: Number(get('day')) };
}

/** Weekend range label, e.g. "Fri, Oct 17 – Sun, Oct 19".
 *  The start of the range is clamped to today (Maine time) — on Saturday the
 *  label shows "Sat, Oct 18 – Sun, Oct 19", not Friday's date. */
function weekendRangeLabel(startsAts: string[]): string {
  if (startsAts.length === 0) return '';
  const sorted = [...startsAts].sort();
  // Clamp the range start to today (Maine) so past days don't appear.
  const todayYMD = maineYMD(new Date().toISOString());
  const todayStr = `${todayYMD.y}-${String(todayYMD.m).padStart(2, '0')}-${String(todayYMD.d).padStart(2, '0')}`;
  // Find the first event date that is today or later.
  let startIdx = sorted.findIndex((iso) => {
    const d = maineYMD(iso);
    const ds = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
    return ds >= todayStr;
  });
  if (startIdx === -1) startIdx = 0; // fallback: use earliest
  const startLabel = maineShortDate(sorted[startIdx]);
  const endLabel = maineShortDate(sorted[sorted.length - 1]);
  // If start and end are the same day, show just one date.
  if (startLabel === endLabel) return startLabel;
  return `${startLabel} – ${endLabel}`;
}

/** Section header: icon + bold title + gray subtitle, per the design mockups. */
function SectionHeader({ icon, title, subtitle, style, iconStyle, onIconPress, iconBusy }: { icon: any; title: string; subtitle?: string; style?: any; iconStyle?: any; onIconPress?: () => void; iconBusy?: boolean }) {
  const iconImg = <Image source={icon} style={[styles.sectionIcon, iconStyle, iconBusy && { opacity: 0.5 }]} />;
  return (
    <View style={[styles.sectionHead, style]}>
      {onIconPress ? (
        <TouchableOpacity
          onPress={onIconPress}
          disabled={iconBusy}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Use my location"
        >
          {iconImg}
        </TouchableOpacity>
      ) : (
        iconImg
      )}
      <View style={styles.sectionText}>
        <Text style={styles.sectionTitle2}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSub} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

/** 1 mi ≈ 1.6 km, 5 mi ≈ 8 km, 25 mi ≈ 40 km, 50 mi ≈ 80 km. "All" sends a huge radius (API has no unfiltered mode). */
function radiusKmFor(key: RadiusKey): number | undefined {
  if (key === '1') return 1.6;
  if (key === '5') return 8;
  if (key === '25') return 40;
  if (key === '50') return 80;
  return 20000;
}

/** Local ISO-8601 with numeric offset, e.g. 2026-10-13T00:00:00-04:00. */
function localISO(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

/** Today's bounds in local time for the API from/to filters. */
function todayBounds(): { from: string; to: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  return { from: localISO(start), to: localISO(end) };
}

/**
 * Tomorrow 00:00 local. The Nearby list starts here (Angelo, Oct 28):
 * today's events already live in the Today section.
 */
function tomorrowStart(): string {
  const now = new Date();
  return localISO(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0));
}

/**
 * When the Nearby list starts (Angelo, Oct 29, refined): Mon–Wed it
 * starts tomorrow and flows through the weekend; Thu–Sun the Weekend
 * section owns Fri–Sun, so Nearby jumps to Monday.
 */
function nearbyStart(): string {
  const now = new Date();
  const dow = now.getDay();
  const ahead = dow >= 1 && dow <= 3 ? 1 : (8 - dow) % 7;
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + ahead, 0, 0, 0);
  return localISO(d);
}

/**
 * Bounds for "this weekend": Fri 00:00 – Sun 23:59 local.
 * Mon–Thu -> the coming Fri–Sun. Sat/Sun -> the weekend already underway.
 * Friday -> Sat–Sun only: Friday itself belongs to Today (Angelo, Oct 30).
 */
function weekendBounds(): { from: string; to: string } {
  const now = new Date();
  const dow = now.getDay(); // 0=Sun … 5=Fri, 6=Sat
  const friday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (dow === 6) friday.setDate(friday.getDate() - 1);
  else if (dow === 0) friday.setDate(friday.getDate() + 5); // Sunday: next weekend
  else if (dow >= 1 && dow <= 4) friday.setDate(friday.getDate() + (5 - dow));
  friday.setHours(0, 0, 0, 0);
  const sundayEnd = new Date(friday);
  sundayEnd.setDate(sundayEnd.getDate() + 2);
  sundayEnd.setHours(23, 59, 59, 0);
  const start = new Date(friday);
  if (dow === 5) start.setDate(start.getDate() + 1);
  return { from: localISO(start), to: localISO(sundayEnd) };
}

/** True when today is Sunday — the weekend section shows next weekend. */
function isNextWeekend(): boolean {
  return new Date().getDay() === 0;
}

export default function EventsScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { apiUrl, apiUrlReady, location, locating, locError, useGpsLocation, setTown } = useApp();

  const [categories, setCategories] = useState<Category[]>([]);
  // Multi-select category filter: empty = all categories.
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const toggleCategory = (slug: string) =>
    setSelectedCategories((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
  const [events, setEvents] = useState<EventItem[]>([]);
  const [featured, setFeatured] = useState<EventItem[]>([]);
  const [todayEvents, setTodayEvents] = useState<EventItem[]>([]);
  const [weekendEvents, setWeekendEvents] = useState<EventItem[]>([]);
  const [radius, setRadius] = useState<RadiusKey>('25');
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const { token } = useAuth();
  const [signInPromptEvent, setSignInPromptEvent] = useState<EventItem | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [townResults, setTownResults] = useState<GeoResult[]>([]);
  const [townLoading, setTownLoading] = useState(false);
  const [townQuery, setTownQuery] = useState('');
  const townsCache = useRef<GeoResult[] | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!token) {
        setSavedIds(new Set());
        return;
      }
      fetchServerSaves(apiUrl, token)
        .then((r) => setSavedIds(new Set(r.saves.map((e: any) => Number(e.id)))))
        .catch(() => {});
    }, [token, apiUrl]),
  );

  const toggleSave = useCallback(
    async (event: EventItem) => {
      const eventId = Number(event.id);
      if (!token) {
        // Not signed in: show the "Sign In Required" prompt first.
        // SIGN IN sends them through the auth flow with the pending save.
        setSignInPromptEvent(event);
        return;
      }
      const isSaved = savedIds.has(eventId);
      try {
        if (isSaved) {
          await serverUnsave(apiUrl, token, eventId);
        } else {
          await serverSave(apiUrl, token, eventId);
        }
        setSavedIds((prev) => {
          const next = new Set(prev);
          if (isSaved) next.delete(eventId);
          else next.add(eventId);
          return next;
        });
      } catch {
        /* keep current state on failure */
      }
    },
    [token, apiUrl, savedIds, navigation],
  );

  const rows = useMemo(() => buildSectionedRows(events), [events]);

  const radiusKm = radiusKmFor(radius);

  // Stable comma-separated param for the query (sorted so toggle order doesn't refetch).
  const categoryParam =
    selectedCategories.length > 0 ? [...selectedCategories].sort().join(',') : undefined;

  const query = useMemo(
    () => ({
      category: categoryParam,
      // Nearby starts Monday after the shown weekend (Angelo, Oct 29):
      // already listed in the Today section.
      from: nearbyStart(),
      lat: location?.lat,
      lng: location?.lng,
      radius_km: location ? radiusKm : undefined,
      limit: PAGE_SIZE,
    }),
    [categoryParam, location, radiusKm],
  );

  const loadEvents = useCallback(
    async (offset: number, append: boolean) => {
      const res = await getEvents(apiUrl, { ...query, offset });
      setTotal(res.total);
      setEvents((prev) =>
        append
          ? sortByDayPartDistance([...prev, ...res.events])
          : sortByDayPartDistance(res.events),
      );
      return res.events.length;
    },
    [apiUrl, query],
  );

  const refresh = useCallback(
    async (isPull: boolean) => {
      if (isPull) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        await loadEvents(0, false);
        if (selectedCategories.length === 0) {
          const f = await getEvents(apiUrl, {
            featured: true,
            from: todayBounds().from,
            lat: location?.lat,
            lng: location?.lng,
            radius_km: location ? radiusKm : undefined,
            // Whole featured pool: a small fetch limit silently drops
            // live/pinned events ranked below it (Angelo, Oct 25).
            limit: 60,
          });
          // Live events are STATEWIDE (Angelo, Oct 25): an event with
          // credited attendee photos shows in everyone's Featured, so
          // fetch today's events with an effectively unbounded radius
          // and merge the live ones into the featured pool.
          const tbL = todayBounds();
          const s = await getEvents(apiUrl, {
            from: tbL.from,
            to: tbL.to,
            lat: location?.lat,
            lng: location?.lng,
            radius_km: location ? 10000 : undefined,
            limit: 200,
          });
          const fIds = new Set(f.events.map((e) => e.id));
          const merged = [
            ...f.events,
            ...s.events.filter(
              (e) => (e.live_people?.length ?? 0) > 0 && !fIds.has(e.id),
            ),
          ];
          // Ended events never appear — unless pinned (a pin holds
          // only until pin_expires_at) or LIVE: a live event holds its
          // Featured spot for its whole listing day.
          const featNowMs = Date.now();
          setFeatured(
            sortFeatured(
              merged.filter((e) =>
                // Live exemption scoped to events whose listing day
                // is TODAY — yesterday's pinned events returned by the
                // pin lookback must not ride it past their day.
                (e.live_people?.length ?? 0) > 0 &&
                +new Date(e.starts_at) >= +new Date(tbL.from) &&
                +new Date(e.starts_at) < +new Date(tbL.to)
                  ? true
                  : e.featured_pin != null
                    ? e.pin_expires_at != null &&
                      +new Date(e.pin_expires_at) > featNowMs
                    : !e.ends_at || +new Date(e.ends_at) > featNowMs,
              ),
            ).slice(0, 10),
          );
          const { from, to } = todayBounds();
          const t = await getEvents(apiUrl, {
            from,
            to,
            lat: location?.lat,
            lng: location?.lng,
            radius_km: location ? radiusKm : undefined,
            limit: 50,
          });
          setTodayEvents(
            [...t.events].sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at)),
          );
          const wb = weekendBounds();
          const w = await getEvents(apiUrl, {
            from: wb.from,
            to: wb.to,
            lat: location?.lat,
            lng: location?.lng,
            radius_km: location ? radiusKm : undefined,
            limit: 50,
          });
          const nowMs = Date.now();
          setWeekendEvents(
            w.events
              .filter((e) => +new Date(e.ends_at ?? e.starts_at) > nowMs)
              .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at)),
          );
        } else {
          setFeatured([]);
          setTodayEvents([]);
          setWeekendEvents([]);
        }
      } catch (e: any) {
        setError(e?.message ?? 'Failed to load events.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [apiUrl, categoryParam, loadEvents, location, radiusKm],
  );

  // Initial load of categories + first page once the API URL is ready.
  useEffect(() => {
    if (!apiUrlReady) return;
    let cancelled = false;
    (async () => {
      try {
        const cats = await getCategories(apiUrl);
        if (!cancelled) setCategories(cats);
      } catch {
        /* categories are optional; list still works */
      }
    })();
    refresh(false);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiUrlReady, apiUrl]);

  // Re-query when location, category filter, or radius changes.
  useEffect(() => {
    if (!apiUrlReady) return;
    refresh(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, categoryParam, radiusKm]);

  const loadMore = useCallback(async () => {
    if (loadingMore || loading || refreshing || events.length >= total) return;
    setLoadingMore(true);
    try {
      await loadEvents(events.length, true);
    } catch {
      /* keep existing list */
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, loading, refreshing, events.length, total, loadEvents]);

  const openTownPicker = useCallback(async () => {
    setPickerOpen(true);
    setTownQuery('');
    if (townsCache.current) {
      setTownResults(townsCache.current);
      return;
    }
    setTownLoading(true);
    try {
      const settled = await Promise.all(
        DEFAULT_TOWNS.map((t) =>
          geocode(apiUrl, t)
            .then((r) => (r.length > 0 ? r[0] : null))
            .catch(() => null),
        ),
      );
      const list = settled.filter((r): r is GeoResult => r !== null);
      townsCache.current = list;
      setTownResults(list);
    } finally {
      setTownLoading(false);
    }
  }, [apiUrl]);

  const onTownSearch = useCallback(
    (text: string) => {
      setTownQuery(text);
      if (searchTimer.current) clearTimeout(searchTimer.current);
      if (!text.trim()) {
        setTownResults(townsCache.current ?? []);
        return;
      }
      searchTimer.current = setTimeout(async () => {
        setTownLoading(true);
        try {
          const r = await geocode(apiUrl, text.trim());
          setTownResults(r);
        } catch {
          /* keep previous results */
        } finally {
          setTownLoading(false);
        }
      }, 400);
    },
    [apiUrl],
  );

  const pickTown = (t: GeoResult) => {
    const loc: UserLocation = { lat: t.lat, lng: t.lng, label: t.label };
    setTown(loc);
    setPickerOpen(false);
  };

  const openDetail = (slug: string, title: string) =>
    navigation.navigate('EventDetail', { slug, title, scrollToHero: true });

  const listHeader = () => (
    <View>
      {featured.length > 0 ? (
        <View style={styles.spotlight}>
          <SectionHeader
            icon={require('../../assets/icons/icon-sparkle.png')}
            title="Featured Events"
            subtitle="Handpicked happenings near you"
          />
          <FlatList
            horizontal
            pagingEnabled={false}
            showsHorizontalScrollIndicator={false}
            data={featured}
            keyExtractor={(i) => `f-${i.slug}`}
            snapToInterval={
              featured.some(
                (e) => e.card_layout === 'top' || (e.live_people?.length ?? 0) > 0,
              )
                ? undefined
                : SPOT_CARD_WIDE
            }
            decelerationRate="fast"
            renderItem={({ item }) => (
              <View
                style={
                  item.card_layout === 'top' || (item.live_people?.length ?? 0) > 0
                    ? styles.spotCard
                    : styles.spotCardWide
                }
              >
                <EventCard event={item} onPress={() => openDetail(item.slug, item.title)} saved={savedIds.has(Number(item.id))} onToggleSave={() => toggleSave(item)} />
              </View>
            )}
          />
        </View>
      ) : null}
      {todayEvents.length > 0 ? (
        <View style={styles.spotlight}>
          <SectionHeader
            icon={require('../../assets/icons/icon-calendar-blue.png')}
            title="Today"
            subtitle={maineFullDate()}
          />
          <FlatList
            horizontal
            pagingEnabled={false}
            showsHorizontalScrollIndicator={false}
            data={todayEvents}
            keyExtractor={(i) => `t-${i.slug}`}
            snapToInterval={300}
            decelerationRate="fast"
            renderItem={({ item }) => (
              <View style={styles.spotCard}>
                <EventCard event={item} onPress={() => openDetail(item.slug, item.title)} dayLabel="Today" saved={savedIds.has(Number(item.id))} onToggleSave={() => toggleSave(item)} />
              </View>
            )}
          />
        </View>
      ) : null}
      {weekendEvents.length > 0 ? (
        <View style={styles.spotlight}>
          <SectionHeader
            icon={require('../../assets/icons/icon-calendar-purple.png')}
            title={isNextWeekend() ? "Next Weekend" : "This Weekend"}
            subtitle={weekendRangeLabel(weekendEvents.map((e) => e.starts_at))}
          />
          <FlatList
            horizontal
            pagingEnabled={false}
            showsHorizontalScrollIndicator={false}
            data={weekendEvents}
            keyExtractor={(i) => `w-${i.slug}`}
            snapToInterval={300}
            decelerationRate="fast"
            renderItem={({ item }) => (
              <View style={styles.spotCard}>
                <EventCard
                  event={item}
                  onPress={() => openDetail(item.slug, item.title)}
                  dayLabel={new Date(item.starts_at).toLocaleDateString(undefined, {
                    weekday: 'long',
                  })}
                  saved={savedIds.has(Number(item.id))}
                  onToggleSave={() => toggleSave(item)}
                />
              </View>
            )}
          />
        </View>
      ) : null}
      <View style={styles.listHeaderRow}>
        <View style={styles.listHeaderTitle}>
          <SectionHeader
            icon={require('../../assets/icons/icon-nearby.png')}
            title={`${location ? 'Nearby Events' : 'Upcoming'} (${total})`}
            subtitle={location ? 'Events closest to you' : undefined}
            style={styles.sectionHeadTight}
            onIconPress={useGpsLocation}
            iconBusy={locating}
          />
        </View>
        {location ? (
          <View style={styles.radiusGrid}>
            <View style={[styles.radiusGridRow, { marginBottom: 6 }]}>
              {RADIUS_OPTIONS.slice(0, 3).map((r) => (
                <TouchableOpacity
                  key={r.key}
                  style={[styles.radiusChip, radius === r.key && styles.radiusChipActive]}
                  onPress={() => setRadius(r.key)}
                >
                  <Text
                    style={[styles.radiusChipText, radius === r.key && styles.radiusChipTextActive]}
                  >
                    {r.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.radiusGridRow}>
              {RADIUS_OPTIONS.slice(3).map((r) => (
                <TouchableOpacity
                  key={r.key}
                  style={[styles.radiusChip, radius === r.key && styles.radiusChipActive]}
                  onPress={() => setRadius(r.key)}
                >
                  <Text
                    style={[styles.radiusChipText, radius === r.key && styles.radiusChipTextActive]}
                  >
                    {r.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <AppHeader />
      {/* Location bar (AppHeader absorbs the status-bar inset) */}
      <View style={[styles.locBar, { paddingTop: 10 }]}>
        <TouchableOpacity style={styles.locPicker} onPress={openTownPicker}>
          <Image source={require('../../assets/icons/icon-pin-red.png')} style={styles.locIcon} />
          <Text style={styles.locLabel} numberOfLines={1}>
            {location ? location.label : 'No location'}
          </Text>
          <Text style={styles.locChev}>⌄</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.locBtn} onPress={useGpsLocation} disabled={locating}>
          {locating ? (
            <Text style={styles.locBtnText}>…</Text>
          ) : (
            <>
              <Image source={require('../../assets/icons/icon-crosshair.png')} style={styles.locBtnIcon} />
              <Text style={styles.locBtnText}>Use my location</Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.locBtn} onPress={openTownPicker}>
          <Image source={require('../../assets/icons/icon-pin-white.png')} style={styles.locBtnIcon} />
          <Text style={styles.locBtnText}>Town</Text>
        </TouchableOpacity>
      </View>
      {locError ? <Text style={styles.locError}>{locError}</Text> : null}

      {/* Category chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chips}
        contentContainerStyle={styles.chipsContent}
      >
        <TouchableOpacity
          style={[styles.chip, selectedCategories.length === 0 && styles.chipActive]}
          onPress={() => setSelectedCategories([])}
        >
          <Text style={[styles.chipText, selectedCategories.length === 0 && styles.chipTextActive]}>All</Text>
        </TouchableOpacity>
        {categories.map((c) => (
          <TouchableOpacity
            key={c.slug}
            style={[styles.chip, selectedCategories.includes(c.slug) && styles.chipActive]}
            onPress={() => toggleCategory(c.slug)}
          >
            <Text style={[styles.chipText, selectedCategories.includes(c.slug) && styles.chipTextActive]}>
              {c.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => refresh(false)}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(i) => i.key}
          renderItem={({ item }: { item: ListRow }) => {
            if (item.kind === 'month') {
              return <Text style={styles.monthHeader}>{item.label}</Text>;
            }
            if (item.kind === 'day') {
              return <Text style={styles.dayHeader}>{item.label}</Text>;
            }
            const e = item.event;
            return (
              <EventCard
                event={e}
                onPress={() => openDetail(e.slug, e.title)}
                saved={savedIds.has(Number(e.id))}
                onToggleSave={() => toggleSave(e)}
              />
            );
          }}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>No events found. Try another category or town.</Text>
            </View>
          }
          ListFooterComponent={
            loadingMore ? <ActivityIndicator style={{ margin: 16 }} /> : <View style={{ height: 24 }} />
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => refresh(true)} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
        />
      )}

      {/* "Sign In Required" prompt when an unauthenticated user taps a card star */}
      <Modal
        visible={signInPromptEvent !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSignInPromptEvent(null)}
      >
        <View style={styles.promptBackdrop}>
          <View style={styles.promptCard}>
            <Text style={styles.promptTitle}>Sign In Required</Text>
            <Text style={styles.promptMsg}>You must be signed in to perform this action.</Text>
            <View style={styles.promptBtns}>
              <TouchableOpacity onPress={() => setSignInPromptEvent(null)}>
                <Text style={styles.promptCancel}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  const ev = signInPromptEvent;
                  setSignInPromptEvent(null);
                  if (ev) {
                    navigation.navigate('Auth', {
                      mode: 'signup',
                      pendingEventId: Number(ev.id),
                    });
                  }
                }}
              >
                <Text style={styles.promptSignIn}>SIGN IN</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Town picker modal */}
      <Modal visible={pickerOpen} animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>Choose a Maine town</Text>
          <TextInput
            style={styles.input}
            placeholder="Search towns…"
            value={townQuery}
            onChangeText={onTownSearch}
            autoCapitalize="words"
          />
          {townLoading ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
          <FlatList
            data={townResults}
            keyExtractor={(i) => `${i.label}-${i.lat}-${i.lng}`}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.townRow} onPress={() => pickTown(item)}>
                <Text style={styles.townText}>{item.label}</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              !townLoading ? <Text style={styles.emptyText}>No towns found.</Text> : null
            }
          />
          <TouchableOpacity style={styles.closeBtn} onPress={() => setPickerOpen(false)}>
            <Text style={styles.retryText}>Close</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F5F7' },
  locBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  locLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: '#0B1D3A' },
  locPicker: { flex: 1, flexDirection: 'row', alignItems: 'center', marginRight: 4 },
  locIcon: { width: 22, aspectRatio: 264 / 348, marginRight: 6 },
  locChev: { fontSize: 12, color: '#0B1D3A', marginLeft: 4 },
  locBtn: {
    backgroundColor: '#0B1D3A',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginLeft: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  locBtnIcon: { width: 16, height: 16, marginRight: 6 },
  locBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  locError: { color: '#B00020', fontSize: 12, paddingHorizontal: 12, paddingTop: 6 },
  chips: { backgroundColor: '#fff', height: 60, flexGrow: 0 },
  chipsContent: { alignItems: 'center', paddingHorizontal: 8 },
  chip: {
    backgroundColor: '#EFF2F7',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginHorizontal: 4,
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: '#0B1D3A' },
  chipText: { color: '#333', fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { color: '#B00020', textAlign: 'center', marginBottom: 12 },
  retryBtn: { backgroundColor: '#0B1D3A', borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 },
  retryText: { color: '#fff', fontWeight: '600' },
  emptyText: { color: '#777', textAlign: 'center', padding: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#0B1D3A', margin: 12, marginBottom: 4 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 12, marginTop: 16, marginBottom: 8 },
  sectionIcon: { width: 30, height: 30, marginRight: 10, resizeMode: 'contain' },
  sectionText: { flex: 1 },
  sectionTitle2: { fontSize: 19, fontWeight: '800', color: '#111' },
  sectionSub: { fontSize: 13, color: '#777', marginTop: 2 },
  sectionHeadTight: { marginHorizontal: 0, marginTop: 0, marginBottom: 0 },
  listHeaderTitle: { flex: 1, marginRight: 8 },
  dayHeader: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0B1D3A',
    marginHorizontal: 12,
    marginTop: 14,
    marginBottom: 2,
  },
  monthHeader: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1B3A6B',
    marginHorizontal: 12,
    marginTop: 18,
    marginBottom: 2,
  },
  listHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 4,
  },
  listTitle: { fontSize: 16, fontWeight: '700', color: '#0B1D3A', flexShrink: 1, marginRight: 8 },
  radiusGrid: { flexShrink: 0 },
  radiusGridRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  radiusChip: {
    backgroundColor: '#EFF2F7',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginLeft: 4,
  },
  radiusChipActive: { backgroundColor: '#0B1D3A' },
  radiusChipText: { color: '#333', fontSize: 12, fontWeight: '600' },
  radiusChipTextActive: { color: '#fff' },
  spotlight: { marginBottom: 4 },
  spotCard: { width: 300 },
  spotCardWide: { width: SPOT_CARD_WIDE },
  modal: { flex: 1, backgroundColor: '#F4F5F7', paddingTop: 48, paddingHorizontal: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#0B1D3A', marginBottom: 12 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#DDD',
  },
  townRow: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginTop: 8,
  },
  townText: { fontSize: 15, color: '#111' },
  closeBtn: {
    backgroundColor: '#0B1D3A',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginVertical: 16,
  },
  promptBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  promptCard: {
    backgroundColor: '#fff',
    borderRadius: 6,
    padding: 28,
    width: '100%',
  },
  promptTitle: { fontSize: 26, fontWeight: '400', color: '#111', marginBottom: 16 },
  promptMsg: { fontSize: 19, color: '#111', lineHeight: 26, marginBottom: 32 },
  promptBtns: { flexDirection: 'row', justifyContent: 'flex-end' },
  promptCancel: { fontSize: 16, color: '#4A90D9', fontWeight: '500', padding: 8, marginRight: 16 },
  promptSignIn: { fontSize: 16, color: '#4A90D9', fontWeight: '500', padding: 8 },
});
