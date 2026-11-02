import { useCallback, useEffect, useState } from 'react';
import { getStoredUser, setStoredUser, setToken } from './api';
import { ToastProvider, useToast } from './toast';
import Login from './Login';
import Dashboard from './Dashboard';

function Shell() {
  const notify = useToast();
  const [authed, setAuthed] = useState<boolean>(() => !!localStorage.getItem('sme_admin_token'));
  const [me, setMe] = useState(getStoredUser);

  const handleAuthError = useCallback(() => {
    setToken(null);
    setStoredUser(null);
    setAuthed(false);
    notify('Session expired — please log in again.', 'error');
  }, [notify]);

  useEffect(() => {
    // cross-tab logout sync
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'sme_admin_token' && !e.newValue) setAuthed(false);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  function logout() {
    setToken(null);
    setStoredUser(null);
    setMe(null);
    setAuthed(false);
    notify('Signed out.', 'info');
  }

  if (!authed) {
    return (
      <Login
        onLoggedIn={() => {
          setMe(getStoredUser());
          setAuthed(true);
        }}
      />
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">SME</span>
          <span className="brand-name">Admin Console</span>
        </div>
        <div className="topbar-right">
          {me && <span className="muted">{me.email}</span>}
          <button className="btn btn-sm" onClick={logout}>Sign out</button>
        </div>
      </header>
      <main className="main">
        <Dashboard onAuthError={handleAuthError} />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  );
}
