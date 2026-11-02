import { useState, type FormEvent } from 'react';
import { api, ApiError } from './api';
import type { UserItem } from './types';
import { useToast } from './toast';

interface Props {
  onSaved: (user: UserItem) => void;
  onClose: () => void;
  onAuthError: () => void;
}

export default function UserDialog({ onSaved, onClose, onAuthError }: Props) {
  const notify = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('user');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !email.trim() || !password) {
      setError('Name, email and password are required.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setBusy(true);
    try {
      const created = await api.createUser({ name: name.trim(), email: email.trim(), password, role });
      onSaved(created);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onAuthError();
        return;
      }
      const msg = err instanceof Error ? err.message : 'Create failed.';
      setError(msg);
      notify(msg, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="card modal modal-sm" onSubmit={handleSubmit}>
        <h2>Add user</h2>
        <label>
          Name *
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          Email *
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Password * (min 8 chars)
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />
        </label>
        <label>
          Role
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
        </label>
        {error && <div className="alert alert-error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Creating…' : 'Create user'}
          </button>
        </div>
      </form>
    </div>
  );
}
