// Account auth state: token + user profile, persisted on-device.
// Browsing stays anonymous; signing in unlocks server-side saves.
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'sme:authToken';
export const HAS_LOGGED_IN_KEY = 'sme:has-logged-in:v1';

export interface UserProfile {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  is_private: boolean;
  created_at: string;
}

interface AuthState {
  token: string | null;
  user: UserProfile | null;
  authReady: boolean;
  saveSession: (t: string, u: UserProfile) => Promise<void>;
  login: (identifier: string, password: string) => Promise<string>;
  register: (identifier: string, password: string, verificationToken?: string) => Promise<string>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateProfile: (patch: {
    username?: string;
    display_name?: string;
    is_private?: boolean;
  }) => Promise<void>;
  uploadAvatar: (imageDataUrl: string) => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

function isPhone(s: string): boolean {
  return /^[+\d][\d\s\-().]{6,}$/.test(s.trim());
}

async function apiCall<T>(
  baseUrl: string,
  path: string,
  token: string | null,
  init?: RequestInit,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, { ...init, headers: { ...headers, ...(init?.headers as any) } });
  } catch (e: any) {
    throw new Error(`Could not reach the API at ${baseUrl}.`);
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

export function AuthProvider({ children, apiUrl }: { children: ReactNode; apiUrl: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authReady, setAuthReady] = useState(false);

  // Restore session on launch.
  useEffect(() => {
    (async () => {
      try {
        const t = await AsyncStorage.getItem(TOKEN_KEY);
        if (t) {
          const me = await apiCall<UserProfile>(apiUrl, '/api/auth/me', t);
          setToken(t);
          setUser(me);
        }
      } catch {
        await AsyncStorage.removeItem(TOKEN_KEY);
      } finally {
        setAuthReady(true);
      }
    })();
  }, [apiUrl]);

  const saveSession = useCallback(async (t: string, u: UserProfile) => {
    await AsyncStorage.setItem(TOKEN_KEY, t);
    await AsyncStorage.setItem(HAS_LOGGED_IN_KEY, '1');
    setToken(t);
    setUser(u);
  }, []);

  const login = useCallback(
    async (identifier: string, password: string) => {
      const id = identifier.trim();
      const body = isPhone(id) ? { phone: id, password } : { email: id, password };
      const r = await apiCall<{ token: string; user: UserProfile }>(apiUrl, '/api/auth/login', null, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      await saveSession(r.token, r.user);
      return r.token;
    },
    [apiUrl, saveSession],
  );

  const register = useCallback(
    async (identifier: string, password: string, verificationToken?: string) => {
      const id = identifier.trim();
      const body: Record<string, string> = isPhone(id)
        ? { phone: id, password }
        : { email: id, password };
      if (verificationToken) body.verification_token = verificationToken;
      const r = await apiCall<{ token: string; user: UserProfile }>(apiUrl, '/api/auth/register', null, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      await saveSession(r.token, r.user);
      return r.token;
    },
    [apiUrl, saveSession],
  );

  const logout = useCallback(async () => {
    await AsyncStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    if (!token) return;
    const me = await apiCall<UserProfile>(apiUrl, '/api/auth/me', token);
    setUser(me);
  }, [apiUrl, token]);

  const updateProfile = useCallback(
    async (patch: { username?: string; display_name?: string; is_private?: boolean }) => {
      if (!token) throw new Error('Not signed in');
      const u = await apiCall<UserProfile>(apiUrl, '/api/auth/me', token, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      setUser(u);
    },
    [apiUrl, token],
  );

  const uploadAvatar = useCallback(
    async (imageDataUrl: string) => {
      if (!token) throw new Error('Not signed in');
      const u = await apiCall<UserProfile>(apiUrl, '/api/auth/avatar', token, {
        method: 'POST',
        body: JSON.stringify({ image_data: imageDataUrl }),
      });
      setUser(u);
    },
    [apiUrl, token],
  );

  return (
    <Ctx.Provider
      value={{ token, user, authReady, saveSession, login, register, logout, refreshUser, updateProfile, uploadAvatar }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}

/** Server-side save helpers (require auth token). */
export async function fetchServerSaves(baseUrl: string, token: string) {
  return apiCall<{ saves: any[] }>(baseUrl, '/api/saves', token);
}
export async function serverSave(baseUrl: string, token: string, eventId: number) {
  return apiCall<{ saved: boolean }>(baseUrl, `/api/saves/${eventId}`, token, { method: 'POST' });
}
export async function serverUnsave(baseUrl: string, token: string, eventId: number) {
  return apiCall<{ saved: boolean }>(baseUrl, `/api/saves/${eventId}`, token, { method: 'DELETE' });
}

/** Email verification: request a 6-digit code. */
export async function requestEmailCode(baseUrl: string, email: string) {
  return apiCall<{ sent: boolean; already_sent?: boolean; expires_in_minutes: number }>(
    baseUrl,
    '/api/auth/request-code',
    null,
    { method: 'POST', body: JSON.stringify({ email: email.trim() }) },
  );
}

/** Email verification: verify the code, returns a verification token for registration. */
export async function verifyEmailCode(baseUrl: string, email: string, code: string) {
  return apiCall<{ verified: boolean; verification_token: string }>(
    baseUrl,
    '/api/auth/verify-code',
    null,
    { method: 'POST', body: JSON.stringify({ email: email.trim(), code: code.trim() }) },
  );
}

/** Phone verification: request a 6-digit code via SMS. */
export async function requestPhoneCode(baseUrl: string, phone: string) {
  return apiCall<{ sent: boolean; already_sent?: boolean; expires_in_minutes: number; dev_code?: string }>(
    baseUrl,
    '/api/auth/request-phone-code',
    null,
    { method: 'POST', body: JSON.stringify({ phone: phone.trim() }) },
  );
}

/** Phone verification: verify the code, returns a verification token for registration. */
export async function verifyPhoneCode(baseUrl: string, phone: string, code: string) {
  return apiCall<{ verified: boolean; verification_token: string }>(
    baseUrl,
    '/api/auth/verify-phone-code',
    null,
    { method: 'POST', body: JSON.stringify({ phone: phone.trim(), code: code.trim() }) },
  );
}

/** True if the identifier looks like a phone number (vs email). */
export function isPhoneIdentifier(s: string): boolean {
  return isPhone(s);
}

/** Password reset: request a 6-digit code for an existing account. */
export async function requestPasswordReset(baseUrl: string, identifier: string) {
  const body = isPhoneIdentifier(identifier)
    ? { phone: identifier.trim() }
    : { email: identifier.trim() };
  return apiCall<{ sent: boolean; already_sent?: boolean; expires_in_minutes: number }>(
    baseUrl,
    '/api/auth/request-password-reset',
    null,
    { method: 'POST', body: JSON.stringify(body) },
  );
}

/** Password reset: verify the code, returns a short-lived reset token. */
export async function verifyResetCode(baseUrl: string, identifier: string, code: string) {
  const body = isPhoneIdentifier(identifier)
    ? { phone: identifier.trim(), code: code.trim() }
    : { email: identifier.trim(), code: code.trim() };
  return apiCall<{ verified: boolean; reset_token: string }>(
    baseUrl,
    '/api/auth/verify-reset-code',
    null,
    { method: 'POST', body: JSON.stringify(body) },
  );
}

/** Password reset: set the new password. */
export async function resetPassword(baseUrl: string, resetToken: string, newPassword: string) {
  return apiCall<{ reset: boolean }>(
    baseUrl,
    '/api/auth/reset-password',
    null,
    { method: 'POST', body: JSON.stringify({ reset_token: resetToken, new_password: newPassword }) },
  );
}

export interface PublicProfile {
  username: string;
  display_name: string;
  avatar_url: string | null;
  is_private: boolean;
  created_at: string;
  is_owner: boolean;
  saves: any[] | 'private';
  save_count?: number;
}

/** Fetch a user's public profile. Pass a token so the API can detect the owner. */
export async function getPublicProfile(baseUrl: string, username: string, token?: string | null) {
  return apiCall<PublicProfile>(
    baseUrl,
    `/api/users/${encodeURIComponent(username)}`,
    token ?? null,
  );
}
