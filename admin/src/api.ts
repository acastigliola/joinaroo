import type { Category, EventItem, NewVenueInput, UserItem, Venue } from './types';

const API_BASE_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ||
  (import.meta.env.NEXT_PUBLIC_API_URL as string | undefined) ||
  'http://localhost:4000';

export { API_BASE_URL };

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function getToken(): string | null {
  return localStorage.getItem('sme_admin_token');
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem('sme_admin_token', token);
  else localStorage.removeItem('sme_admin_token');
}

export function getStoredUser(): UserItem | null {
  try {
    const raw = localStorage.getItem('sme_admin_user');
    return raw ? (JSON.parse(raw) as UserItem) : null;
  } catch {
    return null;
  }
}

export function setStoredUser(user: UserItem | null) {
  if (user) localStorage.setItem('sme_admin_user', JSON.stringify(user));
  else localStorage.removeItem('sme_admin_user');
}

async function request<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: opts.method || 'GET',
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });

  if (res.status === 401) {
    throw new ApiError(401, 'Session expired — please log in again.');
  }
  if (res.status === 204) {
    return undefined as unknown as T;
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg =
      data && typeof data === 'object' && 'error' in data
        ? String((data as { error: unknown }).error)
        : `Request failed (${res.status})`;
    throw new ApiError(res.status, msg);
  }
  return data as T;
}

// ---- Auth ----
export const api = {
  login: (email: string, password: string) =>
    request<{ token: string; user: UserItem }>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    }),
  me: () => request<UserItem>('/api/auth/me'),

  // ---- Events ----
  listEvents: (q?: string) => {
    const params = new URLSearchParams({ limit: '200', include_hidden: 'true' });
    if (q && q.trim()) params.set('q', q.trim());
    return request<{ events: EventItem[]; total: number }>(`/api/events?${params.toString()}`);
  },
  createEvent: (input: Record<string, unknown>) =>
    request<EventItem>('/api/events', { method: 'POST', body: input }),
  updateEvent: (id: number, input: Record<string, unknown>) =>
    request<EventItem>(`/api/events/${id}`, { method: 'PATCH', body: input }),
  deleteEvent: (id: number) => request<void>(`/api/events/${id}`, { method: 'DELETE' }),

  // ---- Categories / Venues ----
  listCategories: () => request<Category[]>('/api/categories'),
  listVenues: () => request<Venue[]>('/api/venues'),
  createVenue: (input: NewVenueInput) => request<Venue>('/api/venues', { method: 'POST', body: input }),

  // ---- Analytics ----
  getAnalytics: (days: number) =>
    request<any>(`/api/admin/analytics?days=${days}`),
  getAnalyticsReport: (from: number, to: number) =>
    request<any>(`/api/admin/analytics/report?from=${from}&to=${to}`),
  getSmsInbox: () => request<any>('/api/admin/sms-inbox'),
  ignoreIp: (ip: string, note?: string) =>
    request<any>('/api/admin/analytics/ignored', { method: 'POST', body: { ip, note } }),
  unignoreIp: (ip: string) =>
    request<any>(`/api/admin/analytics/ignored/${encodeURIComponent(ip)}`, { method: 'DELETE' }),

  // ---- Users ----
  listUsers: () => request<UserItem[]>('/api/users'),
  createUser: (input: { name: string; email: string; password: string; role: string }) =>
    request<UserItem>('/api/users', { method: 'POST', body: input }),
  updateUser: (id: number, input: { name?: string; role?: string; locked?: boolean }) =>
    request<UserItem>(`/api/users/${id}`, { method: 'PATCH', body: input }),
  deleteUser: (id: number) => request<void>(`/api/users/${id}`, { method: 'DELETE' }),
};
