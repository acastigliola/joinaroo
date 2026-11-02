// Redesigned auth screen matching the mobile-site auth modal:
// dark navy card, Joinaroo logo, "Get started" heading, provider buttons.
// SSO via expo-web-browser for Google/Facebook (Apple parked).
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { useApp } from '../store';
import { useAuth, requestEmailCode, verifyEmailCode, requestPhoneCode, verifyPhoneCode, isPhoneIdentifier, requestPasswordReset, verifyResetCode, resetPassword } from '../lib/auth';

type Props = NativeStackScreenProps<RootStackParamList, 'Auth'>;

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
    <View style={styles.checks}>
      {rows.map((r) => (
        <View key={r.label} style={styles.checkRow}>
          <Text style={[styles.checkBox, r.ok && styles.checkBoxOk]}>{r.ok ? '✓' : ''}</Text>
          <Text style={[styles.checkLabel, r.ok && styles.checkLabelOk]}>{r.label}</Text>
        </View>
      ))}
    </View>
  );
}

export default function AuthScreen({ navigation, route }: Props) {
  const { apiUrl } = useApp();
  const { saveSession, login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>(route.params?.mode ?? 'signup');
  const [step, setStep] = useState<Step>('methods');
  const [identifier, setIdentifier] = useState('');
  const [smsConsent, setSmsConsent] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState('');
  const [verificationToken, setVerificationToken] = useState<string | null>(null);
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectedIdentifier, setRejectedIdentifier] = useState<string | null>(null);
  const [showForgotLink, setShowForgotLink] = useState(false);
  const [resetCode, setResetCode] = useState('');
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const resetSubmitting = useRef(false);
  const codeSubmitting = useRef(false);

  const pendingEventId = route.params?.pendingEventId;
  const isRoot = route.params?.isRoot === true;

  const finishAuth = async (newToken: string) => {
    try {
      const { getSavedSlugs } = await import('../lib/saves');
      const slugs = await getSavedSlugs();
      if (slugs.length > 0) {
        const { getEvent } = await import('../api');
        const { serverSave } = await import('../lib/auth');
        for (const slug of slugs) {
          try {
            const ev = await getEvent(apiUrl, slug);
            await serverSave(apiUrl, newToken, Number(ev.id));
          } catch {
            /* skip unresolvable slugs */
          }
        }
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        await AsyncStorage.removeItem('sme:saved-slugs:v1');
      }
    } catch {
      /* migration is best-effort */
    }
    if (pendingEventId != null) {
      try {
        const { serverSave } = await import('../lib/auth');
        await serverSave(apiUrl, newToken, pendingEventId);
      } catch {
        /* save failure shouldn't block login */
      }
    }
    navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
  };

  // ----- SSO via system browser -----
  // Opens the OAuth flow; the backend redirects to the app's deep link
  // (via return_url). The listener below catches it and completes login.
  const sso = async (provider: 'facebook' | 'google') => {
    setError(null);
    setBusy(true);
    try {
      const returnUrl = Linking.createURL('auth/callback');
      const authUrl = `${apiUrl}/api/auth/${provider}?native=true&return_url=${encodeURIComponent(returnUrl)}`;
      await WebBrowser.openBrowserAsync(authUrl);
      setBusy(false);
    } catch (e: any) {
      setError(e?.message ?? 'Could not open sign-in. Please try again.');
      setBusy(false);
    }
  };

  const completeSsoFromUrl = async (url: string) => {
    const m = url.match(/[?&]exchange=([^&]+)/);
    if (!m) throw new Error('Sign-in did not return a valid session.');
    const exchangeId = m[1];
    const exRes = await fetch(`${apiUrl}/api/auth/exchange?id=${encodeURIComponent(exchangeId)}`);
    if (!exRes.ok) throw new Error('Could not complete sign-in. Please try again.');
    const { token } = await exRes.json();
    const meRes = await fetch(`${apiUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!meRes.ok) throw new Error('Could not verify your sign-in.');
    const user = await meRes.json();
    await saveSession(token, user);
    await finishAuth(token);
  };

  useEffect(() => {
    const sub = Linking.addEventListener('url', async (event) => {
      if (!event.url.includes('exchange=')) return;
      try { await WebBrowser.dismissBrowser(); } catch {}
      setBusy(true);
      setError(null);
      try {
        await completeSsoFromUrl(event.url);
      } catch (e: any) {
        setError(e?.message ?? 'Sign-in failed. Please try again.');
      } finally {
        setBusy(false);
      }
    });
    return () => sub.remove();
  }, [apiUrl]);
  const ssoApple = () => {
    Alert.alert(
      'Apple Sign In',
      'Apple sign-in is coming soon. For now, use phone, email, Google, or Facebook.'
    );
  };

  const passwordValid =
    password.length >= 8 &&
    password.length <= 20 &&
    hasLetter(password) &&
    hasNumber(password) &&
    hasSpecial(password);

  const submit = async () => {
    setError(null);
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
      const t = mode === 'login'
        ? await login(identifier, password)
        : await register(identifier, password, verificationToken ?? undefined);
      await finishAuth(t);
    } catch (e: any) {
      const msg = e?.message ?? 'Something went wrong.';
      setError(msg);
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
      await requestPasswordReset(apiUrl, identifier);
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
      const r = await verifyResetCode(apiUrl, identifier, c);
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
      await resetPassword(apiUrl, resetToken, newPassword);
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
        await requestPhoneCode(apiUrl, identifier);
      } else {
        await requestEmailCode(apiUrl, identifier);
      }
      setCodeSent(true);
      setCode('');
      setStep('verify');
    } catch (e: any) {
      const msg = e?.message ?? 'Could not send code.';
      setError(msg);
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
        ? await verifyPhoneCode(apiUrl, identifier, c)
        : await verifyEmailCode(apiUrl, identifier, c);
      setVerificationToken(r.verification_token);
      setStep('password');
    } catch (e: any) {
      setError(e?.message ?? 'Verification failed.');
    } finally {
      setBusy(false);
    }
  };

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

  const resetToMethods = () => {
    setStep('methods');
    setError(null);
  };

  return (
    <View style={styles.backdrop}>
      <View style={styles.card}>
        <View style={styles.ticketsWrap} pointerEvents="none">
          <Image
            source={require('../../assets/auth-tickets-bg.png')}
            style={styles.ticketsImg}
            resizeMode="contain"
          />
        </View>
        {/* Brand row */}
        <View style={styles.brandRow}>
          <Image
            source={require('../../assets/joinaroo-logo-v2.png')}
            style={styles.brandLogo}
            resizeMode="contain"
          />
          {!isRoot && (
            <TouchableOpacity style={styles.close} onPress={() => navigation.goBack()}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {step === 'methods' && (
          <>
            <Text style={styles.title}>Get started</Text>
            <Text style={styles.tagline}>
              Join Joinaroo to save events, get personalized recommendations, and never miss what's happening near you.
            </Text>

            <TouchableOpacity style={[styles.provider, styles.providerPrimary]} onPress={() => setStep('identifier')} disabled={busy}>
              <Image source={require('../../assets/icons/icon-email-dark.png')} style={styles.providerIcon} resizeMode="contain" />
              <Text style={[styles.providerLabel, styles.providerLabelPrimary]}>Continue with email or phone</Text>
              <Text style={[styles.providerChevron, styles.providerChevronPrimary]}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.provider} onPress={() => sso('facebook')} disabled={busy}>
              <Image source={require('../../assets/icons/icon-facebook.png')} style={styles.providerIcon} resizeMode="contain" />
              <Text style={styles.providerLabel}>Continue with Facebook</Text>
              <Text style={styles.providerChevron}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.provider} onPress={() => sso('google')} disabled={busy}>
              <Image source={require('../../assets/icons/icon-google.png')} style={styles.providerIcon} resizeMode="contain" />
              <Text style={styles.providerLabel}>Continue with Google</Text>
              <Text style={styles.providerChevron}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.provider} onPress={ssoApple} disabled={busy}>
              <Image source={require('../../assets/icons/icon-apple.png')} style={styles.providerIcon} resizeMode="contain" />
              <Text style={styles.providerLabel}>Continue with Apple</Text>
              <Text style={styles.providerChevron}>›</Text>
            </TouchableOpacity>

            {busy && <ActivityIndicator color="#fff" style={{ marginTop: 8 }} />}
            {error ? <Text style={styles.error}>{error}</Text> : null}

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <Text style={styles.switchText}>
              Already have an account?{' '}
              <Text
                style={styles.switchLink}
                onPress={() => {
                  setMode('login');
                  setStep('identifier');
                  setError(null);
                }}
              >
                Log in
              </Text>
            </Text>

            <Text style={styles.terms}>
              By continuing, you agree to our{' '}
              <Text style={styles.termsLink}>Terms of Service</Text> and{' '}
              <Text style={styles.termsLink}>Privacy Policy</Text>.
            </Text>
          </>
        )}

        {step === 'identifier' && (
          <>
            <Text style={styles.title}>{mode === 'login' ? 'Log in' : 'Sign up'}</Text>
            <Text style={styles.label}>Enter your phone number or email</Text>
            <TextInput
              style={styles.input}
              value={identifier}
              onChangeText={(t) => {
                setIdentifier(t);
                setRejectedIdentifier(null);
              }}
              placeholder="Phone or email"
              placeholderTextColor="#6B7280"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoFocus
            />
            {!identifier.trim().includes('@') && (
              <TouchableOpacity
                style={styles.consentRow}
                onPress={() => setSmsConsent(!smsConsent)}
                activeOpacity={0.7}
              >
                <View style={[styles.checkbox, smsConsent && styles.checkboxChecked]}>
                  {smsConsent && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <Text style={styles.consentText}>
                  I agree to receive SMS messages from Joinaroo, including one-time verification codes.
                  Message frequency varies. Message and data rates may apply. Reply STOP to opt out
                  at any time; reply HELP for help. Your mobile information will not be sold or shared
                  with third parties for promotional or marketing purposes.
                </Text>
              </TouchableOpacity>
            )}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <TouchableOpacity
              style={[styles.primaryBtn, (!identifier.trim() || busy || (isPhoneIdentifier(identifier.trim()) && !smsConsent)) && styles.btnDisabled]}
              disabled={!identifier.trim() || busy || (isPhoneIdentifier(identifier.trim()) && !smsConsent)}
              onPress={continueFromIdentifier}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Continue</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={resetToMethods}>
              <Text style={styles.backLink}>‹ Back</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 'verify' && (
          <>
            <Text style={styles.title}>{mode === 'login' ? 'Log in' : 'Sign up'}</Text>
            <Text style={styles.label}>Enter the 6-digit code</Text>
            <Text style={styles.subLabel}>We sent a code to {identifier.trim()}.</Text>
            <TextInput
              style={[styles.input, styles.codeInput]}
              value={code}
              onChangeText={(t) => setCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
              placeholder="••••••"
              placeholderTextColor="#6B7280"
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <TouchableOpacity
              style={[styles.primaryBtn, (code.trim().length !== 6 || busy) && styles.btnDisabled]}
              disabled={code.trim().length !== 6 || busy}
              onPress={() => submitCode()}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Verify</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={sendCode} disabled={busy}>
              <Text style={styles.backLink}>Resend code</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setStep('identifier')}>
              <Text style={styles.backLink}>‹ Back</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 'password' && (
          <>
            <Text style={styles.title}>{mode === 'login' ? 'Log in' : 'Sign up'}</Text>
            <Text style={styles.label}>Enter password</Text>
            <Text style={styles.subLabel}>{identifier.trim()}</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                placeholderTextColor="#6B7280"
                secureTextEntry={!showPassword}
                maxLength={mode === 'signup' ? 20 : undefined}
                autoFocus
              />
              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => setShowPassword((v) => !v)}
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              >
                <Text style={styles.eyeText}>{showPassword ? '👁' : '👁‍🗨'}</Text>
              </TouchableOpacity>
            </View>
            {mode === 'signup' && <PasswordChecks password={password} />}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <TouchableOpacity
              style={[styles.primaryBtn, ((mode === 'signup' ? !passwordValid : !password.trim()) || busy) && styles.btnDisabled]}
              disabled={(mode === 'signup' ? !passwordValid : !password.trim()) || busy}
              onPress={submit}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>{mode === 'login' ? 'Log in' : 'Sign up'}</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setPassword('');
                setShowForgotLink(false);
                setStep('identifier');
              }}
            >
              <Text style={styles.backLink}>‹ Back</Text>
            </TouchableOpacity>
            {mode === 'login' && showForgotLink && (
              <TouchableOpacity onPress={startReset}>
                <Text style={styles.forgotLink}>Forgot password?</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {step === 'reset-identifier' && (
          <>
            <Text style={styles.title}>Reset password</Text>
            <Text style={styles.subLabel}>Enter your phone number or email and we'll send a reset code.</Text>
            <TextInput
              style={styles.input}
              value={identifier}
              onChangeText={setIdentifier}
              placeholder="Phone or email"
              placeholderTextColor="#6B7280"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoFocus
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <TouchableOpacity
              style={[styles.primaryBtn, (!identifier.trim() || busy) && styles.btnDisabled]}
              disabled={!identifier.trim() || busy}
              onPress={sendResetCode}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Send code</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setMode('login');
                setStep('password');
                setError(null);
              }}
            >
              <Text style={styles.backLink}>‹ Back to log in</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 'reset-code' && (
          <>
            <Text style={styles.title}>Reset password</Text>
            <Text style={styles.label}>Enter the 6-digit code</Text>
            <Text style={styles.subLabel}>We sent a reset code to {identifier.trim()}.</Text>
            <TextInput
              style={[styles.input, styles.codeInput]}
              value={resetCode}
              onChangeText={(t) => setResetCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
              placeholder="••••••"
              placeholderTextColor="#6B7280"
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <TouchableOpacity
              style={[styles.primaryBtn, (resetCode.trim().length !== 6 || busy) && styles.btnDisabled]}
              disabled={resetCode.trim().length !== 6 || busy}
              onPress={() => submitResetCode()}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Verify</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={sendResetCode} disabled={busy}>
              <Text style={styles.backLink}>Resend code</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setStep('reset-identifier')}>
              <Text style={styles.backLink}>‹ Back</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 'reset-new-password' && (
          <>
            <Text style={styles.title}>Reset password</Text>
            <Text style={styles.label}>Choose a new password</Text>
            <Text style={styles.subLabel}>{identifier.trim()}</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="New password"
                placeholderTextColor="#6B7280"
                secureTextEntry={!showNewPassword}
                maxLength={20}
                autoFocus
              />
              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => setShowNewPassword((v) => !v)}
                accessibilityLabel={showNewPassword ? 'Hide password' : 'Show password'}
              >
                <Text style={styles.eyeText}>{showNewPassword ? '👁' : '👁‍🗨'}</Text>
              </TouchableOpacity>
            </View>
            <PasswordChecks password={newPassword} />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <TouchableOpacity
              style={[styles.primaryBtn, (!newPasswordValid || busy) && styles.btnDisabled]}
              disabled={!newPasswordValid || busy}
              onPress={submitNewPassword}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Update password</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setStep('reset-code')}>
              <Text style={styles.backLink}>‹ Back</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 'reset-done' && (
          <>
            <Text style={styles.title}>Reset password</Text>
            <Text style={styles.label}>Password updated</Text>
            <Text style={styles.subLabel}>Log in with your new password.</Text>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => {
                setMode('login');
                setStep('password');
                setPassword('');
                setNewPassword('');
                setResetToken(null);
                setError(null);
              }}
            >
              <Text style={styles.primaryBtnText}>Back to log in</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#0B1D3A',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#0B1D3A',
    borderRadius: 20,
    padding: 28,
    paddingHorizontal: 24,
    paddingBottom: 24,
    width: '100%',
    maxWidth: 400,
  },
  ticketsWrap: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 120,
    height: 110,
    opacity: 0.25,
    overflow: 'hidden',
  },
  ticketsImg: {
    width: 120,
    height: 110,
  },



  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  brandLogo: { height: 65, width: 274 },
  close: { padding: 8 },
  closeText: { color: '#fff', fontSize: 22 },
  title: { color: '#fff', fontSize: 28, fontWeight: '800', textAlign: 'left', marginBottom: 8 },
  tagline: { color: '#9AA3B2', fontSize: 14, lineHeight: 20, marginBottom: 18 },
  provider: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  providerPrimary: { backgroundColor: '#fff' },
  providerIcon: { width: 32, height: 32, marginRight: 12 },
  providerLabel: { color: '#fff', fontSize: 15, fontWeight: '700', flex: 1, textAlign: 'left' },
  providerLabelPrimary: { color: '#0B1D3A' },
  providerChevron: { color: '#fff', opacity: 0.6, fontSize: 18 },
  providerChevronPrimary: { color: '#0B1D3A' },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.15)' },
  dividerText: { color: '#9AA3B2', fontSize: 13, marginHorizontal: 12 },
  switchText: { color: '#9AA3B2', fontSize: 14, textAlign: 'center', marginBottom: 16 },
  switchLink: { color: '#42A5F5', fontWeight: '700', marginLeft: 4 },
  terms: { color: '#6B7280', fontSize: 12, textAlign: 'center', lineHeight: 18 },
  termsLink: { color: '#9AA3B2', textDecorationLine: 'underline' },
  label: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 12 },
  subLabel: { color: '#9AA3B2', fontSize: 13, marginBottom: 12 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 16,
    marginBottom: 12,
  },
  codeInput: { textAlign: 'center', fontSize: 24, letterSpacing: 8, fontWeight: '700' },
  passwordRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  passwordInput: { flex: 1, marginBottom: 0 },
  eyeBtn: { padding: 10, marginLeft: -44 },
  eyeText: { fontSize: 18 },
  checks: { marginBottom: 12 },
  checkRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  checkBox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#666',
    marginRight: 8,
    textAlign: 'center',
    lineHeight: 16,
    fontSize: 12,
    color: '#fff',
  },
  checkBoxOk: { backgroundColor: '#2E7D32', borderColor: '#2E7D32' },
  checkLabel: { color: '#888', fontSize: 12 },
  checkLabelOk: { color: '#4CAF50' },
  error: { color: '#FF8A8A', fontSize: 13, marginBottom: 12, textAlign: 'center' },
  primaryBtn: {
    backgroundColor: '#42A5F5',
    borderRadius: 999,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
  },
  btnDisabled: { opacity: 0.4 },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', marginVertical: 12, paddingRight: 8 },
  checkbox: {
    width: 20, height: 20, borderRadius: 4, borderWidth: 1.5, borderColor: '#9CA3AF',
    marginRight: 10, marginTop: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  checkboxChecked: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  consentText: { flex: 1, fontSize: 12, color: '#6B7280', lineHeight: 17 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  backLink: { color: '#9AA3B2', fontSize: 14, marginTop: 16, textAlign: 'center' },
  forgotLink: { color: '#42A5F5', fontSize: 14, fontWeight: '600', marginTop: 16, textAlign: 'center' },
});
