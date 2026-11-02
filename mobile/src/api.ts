// API client for the SME web service (public read-only endpoints per CONTRACT.md).
import type { Category, EventItem, EventsResponse, GeoResult } from './types';

export interface EventQuery {
  q?: string;
  category?: string;
  city?: string;
  from?: string;
  to?: string;
  lat?: number;
  lng?: number;
  radius_km?: number;
  featured?: boolean;
  limit?: number;
  offset?: number;
}

async function fetchJson<T>(baseUrl: string, path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`);
  } catch (e: any) {
    throw new Error(`Could not reach the API at ${baseUrl}. Check the API URL in Settings.`);
  }
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) msg = body.error;
    } catch {
      /* keep default */
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

function toParams(q: EventQuery): string {
  const p = new URLSearchParams();
  if (q.q) p.set('q', q.q);
  if (q.category) p.set('category', q.category);
  if (q.city) p.set('city', q.city);
  if (q.from) p.set('from', q.from);
  if (q.to) p.set('to', q.to);
  if (q.lat != null && q.lng != null) {
    p.set('lat', String(q.lat));
    p.set('lng', String(q.lng));
  }
  if (q.radius_km != null) p.set('radius_km', String(q.radius_km));
  if (q.featured) p.set('featured', 'true');
  if (q.limit != null) p.set('limit', String(q.limit));
  if (q.offset != null) p.set('offset', String(q.offset));
  return p.toString();
}

/** The API returns live-card image paths relative to the origin; make them absolute. */
function absolutizeLive(baseUrl: string, e: EventItem): EventItem {
  const origin = baseUrl.replace(/\/$/, '');
  const abs = (u?: string | null) => (u && u.startsWith('/') ? `${origin}${u}` : u);
  if (e.live_photo_url) e.live_photo_url = abs(e.live_photo_url);
  if (e.live_people) {
    e.live_people = e.live_people.map((p) => ({ ...p, avatar_url: abs(p.avatar_url) }));
  }
  return e;
}

export async function getEvents(baseUrl: string, query: EventQuery): Promise<EventsResponse> {
  const qs = toParams(query);
  const r = await fetchJson<EventsResponse>(baseUrl, `/api/events${qs ? `?${qs}` : ''}`);
  r.events.forEach((e) => absolutizeLive(baseUrl, e));
  return r;
}

export async function getEvent(baseUrl: string, slug: string): Promise<EventItem> {
  const e = await fetchJson<EventItem>(baseUrl, `/api/events/${encodeURIComponent(slug)}`);
  return absolutizeLive(baseUrl, e);
}

export interface EventPhoto {
  id: number;
  event_id: number;
  url: string;
  caption: string | null;
  created_at: string;
}

export function getEventPhotos(baseUrl: string, slug: string): Promise<EventPhoto[]> {
  return fetchJson<{ photos: EventPhoto[] }>(
    baseUrl,
    `/api/events/${encodeURIComponent(slug)}/photos`,
  ).then((r) => r.photos);
}

export async function uploadEventPhoto(
  baseUrl: string,
  slug: string,
  imageData: string,
  caption?: string,
  token?: string | null,
): Promise<EventPhoto> {
  let res: Response;
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    res = await fetch(`${baseUrl}/api/events/${encodeURIComponent(slug)}/photos`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ image_data: imageData, caption: caption || null }),
    });
  } catch (e: any) {
    throw new Error(`Could not reach the API at ${baseUrl}. Check the API URL in Settings.`);
  }
  if (!res.ok) {
    let msg = `Upload failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) msg = body.error;
    } catch {
      /* keep default */
    }
    throw new Error(msg);
  }
  return (await res.json()) as EventPhoto;
}

export function getCategories(baseUrl: string): Promise<Category[]> {
  return fetchJson<Category[]>(baseUrl, '/api/categories');
}

export function geocode(baseUrl: string, q: string): Promise<GeoResult[]> {
  return fetchJson<GeoResult[]>(baseUrl, `/api/geocode?q=${encodeURIComponent(q)}`);
}

export function checkHealth(baseUrl: string): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>(baseUrl, '/api/health');
}
