'use client';

// Standalone /auth page (also reachable directly). Uses the shared AuthForm.
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import AuthForm from '../../components/AuthForm';

function AuthPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const pending = params.get('pending');
  // Deep link: /auth?method=phone opens directly on the phone/email entry
  // step (used as the published opt-in form URL for SMS compliance review).
  const startAtIdentifier = params.get('method') === 'phone';

  return (
    <div className="auth-page">
      <div className="auth-card">
        <AuthForm
          initialStep={startAtIdentifier ? 'identifier' : 'methods'}
          pendingEventId={pending ? Number(pending) : null}
          onDone={() => router.push('/saves')}
        />
        <p className="auth-cancel">
          <Link href="/">← Back to browsing</Link>
        </p>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={<div className="auth-page"><p>Loading…</p></div>}>
      <AuthPageInner />
    </Suspense>
  );
}
