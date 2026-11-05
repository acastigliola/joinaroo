import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

// SMS inbox (moved to its own tab Oct 28, 2026 — Angelo's ask; previously a
// section on the Analytics page). Shows texts received on the Joinaroo
// Telnyx number, delivered by the Telnyx webhook into

interface SmsMessage { id: number; ts: number; from_number: string | null; to_number: string | null; text: string | null }

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export default function SmsInbox() {
  const [messages, setMessages] = useState<SmsMessage[] | null>(null);
  const load = useCallback(async () => {
    try {
      const d = await api.getSmsInbox();
      setMessages(d.messages || []);
    } catch { setMessages([]); }
  }, []);
  useEffect(() => { load(); }, [load]);
  return (
    <div className="analytics-section">
      <h3>SMS inbox — texts received on the Joinaroo number</h3>
      <div style={{ marginBottom: 8 }}>
        <button className="btn small" onClick={load}>Refresh inbox</button>
      </div>
      {messages === null && <p className="empty-note">Loading…</p>}
      {messages !== null && messages.length === 0 && (
        <p className="empty-note">No inbound texts yet. Verification codes sent to the Joinaroo number will appear here.</p>
      )}
      {messages !== null && messages.length > 0 && (
        <table>
          <thead><tr><th>Time</th><th>From</th><th>Message</th></tr></thead>
          <tbody>
            {messages.map(m => (
              <tr key={m.id}>
                <td className="mono">{fmtTime(m.ts)}</td>
                <td className="mono">{m.from_number || '—'}</td>
                <td>{m.text || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
