import { useState, type FormEvent } from 'react';
import { api, setStoredUser, setToken, ApiError } from './api';
import { useToast } from './toast';

export default function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const notify = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { token, user } = await api.login(email.trim(), password);
      if (user.role !== 'admin') {
        setToken(null);
        setStoredUser(null);
        setError('This console is for administrators only.');
        return;
      }
      setToken(token);
      setStoredUser(user);
      notify(`Welcome back, ${user.name}.`, 'success');
      onLoggedIn();
    } catch (err) {
      const msg =
        err instanceof ApiError && err.status === 401
          ? 'Invalid email or password.'
          : err instanceof Error
            ? err.message
            : 'Login failed.';
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="card login-card" onSubmit={handleSubmit}>
        <h1>SME Admin</h1>
        <p className="muted">Southern Maine Events — admin console</p>
        <label>
          Email
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <div className="alert alert-error">{error}</div>}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
