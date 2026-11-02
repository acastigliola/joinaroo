import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import { geocode } from './api';

const API_URL_KEY = 'sme:apiUrl';

/**
 * Default API URL. An explicit extra.apiUrl (e.g. the production server)
 * always wins; otherwise derive from the live Expo tunnel host in Expo Go.
 * Overridable in Settings.
 */
function getDefaultApiUrl(): string {
  const extraUrl = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl;
  if (extraUrl) return extraUrl;
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) return `https://${hostUri}`;
  return 'http://10.0.2.2:4000'; // Android emulator loopback -> host machine
}
const DEFAULT_API_URL = getDefaultApiUrl();

/** Drop a saved URL if it's a stale exp.direct tunnel (tunnel host changed),
 * or if the default is no longer a tunnel URL (e.g. moved to production). */
function isStaleTunnelUrl(url: string): boolean {
  if (!url.includes('.exp.direct')) return false;
  if (!DEFAULT_API_URL.includes('.exp.direct')) return true;
  const hostUri = Constants.expoConfig?.hostUri;
  return !!hostUri && !url.includes(hostUri);
}

export interface UserLocation {
  lat: number;
  lng: number;
  label: string;
}

interface AppState {
  apiUrl: string;
  apiUrlReady: boolean;
  setApiUrl: (url: string) => Promise<void>;
  location: UserLocation | null;
  locating: boolean;
  locError: string | null;
  useGpsLocation: () => Promise<void>;
  setTown: (t: UserLocation) => void;
  clearLocation: () => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [apiUrl, setApiUrlState] = useState<string>(DEFAULT_API_URL);
  const [apiUrlReady, setApiUrlReady] = useState(false);
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);

  // Load saved API URL, then default the location to Portland, ME.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let url = DEFAULT_API_URL;
      try {
        const saved = await AsyncStorage.getItem(API_URL_KEY);
        if (saved && !isStaleTunnelUrl(saved)) url = saved;
      } catch {
        /* storage unavailable; use default */
      }
      if (!cancelled) setApiUrlState(url);
      try {
        const res = await geocode(url, 'Portland');
        if (!cancelled && res.length > 0) {
          setLocation({ lat: res[0].lat, lng: res[0].lng, label: res[0].label });
        }
      } catch {
        /* API unreachable; location stays null -> date-sorted list */
      }
      if (!cancelled) setApiUrlReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setApiUrl = useCallback(async (url: string) => {
    const clean = url.trim().replace(/\/+$/, '');
    setApiUrlState(clean);
    try {
      await AsyncStorage.setItem(API_URL_KEY, clean);
    } catch {
      /* ignore storage errors */
    }
  }, []);

  const useGpsLocation = useCallback(async () => {
    setLocating(true);
    setLocError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocError('Location permission denied. Pick a town closest to you instead.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setLocation({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        label: 'Near you',
      });
    } catch (e: any) {
      setLocError(e?.message ? String(e.message) : 'Could not get your location.');
    } finally {
      setLocating(false);
    }
  }, []);

  const setTown = useCallback((t: UserLocation) => {
    setLocError(null);
    setLocation(t);
  }, []);

  const clearLocation = useCallback(() => {
    setLocation(null);
    setLocError(null);
  }, []);

  return (
    <Ctx.Provider
      value={{
        apiUrl,
        apiUrlReady,
        setApiUrl,
        location,
        locating,
        locError,
        useGpsLocation,
        setTown,
        clearLocation,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}
