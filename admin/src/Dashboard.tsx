import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, getStoredUser, ApiError } from './api';
import type { Category, EventItem, UserItem, Venue } from './types';
import { useToast } from './toast';
import EventDialog from './EventDialog';
import UserDialog from './UserDialog';
import Analytics from './Analytics';
import SmsInbox from './SmsInbox';

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

type Tab = 'events' | 'users' | 'analytics' | 'sms';

export default function Dashboard({ onAuthError }: { onAuthError: () => void }) {
  const notify = useToast();
  const me = getStoredUser();
  const [tab, setTab] = useState<Tab>('events');

  // shared lookups
  const [categories, setCategories] = useState<Category[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);

  // events
  const [events, setEvents] = useState<EventItem[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [dialog, setDialog] = useState<{ open: boolean; event: EventItem | null }>({ open: false, event: null });
  const [confirmDelete, setConfirmDelete] = useState<EventItem | null>(null);

  // users
  const [users, setUsers] = useState<UserItem[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<UserItem | null>(null);

  const searchTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(searchTimer.current);
  }, [search ]);

  const loadEvents = useCallback(async () => {
    setEventsLoading(true);
    try {
      const { events: list } = await api.listEvents(debouncedSearch || undefined);
      setEvents(list);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onAuthError();
        return;
      }
      notify(err instanceof Error ? err.message : 'Failed to load events.', 'error');
    } finally {
      setEventsLoading(false);
    }
  }, [debouncedSearch, notify, onAuthError]);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      setUsers(await api.listUsers());
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onAuthError();
        return;
      }
      notify(err instanceof Error ? err.message : 'Failed to load users.', 'error');
    } finally {
      setUsersLoading(false);
    }
  }, [notify, onAuthError]);

  const loadLookups = useCallback(async () => {
    try {
      const [cats, vns] = await Promise.all([api.listCategories(), api.listVenues()]);
      setCategories(cats);
      setVenues(vns);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onAuthError();
        return;
      }
      notify(err instanceof Error ? err.message : 'Failed to load categories/venues.', 'error');
    }
  }, [notify, onAuthError]);

  useEffect(() => {
    loadLookups();
  }, [loadLookups]);
  useEffect(() => {
    loadEvents();
  }, [loadEvents]);
  useEffect(() => {
    if (tab === 'users') loadUsers();
  }, [tab, loadUsers]);

  // Filtered event list (admin list already includes hidden events via include_hidden).
  const visibleEvents = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    const merged = [...events];
    merged.sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));
    if (!q) return merged;
    return merged.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        (e.description ?? '').toLowerCase().includes(q),
    );
  }, [events, debouncedSearch]);

  function handleEventSaved(saved: EventItem, wasNew: boolean) {
    setDialog({ open: false, event: null });
    setEvents((prev) => {
      const rest = prev.filter((e) => e.id !== saved.id);
      return [...rest, saved].sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));
    });
    notify(wasNew ? `Event "${saved.title}" created.` : `Event "${saved.title}" saved.`, 'success');
  }

  async function handleDeleteEvent() {
    if (!confirmDelete) return;
    const target = confirmDelete;
    setConfirmDelete(null);
    try {
      await api.deleteEvent(target.id);
      setEvents((prev) => prev.filter((e) => e.id !== target.id));
      notify(`Event "${target.title}" deleted.`, 'success');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onAuthError();
        return;
      }
      notify(err instanceof Error ? err.message : 'Delete failed.', 'error');
    }
  }

  async function toggleEventFlag(ev: EventItem, field: 'featured' | 'hidden') {
    const next = !ev[field];
    try {
      const saved = await api.updateEvent(ev.id, { [field]: next });
      setEvents((prev) => prev.map((e) => (e.id === saved.id ? saved : e)));
      notify(`"${saved.title}" ${next ? 'is now' : 'is no longer'} ${field}.`, 'success');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onAuthError();
        return;
      }
      notify(err instanceof Error ? err.message : 'Update failed.', 'error');
    }
  }

  // ---- users ----
  async function toggleLock(u: UserItem) {
    if (me && u.id === me.id) {
      notify('You cannot lock your own account.', 'error');
      return;
    }
    try {
      const saved = await api.updateUser(u.id, { locked: !u.locked });
      setUsers((prev) => prev.map((x) => (x.id === saved.id ? saved : x)));
      notify(`${saved.email} ${saved.locked ? 'locked' : 'unlocked'}.`, 'success');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onAuthError();
        return;
      }
      notify(err instanceof Error ? err.message : 'Update failed.', 'error');
    }
  }

  async function changeRole(u: UserItem, role: string) {
    if (u.role === role) return;
    try {
      const saved = await api.updateUser(u.id, { role });
      setUsers((prev) => prev.map((x) => (x.id === saved.id ? saved : x)));
      notify(`${saved.email} is now ${saved.role}.`, 'success');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onAuthError();
        return;
      }
      notify(err instanceof Error ? err.message : 'Role change failed.', 'error');
    }
  }

  async function handleDeleteUser() {
    if (!confirmDeleteUser) return;
    const target = confirmDeleteUser;
    setConfirmDeleteUser(null);
    if (me && target.id === me.id) {
      notify('You cannot delete your own account.', 'error');
      return;
    }
    try {
      await api.deleteUser(target.id);
      setUsers((prev) => prev.filter((x) => x.id !== target.id));
      notify(`User ${target.email} deleted.`, 'success');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onAuthError();
        return;
      }
      notify(err instanceof Error ? err.message : 'Delete failed.', 'error');
    }
  }

  return (
    <div className="dash">
      <div className="tabs">
        <button className={tab === 'events' ? 'tab active' : 'tab'} onClick={() => setTab('events')}>
          Events
        </button>
        <button className={tab === 'users' ? 'tab active' : 'tab'} onClick={() => setTab('users')}>
          Users
        </button>
        <button className={tab === 'analytics' ? 'tab active' : 'tab'} onClick={() => setTab('analytics')}>
          Analytics
        </button>
        <button className={tab === 'sms' ? 'tab active' : 'tab'} onClick={() => setTab('sms')}>
          SMS Inbox
        </button>
      </div>

      {tab === 'events' && (
        <section>
          <div className="toolbar">
            <input
              className="search"
              placeholder="Search events…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button className="btn btn-primary" onClick={() => setDialog({ open: true, event: null })}>
              ＋ Add event
            </button>
          </div>

          {eventsLoading ? (
            <p className="muted">Loading events…</p>
          ) : visibleEvents.length === 0 ? (
            <p className="muted">No events found.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Category</th>
                    <th>Venue / City</th>
                    <th>Starts</th>
                    <th>Featured</th>
                    <th>Hidden</th>
                    <th className="actions-col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleEvents.map((ev) => (
                    <tr key={ev.id} className={ev.hidden ? 'row-hidden' : ''}>
                      <td className="title-cell">{ev.title}</td>
                      <td>{ev.category?.name ?? '—'}</td>
                      <td>{ev.venue ? `${ev.venue.name} · ${ev.venue.city}` : '—'}</td>
                      <td className="nowrap">{fmtDate(ev.starts_at)}</td>
                      <td>
                        <button
                          className={`pill ${ev.featured ? 'pill-on' : ''}`}
                          title="Toggle featured"
                          onClick={() => toggleEventFlag(ev, 'featured')}
                        >
                          {ev.featured ? '★ yes' : 'no'}
                        </button>
                      </td>
                      <td>
                        <button
                          className={`pill ${ev.hidden ? 'pill-on' : ''}`}
                          title="Toggle hidden"
                          onClick={() => toggleEventFlag(ev, 'hidden')}
                        >
                          {ev.hidden ? 'yes' : 'no'}
                        </button>
                      </td>
                      <td className="actions-col">
                        <button className="btn btn-sm" onClick={() => setDialog({ open: true, event: ev })}>
                          Edit
                        </button>
                        <button className="btn btn-sm btn-danger" onClick={() => setConfirmDelete(ev)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="muted fine">
            Hidden events are included here via the admin <code>include_hidden</code> flag; they never appear on
            the public site or API.
          </p>
        </section>
      )}

      {tab === 'users' && (
        <section>
          <div className="toolbar">
            <span className="muted">{users.length} user{users.length === 1 ? '' : 's'}</span>
            <button className="btn btn-primary" onClick={() => setUserDialogOpen(true)}>
              ＋ Add user
            </button>
          </div>

          {usersLoading ? (
            <p className="muted">Loading users…</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Locked</th>
                    <th>Created</th>
                    <th className="actions-col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className={u.locked ? 'row-hidden' : ''}>
                      <td>{u.name}{me && u.id === me.id ? ' (you)' : ''}</td>
                      <td>{u.email}</td>
                      <td>
                        <select
                          value={u.role}
                          onChange={(e) => changeRole(u, e.target.value)}
                          disabled={me !== null && u.id === me.id}
                          title={me && u.id === me.id ? 'You cannot change your own role here' : 'Change role'}
                        >
                          <option value="user">user</option>
                          <option value="admin">admin</option>
                        </select>
                      </td>
                      <td>{u.locked ? 'yes' : 'no'}</td>
                      <td className="nowrap">{fmtDate(u.created_at)}</td>
                      <td className="actions-col">
                        <button
                          className="btn btn-sm"
                          onClick={() => toggleLock(u)}
                          disabled={me !== null && u.id === me.id}
                          title={me && u.id === me.id ? 'You cannot lock your own account' : u.locked ? 'Unlock' : 'Lock'}
                        >
                          {u.locked ? 'Unlock' : 'Lock'}
                        </button>
                        <button className="btn btn-sm btn-danger" onClick={() => setConfirmDeleteUser(u)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {dialog.open && (
        <EventDialog
          event={dialog.event}
          categories={categories}
          venues={venues}
          onSaved={handleEventSaved}
          onVenuesChanged={loadLookups}
          onClose={() => setDialog({ open: false, event: null })}
          onAuthError={onAuthError}
        />
      )}

      {userDialogOpen && (
        <UserDialog
          onSaved={(u) => {
            setUserDialogOpen(false);
            setUsers((prev) => [...prev, u].sort((a, b) => a.id - b.id));
            notify(`User ${u.email} created.`, 'success');
          }}
          onClose={() => setUserDialogOpen(false)}
          onAuthError={onAuthError}
        />
      )}

      {confirmDelete && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirmDelete(null); }}>
          <div className="card modal modal-sm">
            <h2>Delete event?</h2>
            <p>“{confirmDelete.title}” will be permanently removed. This cannot be undone.</p>
            <div className="modal-actions">
              <button className="btn" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleDeleteEvent}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {tab === 'analytics' && (
        <section>
          <Analytics onAuthError={onAuthError} />
        </section>
      )}

      {tab === 'sms' && (
        <section>
          <SmsInbox />
        </section>
      )}

      {confirmDeleteUser && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirmDeleteUser(null); }}>
          <div className="card modal modal-sm">
            <h2>Delete user?</h2>
            <p>{confirmDeleteUser.email} will be permanently removed. This cannot be undone.</p>
            <div className="modal-actions">
              <button className="btn" onClick={() => setConfirmDeleteUser(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleDeleteUser}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
