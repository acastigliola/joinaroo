import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from './api';
import { useToast } from './toast';

// Analytics report (Angelo, Oct 26): answers the recurring questions with
// the house rules baked in — real browsers only, Google/datacenter bots
// excluded server-side, and the admin-managed ignored-IP list subtracted.
// Dates are sent as explicit ms bounds (browser-local days).

interface ReportData {
  from: number;
  to: number;
  summary: {
    visitors: number; pageviews: number; explorers: number; repeaters: number;
    singles: number; authViews: number; signups: number; galleryViews: number;
    detailsClicks: number; listedbyClicks: number; seenBefore: number; scrolledPhotos: number;
    botViews: number; ignoredViews: number; rawViews: number;
  };
  explorers: {
    ip: string; city: string | null; region: string | null; isp: string | null;
    views: number; steps: { ts: number; page: string; referrer: string | null }[];
  }[];
  topPages: { page: string; views: number; visitors: number; photoViews: number; scrolledPhotos: number; detailsClicks: number; listedbyClicks: number; googleRefs: number; chatgptRefs: number }[];
  detailsFunnel: { page: string; googleLandings: number; googleClickers: number; googleBounceAfterClick: number }[];
  topReferrers: { referrer: string; views: number }[];
  aiReferrers: { source: string; views: number; visitors: number }[];
  devices: { device: string; visitors: number; pageviews: number }[];
  daily: { day: string; visitors: number; pageviews: number }[];
  ips: {
    ip: string; city: string | null; region: string | null; country: string | null;
    isp: string | null; views: number; distinctPages: number;
    firstSeen: number; lastSeen: number; cls: 'counted' | 'ignored' | 'bot'; note: string | null;
    seenBefore: boolean;
  }[];
  ignoredList: { ip: string; note: string | null; created_at: string }[];
}

type Preset = 'today' | 'yesterday' | '7d' | '30d';

function bounds(preset: Preset): { from: number; to: number } {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  switch (preset) {
    case 'today': return { from: startOfToday, to: now.getTime() };
    case 'yesterday': return { from: startOfToday - 86400000, to: startOfToday };
    case '7d': return { from: startOfToday - 6 * 86400000, to: now.getTime() };
    case '30d': return { from: startOfToday - 29 * 86400000, to: now.getTime() };
  }
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}
function fmtClock(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
function place(city: string | null, region: string | null, country?: string | null): string {
  return [city, region, country].filter(Boolean).join(', ') || '—';
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="analytics-section">
      <h3>{title}</h3>
      {children}
    </div>
  );
}


export default function Analytics({ onAuthError }: { onAuthError: () => void }) {
  const notify = useToast();
  const [preset, setPreset] = useState<Preset>('today');
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [newIp, setNewIp] = useState('');
  const [newNote, setNewNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { from, to } = bounds(preset);
      const d = await api.getAnalyticsReport(from, to);
      setData(d);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) onAuthError();
      else notify('Failed to load analytics.', 'error');
    } finally {
      setLoading(false);
    }
  }, [preset, notify, onAuthError]);

  useEffect(() => { load(); }, [load]);

  const toggleIgnore = useCallback(async (ip: string, currentlyIgnored: boolean) => {
    try {
      if (currentlyIgnored) await api.unignoreIp(ip);
      else await api.ignoreIp(ip);
      await load();
    } catch {
      notify('Failed to update the ignore list.', 'error');
    }
  }, [load, notify]);

  const addIgnored = useCallback(async () => {
    const ip = newIp.trim();
    if (!ip) return;
    try {
      await api.ignoreIp(ip, newNote.trim() || undefined);
      setNewIp(''); setNewNote('');
      await load();
    } catch {
      notify('Could not add that IP — check the format.', 'error');
    }
  }, [newIp, newNote, load, notify]);

  if (loading && !data) return <p>Loading analytics…</p>;
  if (!data) return <p>No analytics data.</p>;
  const s = data.summary;

  return (
    <div className="analytics">
      <div className="analytics-controls">
        <div className="preset-row">
          {([['today', 'Today'], ['yesterday', 'Yesterday'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days']] as [Preset, string][]).map(([key, label]) => (
            <button
              key={key}
              className={`btn preset-btn${preset === key ? ' active' : ''}`}
              onClick={() => setPreset(key)}
            >{label}</button>
          ))}
        </div>
        <button className="btn" onClick={load}>Refresh</button>
        <span className="excluded-note">
          Excluded from the counts: {s.botViews.toLocaleString()} bot views · {s.ignoredViews.toLocaleString()} ignored-IP views · {s.rawViews.toLocaleString()} raw rows in range
        </span>
      </div>

      <Section title="How a visit ends up">
        <p className="empty-note">Visitors in this range, split by what they did. The bar shows every row below in proportion. Details click and Listed by click sit inside Single-page — those visitors clicked through to the source and left, the full life cycle in one visit. The first three rows split the visitors; Seen Before, Gallery click and Scrolled Photos overlap them — Seen Before marks visitors who had already visited before this range opened, and the Gallery and Scrolled rows count those actions in this range. Listed by is the other door to the source — it stays live on ended pages after the details button expires.</p>
        {s.visitors > 0 ? (
          <>
            {(() => {
              // Details click and Listed by click nest inside the blue:
              // both are carved out of the Single-page segment (its
              // right-hand end), not added to the bar — those visitors
              // ARE single-page visitors who completed the doorway pass
              // before leaving. Listed by sits left of Details: the two
              // blues are close, so the mid-blue separates Listed by from
              // the bar's outer end.
              const nested = Math.min(s.detailsClicks, s.singles);
              const nestedListed = Math.min(s.listedbyClicks, Math.max(0, s.singles - nested));
              const outer: { n: number; color: string }[] = [
                { n: s.repeaters, color: '#e0a526' },
                { n: s.explorers, color: '#1d9e4b' },
                { n: s.seenBefore, color: '#7c5cd6' },
                { n: s.galleryViews, color: '#d6336c' },
                { n: s.scrolledPhotos, color: '#0b7285' },
              ];
              const total = s.singles + outer.reduce((a, x) => a + x.n, 0);
              return (
                <div className="lifecycle-bar">
                  {total > 0 && s.singles > 0 && (
                    <div className="lifecycle-seg" style={{ width: `${(s.singles / total) * 100}%`, background: '#2c5aa0', display: 'flex' }}>
                      {nestedListed > 0 && <div style={{ width: `${(nestedListed / s.singles) * 100}%`, background: '#38bdf8', height: '100%', marginLeft: 'auto' }} />}
                      {nested > 0 && <div style={{ width: `${(nested / s.singles) * 100}%`, background: '#3390d7', height: '100%', ...(nestedListed > 0 ? {} : { marginLeft: 'auto' }) }} />}
                    </div>
                  )}
                  {total > 0 && outer.filter(x => x.n > 0).map((x, i) => (
                    <div key={i} className="lifecycle-seg" style={{ width: `${(x.n / total) * 100}%`, background: x.color }} />
                  ))}
                </div>
              );
            })()}
            <div className="lifecycle-rows">
              <div className="lifecycle-row"><span><span className="lifecycle-dot" style={{ background: '#2c5aa0' }} />Single-page (saw one page, left)</span><strong>{s.singles.toLocaleString()}</strong></div>
              <div className="lifecycle-row"><span><span className="lifecycle-dot" style={{ background: '#3390d7' }} />Details click (clicked More Event Details)</span><strong>{s.detailsClicks.toLocaleString()}</strong></div>
              <div className="lifecycle-row"><span><span className="lifecycle-dot" style={{ background: '#38bdf8' }} />Listed by click (clicked the Listed by source link)</span><strong>{s.listedbyClicks.toLocaleString()}</strong></div>
              <div className="lifecycle-row"><span><span className="lifecycle-dot" style={{ background: '#e0a526' }} />Returners (same page, 2+ views)</span><strong>{s.repeaters.toLocaleString()}</strong></div>
              <div className="lifecycle-row"><span><span className="lifecycle-dot" style={{ background: '#1d9e4b' }} />Explorers (2+ different pages)</span><strong>{s.explorers.toLocaleString()}</strong></div>
              <div className="lifecycle-row"><span><span className="lifecycle-dot" style={{ background: '#7c5cd6' }} />Seen Before (had visited before this range)</span><strong>{s.seenBefore.toLocaleString()}</strong></div>
              <div className="lifecycle-row"><span><span className="lifecycle-dot" style={{ background: '#d6336c' }} />Gallery click (opened the photo gallery)</span><strong>{s.galleryViews.toLocaleString()}</strong></div>
              <div className="lifecycle-row"><span><span className="lifecycle-dot" style={{ background: '#0b7285' }} />Scrolled Photos (scrolled the photo row for more)</span><strong>{s.scrolledPhotos.toLocaleString()}</strong></div>
            </div>
          </>
        ) : (
          <p className="empty-note">No counted visitors in this range.</p>
        )}
      </Section>

      <div className="analytics-stats">
        <div className="stat-card"><div className="stat-num">{s.visitors.toLocaleString()}</div><div className="stat-label">Visitors</div></div>
        <div className="stat-card"><div className="stat-num">{s.pageviews.toLocaleString()}</div><div className="stat-label">Pageviews</div></div>
        <div className="stat-card"><div className="stat-num">{s.explorers.toLocaleString()}</div><div className="stat-label">Explorers (2+ pages)</div></div>
        <div className="stat-card"><div className="stat-num">{s.repeaters.toLocaleString()}</div><div className="stat-label">Returners (same page)</div></div>
        <div className="stat-card"><div className="stat-num">{s.singles.toLocaleString()}</div><div className="stat-label">Single-page</div></div>
        <div className="stat-card"><div className="stat-num">{s.authViews.toLocaleString()}</div><div className="stat-label">/auth views</div></div>
        <div className="stat-card"><div className="stat-num">{s.signups.toLocaleString()}</div><div className="stat-label">New sign-ups</div></div>
        <div className="stat-card"><div className="stat-num">{s.seenBefore.toLocaleString()}</div><div className="stat-label">Seen Before</div><div className="stat-sub">User previously visited before time range</div></div>
      </div>

      {data.daily.length > 1 && (
        <Section title="Visitors by day">
          <table>
            <thead><tr><th>Day</th><th>Visitors</th><th>Pageviews</th></tr></thead>
            <tbody>
              {data.daily.map(d => (
                <tr key={d.day}><td className="mono">{d.day}</td><td className="num">{d.visitors}</td><td className="num">{d.pageviews}</td></tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      <Section title={`Explorers — visitors who viewed 2+ different pages (${s.explorers})`}>
        {data.explorers.length === 0 && <p className="empty-note">No multi-page visitors in this range — every visitor saw one page.</p>}
        {data.explorers.map(e => (
          <div key={e.ip} className="explorer-block">
            <div className="explorer-head">
              <strong>{place(e.city, e.region)}</strong> · {e.isp || 'unknown ISP'} · {e.views} views · <span className="mono">{e.ip}</span>
            </div>
            <div className="explorer-steps">
              {e.steps.map((st, i) => (
                <span key={i} className="explorer-step">
                  {i > 0 && <span className="explorer-arrow">→</span>}
                  <span className="mono">{fmtClock(st.ts)}</span> {st.page}
                </span>
              ))}
            </div>
          </div>
        ))}
      </Section>

      <div className="analytics-grid">
        <Section title="Top pages">
          <table><tbody>
            {data.topPages.map(r => (
              <tr key={r.page}><td className="mono"><a className="top-page-link" href={`https://joinaroo.com${r.page}`} target="_blank" rel="noreferrer">{r.page}</a>{(r.googleRefs > 0 || r.chatgptRefs > 0) && <span className="ref-counts">Google {r.googleRefs} - ChatGPT {r.chatgptRefs}</span>}</td><td className="num"><div className="page-stats"><span>{r.views} views</span><span>{r.visitors} visitors</span>{r.photoViews > 0 && <span>{r.photoViews} gallery view{r.photoViews === 1 ? '' : 's'}</span>}{r.scrolledPhotos > 0 && <span>{r.scrolledPhotos} scrolled photo{r.scrolledPhotos === 1 ? '' : 's'}</span>}{r.detailsClicks > 0 && <span>{r.detailsClicks} details click{r.detailsClicks === 1 ? '' : 's'}</span>}{r.listedbyClicks > 0 && <span>{r.listedbyClicks} listed-by click{r.listedbyClicks === 1 ? '' : 's'}</span>}</div></td></tr>
            ))}
            {data.topPages.length === 0 && <tr><td colSpan={2}>No pageviews yet</td></tr>}
          </tbody></table>
        </Section>
        <Section title="Top referrers (external)">
          <table><tbody>
            {data.topReferrers.map(r => (
              <tr key={r.referrer}><td className="mono">{r.referrer.slice(0, 60)}</td><td className="num">{r.views}</td></tr>
            ))}
            {data.topReferrers.length === 0 && <tr><td colSpan={2}>No external referrers in range</td></tr>}
          </tbody></table>
        </Section>

        <Section title="Top AI referrers">
          <table><tbody>
            {data.aiReferrers.map(r => (
              <tr key={r.source}><td>{r.source}</td><td className="num">{r.views} views · {r.visitors} visitor{r.visitors === 1 ? '' : 's'}</td></tr>
            ))}
            {data.aiReferrers.length === 0 && <tr><td colSpan={2}>No AI-referred visits in range</td></tr>}
          </tbody></table>
        </Section>

        <Section title="Devices">
          <table><tbody>
            {data.devices.map(r => (
              <tr key={r.device}><td>{r.device.charAt(0).toUpperCase() + r.device.slice(1)}</td><td className="num">{r.visitors} visitor{r.visitors === 1 ? '' : 's'} · {r.pageviews} pageviews</td></tr>
            ))}
            {data.devices.length === 0 && <tr><td colSpan={2}>No visitors in range</td></tr>}
          </tbody></table>
        </Section>
      </div>

      <Section title="Ignored IPs">
        {data.ignoredList.length === 0 && <p className="empty-note">None yet — add your phone's IP here when it changes.</p>}
        {data.ignoredList.length > 0 && (
          <table>
            <tbody>
              {data.ignoredList.map(r => (
                <tr key={r.ip}>
                  <td className="mono">{r.ip}</td>
                  <td>{r.note || '—'}</td>
                  <td className="num"><button className="btn small" onClick={() => toggleIgnore(r.ip, true)}>Unignore</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="ignore-form">
          <input type="text" placeholder="IP address to ignore" value={newIp} onChange={e => setNewIp(e.target.value)} />
          <input type="text" placeholder="Note (optional, e.g. Angelo)" value={newNote} onChange={e => setNewNote(e.target.value)} />
          <button className="btn" onClick={addIgnored}>Add to ignore list</button>
        </div>
      </Section>

      <Section title="All IPs in this report">
        <div className="table-wrap">
          <table>
            <thead><tr><th>IP</th><th>Location</th><th>ISP</th><th>Views</th><th>Pages</th><th>First seen</th><th>Last seen</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {data.ips.map(r => (
                <tr key={r.ip} className={r.seenBefore ? 'ip-seen-before' : r.cls !== 'counted' ? 'ip-muted' : ''}>
                  <td className="mono">{r.ip}</td>
                  <td>{place(r.city, r.region, r.country)}</td>
                  <td>{r.isp || '—'}</td>
                  <td className="num">{r.views}</td>
                  <td className="num">{r.distinctPages}</td>
                  <td className="mono">{fmtTime(r.firstSeen)}</td>
                  <td className="mono">{fmtTime(r.lastSeen)}</td>
                  <td>
                    {r.cls === 'counted' && <span className="pill pill-counted">Counted</span>}
                    {r.cls === 'ignored' && <span className="pill pill-ignored">Ignored{r.note ? ` · ${r.note}` : ''}</span>}
                    {r.cls === 'bot' && <span className="pill pill-bot">Bot / datacenter</span>}
                  </td>
                  <td className="num">
                    {r.cls === 'ignored'
                      ? <button className="btn small" onClick={() => toggleIgnore(r.ip, true)}>Unignore</button>
                      : <button className="btn small" onClick={() => toggleIgnore(r.ip, false)}>Ignore</button>}
                  </td>
                </tr>
              ))}
              {data.ips.length === 0 && <tr><td colSpan={9}>No IPs in this range</td></tr>}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
