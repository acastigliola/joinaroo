import Link from 'next/link';
import { notFound } from 'next/navigation';

/** Dev-only inbox viewer: shows emails caught by Mailpit (localhost:8025). */
export const dynamic = 'force-dynamic';

interface MailpitMessage {
  ID: string;
  From: { Address: string };
  To: { Address: string }[];
  Subject: string;
  Date: string;
  Snippet: string;
}

async function getMessages(): Promise<MailpitMessage[]> {
  try {
    const res = await fetch('http://127.0.0.1:8025/api/v1/messages', { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    return data.messages ?? [];
  } catch {
    return [];
  }
}

async function getCode(id: string): Promise<string | null> {
  try {
    const res = await fetch(`http://127.0.0.1:8025/api/v1/message/${id}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    const m = /(\d{6})/.exec(data.Text ?? '');
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

export default async function DevInboxPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  const messages = await getMessages();
  const withCodes = await Promise.all(
    messages.map(async (m) => ({ ...m, code: await getCode(m.ID) })),
  );

  return (
    <div style={{ padding: 20, maxWidth: 640, margin: '0 auto' }}>
      <p style={{ background: '#fff3cd', padding: 10, borderRadius: 8, fontSize: 13 }}>
        ⚠️ Dev only — shows test emails caught by Mailpit. Not for production.
      </p>
      <h1>Test inbox</h1>
      {withCodes.length === 0 ? (
        <p>No emails yet. Request a verification code from the signup flow.</p>
      ) : (
        withCodes.map((m) => (
          <div
            key={m.ID}
            style={{
              border: '1px solid #ddd',
              borderRadius: 10,
              padding: 14,
              marginBottom: 12,
              background: '#fff',
            }}
          >
            <p style={{ margin: '0 0 4px', fontWeight: 700 }}>{m.Subject}</p>
            <p style={{ margin: '0 0 4px', fontSize: 13, color: '#666' }}>
              To: {m.To.map((t) => t.Address).join(', ')}
            </p>
            {m.code && (
              <p style={{ margin: '8px 0 0', fontSize: 28, fontWeight: 800, letterSpacing: 6 }}>
                {m.code}
              </p>
            )}
            <p style={{ margin: '8px 0 0', fontSize: 12, color: '#999' }}>{m.Date}</p>
          </div>
        ))
      )}
      <p>
        <Link href="/">← Back to events</Link>
      </p>
    </div>
  );
}
