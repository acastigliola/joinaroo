import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Service | Joinaroo',
  description: 'Joinaroo terms of service.',
};

export default function TermsPage() {
  return (
    <main className="container" style={{ maxWidth: 720, paddingTop: 32, paddingBottom: 64 }}>
      <h1>Terms of Service</h1>
      <p style={{ color: '#666' }}>Last updated: October 17, 2026</p>

      <h2>The service</h2>
      <p>
        Joinaroo helps you discover local events. Event information is gathered from public sources
        and venues; we do our best to keep it accurate but cannot guarantee every detail.
        Always confirm date, time, and ticket availability with the event organizer.
      </p>

      <h2>Accounts</h2>
      <p>
        You may browse without an account. Creating an account lets you save events and personalize
        recommendations. You are responsible for keeping your sign-in credentials secure.
      </p>

      <h2>SMS verification</h2>
      <p>
        If you sign in with a phone number, we send one-time verification codes by SMS.
        Message frequency varies. Message and data rates may apply. Reply STOP to opt out;
        reply HELP for help. Consent to receive these messages is not a condition of purchase.
      </p>

      <h2>Acceptable use</h2>
      <ul>
        <li>Don't misuse the service, scrape it aggressively, or interfere with other users.</li>
        <li>Don't post content you don't have the right to share.</li>
      </ul>

      <h2>Tickets and purchases</h2>
      <p>
        Joinaroo links to third-party ticketing providers. Purchases are between you and the
        provider; their terms apply.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these terms as the service evolves. Continued use after changes means
        you accept the updated terms.
      </p>

      <h2>Contact</h2>
      <p>
        Questions? Reach us at <Link href="/">joinaroo.com</Link>.
      </p>
    </main>
  );
}
