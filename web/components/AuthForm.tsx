'use client';

// Shared TikTok-style auth form: method picker -> phone/email -> password.
// Used by both the /auth page and the AuthModal overlay.
import { useEffect, useRef, useState } from 'react';
import { useAuth, serverSave, requestEmailCode, verifyEmailCode, requestPhoneCode, verifyPhoneCode, isPhoneIdentifier, requestPasswordReset, verifyResetCode, resetPassword } from '../lib/auth';
import { getEvent } from '../lib/api';

type Step = 'methods' | 'identifier' | 'verify' | 'password' | 'reset-identifier' | 'reset-code' | 'reset-new-password' | 'reset-done';

function hasLetter(s: string) {
  return /[a-zA-Z]/.test(s);
}
function hasNumber(s: string) {
  return /[0-9]/.test(s);
}
function hasSpecial(s: string) {
  return /[^a-zA-Z0-9]/.test(s);
}

/** Live password requirement checks with green checkmarks. */
function PasswordChecks({ password }: { password: string }) {
  const lengthOk = password.length >= 8;
  const complexityOk = hasLetter(password) && hasNumber(password) && hasSpecial(password);
  const rows = [
    { label: '8 to 20 characters', ok: lengthOk },
    { label: 'Letters, numbers, and special characters', ok: complexityOk },
  ];
  return (
    <div className="pw-checks">
      {rows.map((r) => (
        <div key={r.label} className={'pw-check' + (r.ok ? ' pw-check-ok' : '')}>
          <span className="pw-box">{r.ok ? '✓' : ''}</span>
          <span>{r.label}</span>
        </div>
      ))}
    </div>
  );
}

export default function AuthForm({
  initialMode = 'signup',
  initialStep = 'methods',
  pendingEventId = null,
  onDone,
  onClose,
}: {
  initialMode?: 'login' | 'signup';
  initialStep?: 'methods' | 'identifier';
  pendingEventId?: number | null;
  onDone: () => void;
  onClose?: () => void;
}) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
  const [step, setStep] = useState<Step>(initialStep);
  const [identifier, setIdentifier] = useState('');
  const [smsConsent, setSmsConsent] = useState(false);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [verificationToken, setVerificationToken] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Identifier the server rejected as already registered during signup.
  // Only this exact value is ever carried into the login flow.
  const [rejectedIdentifier, setRejectedIdentifier] = useState<string | null>(null);
  // Password-reset flow state.
  const [showForgotLink, setShowForgotLink] = useState(false);
  const [resetCode, setResetCode] = useState('');
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const resetSubmitting = useRef(false);
  const codeSubmitting = useRef(false);

  const passwordValid =
    password.length >= 8 &&
    password.length <= 20 &&
    hasLetter(password) &&
    hasNumber(password) &&
    hasSpecial(password);

  const finishAuth = async (token: string) => {
    // Migrate pre-account local saves.
    try {
      const raw = localStorage.getItem('sme:saved-slugs:v1');
      if (raw) {
        const slugs: string[] = JSON.parse(raw);
        for (const slug of slugs) {
          try {
            const ev = await getEvent(slug);
            await serverSave(token, Number((ev as any).id));
          } catch {
            /* skip */
          }
        }
        localStorage.removeItem('sme:saved-slugs:v1');
      }
    } catch {
      /* best-effort */
    }
    if (pendingEventId != null) {
      try {
        await serverSave(token, pendingEventId);
      } catch {
        /* don't block */
      }
    }
    onDone();
  };

  const submit = async () => {
    setError(null);
    // Password strength rules apply to new signups only — never gate a login
    // on them (an existing password predates any rule change).
    if (mode === 'signup' && !passwordValid) {
      setError('Password must be 8–20 characters with letters, numbers, and special characters.');
      return;
    }
    if (mode === 'login' && !password.trim()) {
      setError('Enter your password.');
      return;
    }
    setBusy(true);
    try {
      const t =
        mode === 'login'
          ? await login(identifier, password)
          : await register(identifier, password, verificationToken ?? undefined);
      await finishAuth(t);
    } catch (e: any) {
      const msg = e?.message ?? 'Something went wrong.';
      setError(msg);
      // Offer the reset flow only when the password itself was rejected.
      setShowForgotLink(mode === 'login' && msg === 'invalid credentials');
    } finally {
      setBusy(false);
    }
  };

  // ----- password reset -----

  const newPasswordValid =
    newPassword.length >= 8 &&
    newPassword.length <= 20 &&
    hasLetter(newPassword) &&
    hasNumber(newPassword) &&
    hasSpecial(newPassword);

  const sendResetCode = async () => {
    setError(null);
    setBusy(true);
    try {
      await requestPasswordReset(identifier);
      setResetCode('');
      setStep('reset-code');
    } catch (e: any) {
      setError(e?.message ?? 'Could not send code.');
    } finally {
      setBusy(false);
    }
  };

  const submitResetCode = async (value?: string) => {
    setError(null);
    const c = (value ?? resetCode).trim();
    if (c.length !== 6) {
      setError('Enter the 6-digit code.');
      return;
    }
    setBusy(true);
    try {
      const r = await verifyResetCode(identifier, c);
      setResetToken(r.reset_token);
      setNewPassword('');
      setStep('reset-new-password');
    } catch (e: any) {
      setError(e?.message ?? 'Verification failed.');
    } finally {
      setBusy(false);
    }
  };

  const submitNewPassword = async () => {
    setError(null);
    if (!newPasswordValid) {
      setError('Password must be 8–20 characters with letters, numbers, and special characters.');
      return;
    }
    if (!resetToken) {
      setError('Reset session expired — request a new code.');
      return;
    }
    setBusy(true);
    try {
      await resetPassword(resetToken, newPassword);
      setStep('reset-done');
    } catch (e: any) {
      setError(e?.message ?? 'Could not update password.');
    } finally {
      setBusy(false);
    }
  };

  const startReset = () => {
    setError(null);
    setShowForgotLink(false);
    setResetToken(null);
    setNewPassword('');
    setStep('reset-identifier');
  };

  // Auto-submit once the 6th reset digit is entered.
  useEffect(() => {
    if (step !== 'reset-code' || resetCode.trim().length !== 6 || busy || resetSubmitting.current) return;
    resetSubmitting.current = true;
    submitResetCode(resetCode).finally(() => {
      resetSubmitting.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetCode, step, busy]);

  const sendCode = async () => {
    setError(null);
    setRejectedIdentifier(null);
    setBusy(true);
    try {
      if (isPhoneIdentifier(identifier)) {
        await requestPhoneCode(identifier);
      } else {
        await requestEmailCode(identifier);
      }
      setCode('');
      setStep('verify');
    } catch (e: any) {
      const msg = e?.message ?? 'Could not send code.';
      setError(msg);
      // Remember the exact identifier the server rejected, so the "Log in"
      // link can carry it over. Anything else starts login blank.
      if (/already registered/i.test(msg)) {
        setRejectedIdentifier(identifier.trim());
      }
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (value?: string) => {
    setError(null);
    const c = (value ?? code).trim();
    if (c.length !== 6) {
      setError('Enter the 6-digit code.');
      return;
    }
    setBusy(true);
    try {
      const r = isPhoneIdentifier(identifier)
        ? await verifyPhoneCode(identifier, c)
        : await verifyEmailCode(identifier, c);
      setVerificationToken(r.verification_token);
      setStep('password');
    } catch (e: any) {
      setError(e?.message ?? 'Verification failed.');
    } finally {
      setBusy(false);
    }
  };

  // Auto-submit once the 6th digit is entered.
  useEffect(() => {
    if (step !== 'verify' || code.trim().length !== 6 || busy || codeSubmitting.current) return;
    codeSubmitting.current = true;
    submitCode(code).finally(() => {
      codeSubmitting.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, step, busy]);

  const continueFromIdentifier = () => {
    if (mode === 'signup') {
      sendCode();
    } else {
      setStep('password');
    }
  };

  const sso = (provider: string) => {
    if (provider === 'Facebook') {
      window.location.href = '/api/auth/facebook';
      return;
    }
    if (provider === 'Google') {
      window.location.href = '/api/auth/google';
      return;
    }
    if (provider === 'Apple') {
      window.location.href = '/api/auth/apple';
      return;
    }
    alert(`${provider} sign-in needs an OAuth app configured. For now, use phone or email.`);
  };

  return (
    <>
      {step === 'methods' ? (
        <>
          <div className="auth-brand-row">
            <img src="/joinaroo-logo-v2.png" alt="Joinaroo" className="auth-brand-logo" />
            {onClose && (
              <button className="auth-modal-close" onClick={onClose} aria-label="Close">
                ✕
              </button>
            )}
          </div>
          <h1>Get started</h1>
          <p className="auth-tagline">
            Join Joinaroo to save events, get personalized recommendations, and never miss what's happening near you.
          </p>
          <button className="auth-provider auth-provider-primary" onClick={() => setStep('identifier')}>
            <img src="/icons/icon-email-dark.png" alt="" className="auth-provider-icon" />
            <span className="auth-provider-label">Continue with email or phone</span>
            <span className="auth-provider-chevron">›</span>
          </button>
          <button className="auth-provider" onClick={() => sso('Facebook')}>
            <img src="/icons/icon-facebook.png" alt="" className="auth-provider-icon" />
            <span className="auth-provider-label">Continue with Facebook</span>
            <span className="auth-provider-chevron">›</span>
          </button>
          <button className="auth-provider" onClick={() => sso('Google')}>
            <img src="/icons/icon-google.png" alt="" className="auth-provider-icon" />
            <span className="auth-provider-label">Continue with Google</span>
            <span className="auth-provider-chevron">›</span>
          </button>
          <button className="auth-provider" onClick={() => sso('Apple')}>
            <img src="/icons/icon-apple.png" alt="" className="auth-provider-icon" />
            <span className="auth-provider-label">Continue with Apple</span>
            <span className="auth-provider-chevron">›</span>
          </button>
          <div className="auth-divider">or</div>
          <p className="auth-switch">
            Already have an account?{' '}
            <button
              onClick={() => {
                setMode('login');
                setStep('identifier');
                setError(null);
              }}
            >
              Log in
            </button>
          </p>
        </>
      ) : (
        <h1>
          {step.startsWith('reset')
            ? 'Reset password'
            : mode === 'login'
              ? 'Log in'
              : 'Sign up'}
        </h1>
      )}

      {step === 'identifier' && (
        <>
          <label className="auth-label">Enter your phone number or email</label>
          <input
            className="auth-input"
            value={identifier}
            onChange={(e) => {
              setIdentifier(e.target.value);
              // Edited after a rejection — the captured value is stale.
              setRejectedIdentifier(null);
            }}
            placeholder="Phone or email"
            autoFocus
          />
          {!identifier.trim().includes('@') && (
            <label className="auth-sms-consent">
              <input
                type="checkbox"
                checked={smsConsent}
                onChange={(e) => setSmsConsent(e.target.checked)}
              />
              <span>
                I agree to receive SMS messages from Joinaroo, including one-time verification codes.
                Message frequency varies. Message and data rates may apply. Reply STOP to opt out at
                any time; reply HELP for help. Your mobile information will not be sold or shared
                with third parties for promotional or marketing purposes. See our{' '}
                <a href="/privacy" target="_blank" rel="noopener">Privacy Policy</a>.
              </span>
            </label>
          )}
          {error && <p className="auth-error">{error}</p>}
          <button
            className="auth-primary"
            disabled={!identifier.trim() || busy || (isPhoneIdentifier(identifier.trim()) && !smsConsent)}
            onClick={continueFromIdentifier}
          >
            {busy ? 'Sending…' : 'Continue'}
          </button>
          <button className="auth-back" onClick={() => setStep('methods')}>
            ← Back
          </button>
        </>
      )}

      {step === 'verify' && (
        <>
          <label className="auth-label">Enter the 6-digit code</label>
          <p className="auth-sub">We sent a code to {identifier.trim()}.</p>
          <input
            className="auth-input auth-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
            placeholder="••••••"
            maxLength={6}
            autoFocus
          />
          {error && <p className="auth-error">{error}</p>}
          <button
            className="auth-primary"
            disabled={code.trim().length !== 6 || busy}
            onClick={() => submitCode()}
          >
            {busy ? 'Verifying…' : 'Verify'}
          </button>
          <button className="auth-back" onClick={sendCode} disabled={busy}>
            Resend code
          </button>
          <button className="auth-back" onClick={() => setStep('identifier')}>
            ← Back
          </button>
        </>
      )}

      {step === 'password' && (
        <>
          <label className="auth-label">Enter password</label>
          <p className="auth-sub">{identifier.trim()}</p>
          <div className="pw-row">
            <input
              className="auth-input pw-input"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              maxLength={mode === 'signup' ? 20 : undefined}
              autoFocus
            />
            <button
              type="button"
              className="pw-eye"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? '👁' : '👁‍🗨'}
            </button>
          </div>
          {mode === 'signup' && <PasswordChecks password={password} />}
          {error && <p className="auth-error">{error}</p>}
          <button className="auth-primary" disabled={(mode === 'signup' ? !passwordValid : !password.trim()) || busy} onClick={submit}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Sign up'}
          </button>
          <button
            className="auth-back"
            onClick={() => {
              setPassword('');
              setShowForgotLink(false);
              setStep('identifier');
            }}
          >
            ← Back
          </button>
          {mode === 'login' && showForgotLink && (
            <button className="auth-back auth-forgot" onClick={startReset}>
              Forgot password?
            </button>
          )}
        </>
      )}

      {step === 'reset-identifier' && (
        <>
          <label className="auth-label">Reset your password</label>
          <p className="auth-sub">Enter your phone number or email and we'll send a reset code.</p>
          <input
            className="auth-input"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="Phone or email"
            autoFocus
          />
          {error && <p className="auth-error">{error}</p>}
          <button className="auth-primary" disabled={!identifier.trim() || busy} onClick={sendResetCode}>
            {busy ? 'Sending…' : 'Send code'}
          </button>
          <button
            className="auth-back"
            onClick={() => {
              setMode('login');
              setStep('password');
              setError(null);
            }}
          >
            ← Back to log in
          </button>
        </>
      )}

      {step === 'reset-code' && (
        <>
          <label className="auth-label">Enter the 6-digit code</label>
          <p className="auth-sub">We sent a reset code to {identifier.trim()}.</p>
          <input
            className="auth-input auth-code"
            value={resetCode}
            onChange={(e) => setResetCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
            placeholder="••••••"
            maxLength={6}
            autoFocus
          />
          {error && <p className="auth-error">{error}</p>}
          <button
            className="auth-primary"
            disabled={resetCode.trim().length !== 6 || busy}
            onClick={() => submitResetCode()}
          >
            {busy ? 'Verifying…' : 'Verify'}
          </button>
          <button className="auth-back" onClick={sendResetCode} disabled={busy}>
            Resend code
          </button>
          <button className="auth-back" onClick={() => setStep('reset-identifier')}>
            ← Back
          </button>
        </>
      )}

      {step === 'reset-new-password' && (
        <>
          <label className="auth-label">Choose a new password</label>
          <p className="auth-sub">{identifier.trim()}</p>
          <div className="pw-row">
            <input
              className="auth-input pw-input"
              type={showNewPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password"
              maxLength={20}
              autoFocus
            />
            <button
              type="button"
              className="pw-eye"
              onClick={() => setShowNewPassword((v) => !v)}
              aria-label={showNewPassword ? 'Hide password' : 'Show password'}
            >
              {showNewPassword ? '👁' : '👁‍🗨'}
            </button>
          </div>
          <PasswordChecks password={newPassword} />
          {error && <p className="auth-error">{error}</p>}
          <button className="auth-primary" disabled={!newPasswordValid || busy} onClick={submitNewPassword}>
            {busy ? 'Please wait…' : 'Update password'}
          </button>
          <button className="auth-back" onClick={() => setStep('reset-code')}>
            ← Back
          </button>
        </>
      )}

      {step === 'reset-done' && (
        <>
          <label className="auth-label">Password updated</label>
          <p className="auth-sub">Log in with your new password.</p>
          <button
            className="auth-primary"
            onClick={() => {
              setMode('login');
              setStep('password');
              setPassword('');
              setNewPassword('');
              setResetToken(null);
              setError(null);
            }}
          >
            Back to log in
          </button>
        </>
      )}

      {step === 'methods' ? (
        <p className="auth-terms">
          By continuing, you agree to our <a href="/terms">Terms of Service</a><br />
          and <a href="/privacy">Privacy Policy</a>.
        </p>
      ) : (
      <p className="auth-switch">
        {mode === 'login' ? (
          <>
            Don't have an account?{' '}
            <button
              onClick={() => {
                setMode('signup');
                setStep('methods');
                setIdentifier('');
                setRejectedIdentifier(null);
                setPassword('');
                setShowForgotLink(false);
                setResetToken(null);
                setError(null);
              }}
            >
              Sign up
            </button>
          </>
        ) : (
          <>
            Already have an account?{' '}
            <button
              onClick={() => {
                // Land on the login identifier step with the rejected address
                // pre-populated (still editable). Carry it over ONLY when the
                // server rejected it as already registered — otherwise login
                // starts blank.
                const carry = rejectedIdentifier;
                setMode('login');
                setStep('identifier');
                setIdentifier(carry ?? '');
                setRejectedIdentifier(null);
                setPassword('');
                setShowForgotLink(false);
                setResetToken(null);
                setError(null);
              }}
            >
              Log in
            </button>
          </>
        )}
      </p>
      )}
    </>
  );
}
