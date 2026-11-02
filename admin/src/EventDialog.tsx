import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from './api';
import type { Category, EventItem, Venue } from './types';
import { useToast } from './toast';

function isoToLocal(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localToIso(local: string): string {
  if (!local) return '';
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local) ? `${local}:00` : local;
}

interface Props {
  event: EventItem | null; // null = add mode
  categories: Category[];
  venues: Venue[];
  onSaved: (saved: EventItem, wasNew: boolean) => void;
  onVenuesChanged: () => void;
  onClose: () => void;
  onAuthError: () => void;
}

export default function EventDialog({ event, categories, venues, onSaved, onVenuesChanged, onClose, onAuthError }: Props) {
  const notify = useToast();
  const [title, setTitle] = useState(event?.title ?? '');
  const [description, setDescription] = useState(event?.description ?? '');
  const [categorySlug, setCategorySlug] = useState(event?.category?.slug ?? categories[0]?.slug ?? '');
  const [venueMode, setVenueMode] = useState<'existing' | 'new'>('existing');
  const [venueId, setVenueId] = useState<string>(event?.venue?.id ? String(event.venue.id) : '');
  const [nvName, setNvName] = useState('');
  const [nvAddress, setNvAddress] = useState('');
  const [nvCity, setNvCity] = useState('');
  const [nvLat, setNvLat] = useState('');
  const [nvLng, setNvLng] = useState('');
  const [startsAt, setStartsAt] = useState(isoToLocal(event?.starts_at));
  const [endsAt, setEndsAt] = useState(isoToLocal(event?.ends_at));
  const [costFree, setCostFree] = useState(!!event?.cost_free);
  const [costText, setCostText] = useState(event?.cost_text ?? '');
  const [url, setUrl] = useState(event?.url ?? '');
  const [source, setSource] = useState(event?.source ?? '');
  const [featured, setFeatured] = useState(!!event?.featured);
  const [hidden, setHidden] = useState(!!event?.hidden);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }
    if (!categorySlug) {
      setError('Pick a category.');
      return;
    }
    if (!startsAt) {
      setError('Start date/time is required.');
      return;
    }
    setBusy(true);
    try {
      let resolvedVenueId: number | undefined = venueMode === 'existing' && venueId ? Number(venueId) : undefined;

      if (venueMode === 'new') {
        if (!nvName.trim() || !nvCity.trim()) {
          setError('New venue needs at least a name and city.');
          setBusy(false);
          return;
        }
        const lat = nvLat.trim() === '' ? undefined : Number(nvLat);
        const lng = nvLng.trim() === '' ? undefined : Number(nvLng);
        if ((nvLat.trim() !== '' && Number.isNaN(lat)) || (nvLng.trim() !== '' && Number.isNaN(lng))) {
          setError('Latitude/longitude must be numbers.');
          setBusy(false);
          return;
        }
        const created = await api.createVenue({
          name: nvName.trim(),
          address: nvAddress.trim() || undefined,
          city: nvCity.trim(),
          lat: lat ?? null,
          lng: lng ?? null,
        });
        resolvedVenueId = created.id;
        onVenuesChanged();
      }

      const payload: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim() || undefined,
        category_slug: categorySlug,
        starts_at: localToIso(startsAt),
        ends_at: endsAt ? localToIso(endsAt) : undefined,
        cost_free: costFree,
        cost_text: costText.trim() || undefined,
        url: url.trim() || undefined,
        source: source.trim() || undefined,
        featured,
        hidden,
      };
      if (resolvedVenueId !== undefined) payload.venue_id = resolvedVenueId;

      const wasNew = !event;
      const saved = event ? await api.updateEvent(event.id, payload) : await api.createEvent(payload);
      onSaved(saved, wasNew);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onAuthError();
        return;
      }
      const msg = err instanceof Error ? err.message : 'Save failed.';
      setError(msg);
      notify(msg, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="card modal" onSubmit={handleSubmit}>
        <h2>{event ? 'Edit event' : 'Add event'}</h2>

        <label>
          Title *
          <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} />
        </label>

        <label>
          Description
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
        </label>

        <div className="grid-2">
          <label>
            Category *
            <select value={categorySlug} onChange={(e) => setCategorySlug(e.target.value)} required>
              <option value="">— pick —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.slug}>{c.name}</option>
              ))}
            </select>
          </label>
          <label>
            Venue
            <select value={venueMode === 'new' ? '__new' : venueId} onChange={(e) => {
              if (e.target.value === '__new') setVenueMode('new');
              else { setVenueMode('existing'); setVenueId(e.target.value); }
            }}>
              <option value="">— none —</option>
              {venues.map((v) => (
                <option key={v.id} value={String(v.id)}>{v.name} ({v.city})</option>
              ))}
              <option value="__new">＋ New venue…</option>
            </select>
          </label>
        </div>

        {venueMode === 'new' && (
          <fieldset className="inline-venue">
            <legend>New venue</legend>
            <div className="grid-2">
              <label>Name *<input value={nvName} onChange={(e) => setNvName(e.target.value)} /></label>
              <label>City *<input value={nvCity} onChange={(e) => setNvCity(e.target.value)} /></label>
            </div>
            <label>Address<input value={nvAddress} onChange={(e) => setNvAddress(e.target.value)} /></label>
            <div className="grid-2">
              <label>Lat<input value={nvLat} onChange={(e) => setNvLat(e.target.value)} inputMode="decimal" placeholder="43.66" /></label>
              <label>Lng<input value={nvLng} onChange={(e) => setNvLng(e.target.value)} inputMode="decimal" placeholder="-70.25" /></label>
            </div>
          </fieldset>
        )}

        <div className="grid-2">
          <label>
            Starts at *
            <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
          </label>
          <label>
            Ends at
            <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </label>
        </div>

        <div className="grid-2">
          <label>
            Cost text
            <input value={costText} onChange={(e) => setCostText(e.target.value)} placeholder="$20 / $10 advance" />
          </label>
          <label>
            URL
            <input value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" placeholder="https://…" />
          </label>
        </div>

        <label>
          Source
          <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. portlandoldport.com" />
        </label>

        <div className="check-row">
          <label className="check"><input type="checkbox" checked={costFree} onChange={(e) => setCostFree(e.target.checked)} /> Free event</label>
          <label className="check"><input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} /> Featured (promoted)</label>
          <label className="check"><input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} /> Hidden</label>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : event ? 'Save changes' : 'Add event'}
          </button>
        </div>
      </form>
    </div>
  );
}
