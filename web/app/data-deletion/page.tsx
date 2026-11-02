import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Data Deletion Instructions | Joinaroo',
  description: 'How to request deletion of your Joinaroo data.',
};

export default function DataDeletionPage() {
  return (
    <main className="container" style={{ maxWidth: 720, paddingTop: 32, paddingBottom: 64 }}>
      <h1>Data Deletion Instructions</h1>

      <h2>Delete your Joinaroo account and data</h2>
      <p>
        To delete your account and all associated personal data:
      </p>
      <ol>
        <li>Sign in to <Link href="/">Joinaroo</Link>.</li>
        <li>Go to your profile settings.</li>
        <li>Choose the option to delete your account.</li>
      </ol>
      <p>
        This permanently removes your profile, saved events, and sign-in credentials
        from our systems.
      </p>

      <h2>Facebook data deletion requests</h2>
      <p>
        If you signed in with Facebook and want us to delete data we received from Facebook,
        you can also remove Joinaroo from your Facebook account under Settings → Apps and
        websites. Once removed, we delete any Facebook-provided data (name, email, profile
        picture) within 30 days.
      </p>

      <h2>Contact</h2>
      <p>
        For deletion requests or questions, reach us at <Link href="/">joinaroo.com</Link>.
      </p>
    </main>
  );
}
