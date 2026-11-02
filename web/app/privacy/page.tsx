import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy | Joinaroo',
  description: 'Joinaroo privacy policy.',
};

export default function PrivacyPage() {
  return (
    <main className="container" style={{ maxWidth: 720, paddingTop: 32, paddingBottom: 64 }}>
      <h1>Privacy Policy</h1>
      <p style={{ color: '#666' }}>Last updated: October 19, 2026</p>

      <h2>What we collect</h2>
      <p>
        Joinaroo collects only what it needs to run the service: your email address or phone number
        (for sign-in and verification codes), your saved events, and your location or selected town
        (to show nearby events). We do not sell your personal information.
      </p>

      <h2>How we use it</h2>
      <ul>
        <li>Sign-in and account security, including one-time verification codes sent by SMS.</li>
        <li>Showing you events near your location or chosen town.</li>
        <li>Remembering your saved events on your device.</li>
      </ul>

      <h2>SMS messages</h2>
      <p>
        If you provide a phone number, we send one-time verification codes for sign-in only.
        Message frequency varies. Message and data rates may apply. Reply STOP to opt out of
        SMS messages at any time; reply HELP for help.
      </p>

      <h2>Data sharing</h2>
      <p>
        We do not sell or rent your personal information. Your mobile information will not be sold
        or shared with third parties for promotional or marketing purposes. We share data only with
        service providers needed to operate the app (such as SMS delivery), and only the minimum required.
      </p>

      <h2>Your choices</h2>
      <p>
        You can use Joinaroo without an account. You can delete your account and data at any time
        from your profile settings.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy? Reach us at <Link href="/">joinaroo.com</Link>.
      </p>
    </main>
  );
}
