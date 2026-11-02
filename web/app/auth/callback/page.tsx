'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../lib/auth';

export default function AuthCallbackPage() {
  const router = useRouter();
  const { saveSession } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    const oauthError = qs.get('oauth_error');
    if (oauthError) {
      setError(decodeURIComponent(oauthError));
      return;
    }
    const exchangeId = qs.get('exchange');
    // Legacy: direct token param (Facebook still uses this)
    const legacyToken = qs.get('token');
    if (!exchangeId && !legacyToken) {
      setError('No sign-in data found. Please try signing in again.');
      return;
    }
    const getToken = exchangeId
      ? fetch('/api/auth/exchange?id=' + encodeURIComponent(exchangeId))
          .then(async (r) => {
            if (!r.ok) throw new Error('exchange failed');
            const d = await r.json();
            return d.token as string;
          })
      : Promise.resolve(legacyToken as string);
    getToken
      .then((token) =>
        fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + token } })
          .then(async (r) => {
            if (!r.ok) {
              const body = await r.text().catch(() => '');
              throw new Error('HTTP ' + r.status + ': ' + body.substring(0, 100));
            }
            return r.json().then((user) => ({ token, user }));
          })
      )
      .then(({ token, user }) => {
        if (user) {
          saveSession(token, user);
          router.replace('/');
        } else {
          setError('Could not verify your sign-in. Please try again.');
        }
      })
      .catch((e) => setError('Sign-in failed (' + e.message + '). Please try again.'));
  }, []);

  return (
    <main className="container" style={{ paddingTop: 64, textAlign: 'center' }}>
      {error ? (
        <>
          <p style={{ color: '#c62828', marginBottom: 16 }}>Sign-in failed: {error}</p>
          <button
            onClick={() => router.replace('/')}
            style={{
              padding: '12px 24px',
              borderRadius: 999,
              border: 'none',
              background: '#0B1D3A',
              color: '#fff',
              fontSize: 16,
            }}
          >
            Back to Joinaroo
          </button>
        </>
      ) : (
        <p>Signing you in…</p>
      )}
    </main>
  );
}
