'use client';

// TikTok-style auth overlay: small centered card over a dimmed backdrop,
// dismissible via ✕ or backdrop tap. Triggered via openAuth() from useAuth().
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '../lib/auth';
import AuthForm from './AuthForm';

export default function AuthModal() {
  const { authModal, closeAuth } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  if (!authModal.open) return null;

  const done = () => {
    closeAuth();
    // Land on My Saves after auth, mirroring the native flow.
    if (pathname !== '/saves') router.push('/saves');
    else router.refresh();
  };

  return (
    <div className="auth-overlay" onClick={closeAuth}>
      <div className="auth-modal-card" onClick={(e) => e.stopPropagation()}>
        <AuthForm
          key={authModal.mode}
          initialMode={authModal.mode}
          pendingEventId={authModal.pendingEventId}
          onDone={done}
          onClose={closeAuth}
        />
      </div>
    </div>
  );
}
