'use client';

// Account auth state for the web frontend: token + profile in localStorage.
// Mirrors mobile/src/lib/auth.tsx.
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { API_BASE_URL } from './api';

const TOKEN_KEY = 'sme:authToken';

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

interface AuthModalState {
  open: boolean;
  mode: 'login' | 'signup';
  pendingEventId: number | null;
}

interface AuthState {
  token: string | null;
  user: UserProfile | null;
  authReady: boolean;
  login: (identifier: string, password: string) => Promise<string>;
  register: (identifier: string, password: string, verificationToken?: string) => Promise<string>;
  saveSession: (token: string, user: UserProfile) => void;
  logout: () => void;
  updateProfile: (patch: {
    username?: string;
    display_name?: string;
    is_private?: boolean;
  }) => Promise<void>;
  uploadAvatar: (imageDataUrl: string) => Promise<void>;
  authModal: AuthModalState;
  openAuth: (mode?: 'login' | 'signup', pendingEventId?: number | null) => void;
  closeAuth: () => void;
}

const Ctx = createContext<AuthState | null>(null);

function isPhone(s: string): boolean {
  return /^[+\d][\d\s\-().]{6,}$/.test(s.trim());
}

async function apiCall<T>(path: string, token: string | null, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { ...headers, ...((init?.headers as Record<string, string>) ?? {}) },
    });
  } catch {
    throw new Error('Could not reach the API.');
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authModal, setAuthModal] = useState<AuthModalState>({
    open: false,
    mode: 'signup',
    pendingEventId: null,
  });

  const openAuth = useCallback(
    (mode: 'login' | 'signup' = 'signup', pendingEventId: number | null = null) => {
      setAuthModal({ open: true, mode, pendingEventId });
    },
    [],
  );
  const closeAuth = useCallback(() => {
    setAuthModal((m) => ({ ...m, open: false }));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const t = localStorage.getItem(TOKEN_KEY);
        if (t) {
          const me = await apiCall<UserProfile>('/api/auth/me', t);
          setToken(t);
          setUser(me);
        }
      } catch {
        localStorage.removeItem(TOKEN_KEY);
      } finally {
        setAuthReady(true);
      }
    })();
  }, []);

  const saveSession = useCallback((t: string, u: UserProfile) => {
    localStorage.setItem(TOKEN_KEY, t);
    setToken(t);
    setUser(u);
  }, []);

  const login = useCallback(
    async (identifier: string, password: string) => {
      const id = identifier.trim();
      const body = isPhone(id) ? { phone: id, password } : { email: id, password };
      const r = await apiCall<{ token: string; user: UserProfile }>('/api/auth/login', null, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      saveSession(r.token, r.user);
      return r.token;
    },
    [saveSession],
  );

  const register = useCallback(
    async (identifier: string, password: string, verificationToken?: string) => {
      const id = identifier.trim();
      const body: Record<string, string> = isPhone(id)
        ? { phone: id, password }
        : { email: id, password };
      if (verificationToken) body.verification_token = verificationToken;
      const r = await apiCall<{ token: string; user: UserProfile }>('/api/auth/register', null, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      saveSession(r.token, r.user);
      return r.token;
    },
    [saveSession],
  );

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const updateProfile = useCallback(
    async (patch: { username?: string; display_name?: string; is_private?: boolean }) => {
      if (!token) throw new Error('Not signed in');
      const u = await apiCall<UserProfile>('/api/auth/me', token, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      setUser(u);
    },
    [token],
  );

  const uploadAvatar = useCallback(
    async (imageDataUrl: string) => {
      if (!token) throw new Error('Not signed in');
      const u = await apiCall<UserProfile>('/api/auth/avatar', token, {
        method: 'POST',
        body: JSON.stringify({ image_data: imageDataUrl }),
      });
      setUser(u);
    },
    [token],
  );

  return (
    <Ctx.Provider
      value={{
        token,
        user,
        authReady,
        login,
        register,
        saveSession,
        logout,
        updateProfile,
        uploadAvatar,
        authModal,
        openAuth,
        closeAuth,
      }}
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

export async function fetchServerSaves(token: string) {
  return apiCall<{ saves: any[] }>('/api/saves', token);
}
export async function serverSave(token: string, eventId: number) {
  return apiCall<{ saved: boolean }>(`/api/saves/${eventId}`, token, { method: 'POST' });
}
export async function serverUnsave(token: string, eventId: number) {
  return apiCall<{ saved: boolean }>(`/api/saves/${eventId}`, token, { method: 'DELETE' });
}

export async function requestEmailCode(email: string) {
  return apiCall<{ sent: boolean; already_sent?: boolean; expires_in_minutes: number }>('/api/auth/request-code', null, {
    method: 'POST',
    body: JSON.stringify({ email: email.trim() }),
  });
}

export async function verifyEmailCode(email: string, code: string) {
  return apiCall<{ verified: boolean; verification_token: string }>('/api/auth/verify-code', null, {
    method: 'POST',
    body: JSON.stringify({ email: email.trim(), code: code.trim() }),
  });
}

export async function requestPhoneCode(phone: string) {
  return apiCall<{ sent: boolean; already_sent?: boolean; expires_in_minutes: number; dev_code?: string }>(
    '/api/auth/request-phone-code',
    null,
    { method: 'POST', body: JSON.stringify({ phone: phone.trim() }) },
  );
}

export async function verifyPhoneCode(phone: string, code: string) {
  return apiCall<{ verified: boolean; verification_token: string }>(
    '/api/auth/verify-phone-code',
    null,
    { method: 'POST', body: JSON.stringify({ phone: phone.trim(), code: code.trim() }) },
  );
}

export function isPhoneIdentifier(s: string): boolean {
  return isPhone(s);
}

/** Password reset: request a 6-digit code for an existing account. */
export async function requestPasswordReset(identifier: string) {
  const body = isPhoneIdentifier(identifier)
    ? { phone: identifier.trim() }
    : { email: identifier.trim() };
  return apiCall<{ sent: boolean; already_sent?: boolean; expires_in_minutes: number }>(
    '/api/auth/request-password-reset',
    null,
    { method: 'POST', body: JSON.stringify(body) },
  );
}

/** Password reset: verify the code, returns a short-lived reset token. */
export async function verifyResetCode(identifier: string, code: string) {
  const body = isPhoneIdentifier(identifier)
    ? { phone: identifier.trim(), code: code.trim() }
    : { email: identifier.trim(), code: code.trim() };
  return apiCall<{ verified: boolean; reset_token: string }>('/api/auth/verify-reset-code', null, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** Password reset: set the new password. */
export async function resetPassword(resetToken: string, newPassword: string) {
  return apiCall<{ reset: boolean }>('/api/auth/reset-password', null, {
    method: 'POST',
    body: JSON.stringify({ reset_token: resetToken, new_password: newPassword }),
  });
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
export async function getPublicProfile(username: string, token?: string | null): Promise<PublicProfile> {
  return apiCall<PublicProfile>(`/api/users/${encodeURIComponent(username)}`, token ?? null);
}
