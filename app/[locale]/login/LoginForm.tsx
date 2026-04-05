'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n-config';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import { Mail, KeyRound, ArrowLeft, Loader2, User, Fingerprint } from 'lucide-react';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { getRoleForEmail } from '@/lib/roles';
import type { Provider } from '@supabase/supabase-js';

type Step = 'email' | 'code' | 'link-sent' | 'name';

export default function LoginForm() {
  const t = useTranslations('Auth');
  const router = useRouter();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [consent, setConsent] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [isNewUser, setIsNewUser] = useState(false);
  const [returnTo, setReturnTo] = useState('');
  const [supportsPasskey, setSupportsPasskey] = useState(false);
  const [loggedInUser, setLoggedInUser] = useState<SupabaseUser | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  const supabase = createSupabaseBrowser();

  const isNagrania = typeof window !== 'undefined' &&
    (window.location.hostname === 'nagrania.htg.cyou' || window.location.hostname === 'nagrania.localhost');
  const portalHome = isNagrania ? '/konto/nagrania-sesji' : '/konto';

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setReturnTo(params.get('returnTo') || '');

    // Handle auth error redirects
    const errorParam = params.get('error');
    if (errorParam === 'not_registered') setError(t('error_not_registered'));
    else if (errorParam === 'auth_failed') setError(t('error_email'));

    // Check if user is already logged in
    supabase.auth.getUser().then(({ data: { user } }) => {
      setLoggedInUser(user);
      setCheckingSession(false);
    });

    // Check if browser supports WebAuthn
    if (typeof window !== 'undefined' && window.PublicKeyCredential) {
      PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.()
        .then(available => setSupportsPasskey(available))
        .catch(() => {});
    }
  }, []);

  function getLocale() {
    return window.location.pathname.split('/')[1] || 'pl';
  }

  /** UX precheck — gives immediate feedback when email is not registered. */
  async function checkEmailExists(emailToCheck: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/auth/check-email?email=${encodeURIComponent(emailToCheck)}`);
      const data = await res.json();
      return data.exists === true;
    } catch {
      // If precheck fails, let the OTP flow handle it
      return true;
    }
  }

  // ─── Magic Link ─────────────────────────────────────────────
  async function handleSendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!consent) { setError(t('consent_required')); return; }
    setError('');
    setLoading(true);

    if (!await checkEmailExists(email)) {
      setLoading(false);
      setError(t('error_not_registered'));
      return;
    }

    const locale = getLocale();
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/auth/confirm?next=/${locale}${portalHome}`,
      },
    });

    setLoading(false);
    if (otpError) {
      const code = (otpError as any).code ?? '';
      const msg = otpError.message?.toLowerCase() ?? '';
      if (msg.includes('rate limit')) {
        setError(t('error_rate_limit'));
      } else if (
        code === 'otp_disabled' || code === 'user_not_found' ||
        msg.includes('signups not allowed') || msg.includes('user not found')
      ) {
        setError(t('error_not_registered'));
      } else {
        setError(t('error_email'));
      }
    } else {
      setStep('link-sent');
    }
  }

  // ─── OTP Code ───────────────────────────────────────────────
  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!consent) { setError(t('consent_required')); return; }
    setError('');
    setLoading(true);

    if (!await checkEmailExists(email)) {
      setLoading(false);
      setError(t('error_not_registered'));
      return;
    }

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });

    setLoading(false);
    if (otpError) {
      const code = (otpError as any).code ?? '';
      const msg = otpError.message?.toLowerCase() ?? '';
      if (msg.includes('rate limit')) {
        setError(t('error_rate_limit'));
      } else if (
        code === 'otp_disabled' || code === 'user_not_found' ||
        msg.includes('signups not allowed') || msg.includes('user not found')
      ) {
        setError(t('error_not_registered'));
      } else {
        setError(t('error_email'));
      }
    } else {
      setStep('code');
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: 'email',
    });

    setLoading(false);
    if (verifyError) {
      setError(t('error_code'));
    } else {
      // Sync session to server cookies
      const session = verifyData?.session;
      if (session?.access_token && session?.refresh_token) {
        try {
          await fetch('/api/auth/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              access_token: session.access_token,
              refresh_token: session.refresh_token,
            }),
          });
        } catch { /* Non-blocking */ }
      }

      await handlePostLogin();
    }
  }

  // ─── SSO (Google, Apple, Facebook) ──────────────────────────
  async function handleSSO(provider: Provider) {
    if (!consent) { setError(t('consent_required')); return; }
    setError('');
    setLoading(true);

    const locale = getLocale();
    const { error: ssoError } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/confirm?next=/${locale}${portalHome}`,
      },
    });

    if (ssoError) {
      setLoading(false);
      setError(t('error_sso'));
    }
    // On success, browser redirects to OAuth provider
  }

  // ─── Passkey ────────────────────────────────────────────────
  async function handlePasskeyLogin() {
    if (!consent) { setError(t('consent_required')); return; }
    setError('');
    setLoading(true);

    try {
      const { startAuthentication } = await import('@simplewebauthn/browser');

      // Get auth options from server
      const optionsRes = await fetch('/api/auth/passkey/auth-options', { method: 'POST' });
      if (!optionsRes.ok) throw new Error('Failed to get auth options');
      const options = await optionsRes.json();

      // Trigger browser biometric prompt
      const authResponse = await startAuthentication({ optionsJSON: options });

      // Verify with server
      const verifyRes = await fetch('/api/auth/passkey/auth-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: authResponse }),
      });

      if (!verifyRes.ok) {
        const err = await verifyRes.json();
        throw new Error(err.error || 'Verification failed');
      }

      // Session cookies are set by the server, call post-login then redirect
      await handlePostLogin();
    } catch (err: any) {
      setLoading(false);
      // NotAllowedError = user cancelled — silent fallback
      if (err.name === 'NotAllowedError') return;
      setError(t('error_passkey'));
    }
  }

  // ─── Centralized Post-Login ─────────────────────────────────
  async function handlePostLogin() {
    try {
      const res = await fetch('/api/auth/post-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consent: true, consentText: t('consent_label') }),
      });
      const data = await res.json();

      if (data.isNew) {
        setIsNewUser(true);
        setStep('name');
        setLoading(false);
        return;
      }
    } catch { /* Non-blocking */ }

    await finishLogin();
  }

  async function finishLogin(name?: string) {
    const locale = getLocale();
    if (!returnTo && !isNagrania) {
      try {
        const { data: { user: u } } = await supabase.auth.getUser();
        if (u) {
          const { data: prof } = await supabase.from('profiles').select('role').eq('id', u.id).single();
          if (prof?.role === 'admin' || getRoleForEmail(u.email ?? '') === 'admin') {
            window.location.href = `/${locale}/konto/admin`;
            return;
          }
        }
      } catch { /* fallback below */ }
    }
    window.location.href = returnTo || `/${locale}${portalHome}`;
  }

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName.trim()) { await finishLogin(); return; }
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('profiles').update({ display_name: displayName.trim() }).eq('id', user.id);
      }
    } catch { /* Non-blocking */ }
    await finishLogin(displayName.trim());
  }

  const allDisabled = loading || !consent;

  // Auto-redirect logged-in users to their portal
  useEffect(() => {
    if (loggedInUser) {
      router.push(portalHome);
    }
  }, [loggedInUser, router, portalHome]);

  // Show logged-in state
  if (checkingSession) {
    return (
      <div className="p-4 md:bg-htg-card md:border md:border-htg-card-border md:rounded-2xl md:p-8 md:shadow-sm flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-htg-fg-muted" />
      </div>
    );
  }

  if (loggedInUser) {
    // Show loading spinner while redirecting to portal
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-htg-sage animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 md:bg-htg-card md:border md:border-htg-card-border md:rounded-2xl md:p-8 md:shadow-sm">
      {/* Title row */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-serif font-bold text-htg-fg">
          {step === 'name' ? t('name_subtitle') :
           step === 'link-sent' ? t('link_sent_subtitle') :
           step === 'code' ? t('code_subtitle', { email }) :
           t('login_title')}
        </h1>
        {step === 'email' && !isNagrania && (
          <button
            type="button"
            onClick={handlePasskeyLogin}
            disabled={loading}
            title="Zaloguj się biometrycznie"
            className="p-2 rounded-lg text-htg-fg-muted hover:text-htg-fg hover:bg-htg-surface transition-colors disabled:opacity-40"
          >
            {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Fingerprint className="w-6 h-6" />}
          </button>
        )}
      </div>

      {/* ─── Name step (new users) ─── */}
      {step === 'name' ? (
        <form onSubmit={handleSaveName} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-htg-fg">{t('name_label')}</span>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-htg-fg-muted" />
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={t('name_placeholder')}
                className="w-full pl-11 pr-4 py-3 rounded-lg border border-htg-card-border bg-htg-bg text-htg-fg placeholder:text-htg-fg-muted focus:ring-2 focus:ring-htg-sage focus:border-transparent text-base"
                autoFocus
              />
            </div>
          </label>
          <button
            type="submit"
            disabled={loading}
            className="bg-htg-sage text-white py-3 px-6 rounded-lg font-medium text-base hover:bg-htg-sage-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-5 h-5 animate-spin" />}
            {t('continue_to_account')}
          </button>
          <button
            type="button"
            onClick={() => finishLogin()}
            className="text-htg-fg-muted text-sm hover:text-htg-fg transition-colors text-center"
          >
            {t('skip')}
          </button>
        </form>

      /* ─── Link sent confirmation ─── */
      ) : step === 'link-sent' ? (
        <div className="flex flex-col gap-4">
          <div className="bg-htg-surface rounded-lg p-6 text-center">
            <Mail className="w-10 h-10 text-htg-sage mx-auto mb-3" />
            <p className="text-base font-medium text-htg-fg mb-1">{t('link_sent')}</p>
            <p className="text-sm text-htg-fg-muted">{t('link_sent_check', { email })}</p>
          </div>
          <button
            type="button"
            onClick={() => { setStep('email'); setError(''); }}
            className="text-htg-fg-muted text-sm hover:text-htg-fg transition-colors flex items-center justify-center gap-1"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('back')}
          </button>
        </div>

      /* ─── OTP code entry ─── */
      ) : step === 'code' ? (
        <form onSubmit={handleVerifyOtp} className="flex flex-col gap-4">
          <div className="bg-htg-surface rounded-lg p-4 text-center">
            <p className="text-sm font-medium text-htg-sage">{t('code_sent')}</p>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-htg-fg">{t('code_label')}</span>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-htg-fg-muted" />
              <input
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder={t('code_placeholder')}
                maxLength={6}
                pattern="[0-9]{6}"
                inputMode="numeric"
                className="w-full pl-11 pr-4 py-3 rounded-lg border border-htg-card-border bg-htg-bg text-htg-fg placeholder:text-htg-fg-muted focus:ring-2 focus:ring-htg-sage focus:border-transparent text-center text-2xl tracking-[0.5em] font-mono"
                autoFocus
              />
            </div>
          </label>

          {error && (
            <p className="text-red-600 text-sm bg-red-50 dark:bg-red-900/20 px-4 py-2 rounded-lg">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="bg-htg-sage text-white py-3 px-6 rounded-lg font-medium text-base hover:bg-htg-sage-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-5 h-5 animate-spin" />}
            {t('verify')}
          </button>

          <button
            type="button"
            onClick={() => { setStep('email'); setCode(''); setError(''); }}
            className="text-htg-fg-muted text-sm hover:text-htg-fg transition-colors flex items-center justify-center gap-1"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('back')}
          </button>
        </form>

      /* ─── Main login screen (email step) ─── */
      ) : (
        <div className="flex flex-col gap-5">

          {/* Consent — hidden on nagrania portal */}
          {!isNagrania && (
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => { setConsent(e.target.checked); setError(''); }}
                className="mt-1 w-4 h-4 rounded border-htg-card-border text-htg-sage focus:ring-htg-sage shrink-0 accent-htg-sage"
              />
              <span className="text-sm text-htg-fg-muted leading-relaxed">
                Akceptuję{' '}
                <a href="/privacy" className="text-htg-indigo hover:underline" target="_blank" rel="noopener">politykę prywatności</a>
                {' '}i{' '}
                <a href="/terms" className="text-htg-indigo hover:underline" target="_blank" rel="noopener">regulamin</a>
              </span>
            </label>
          )}

          {/* Help text for new/elderly users — nagrania portal only */}
          {isNagrania && (
            <div className="bg-htg-surface rounded-lg px-4 py-3 flex gap-3 items-start">
              <Mail className="w-5 h-5 text-htg-sage shrink-0 mt-0.5" />
              <p className="text-base text-htg-fg leading-snug">{t('login_help')}</p>
            </div>
          )}

          {/* Email form */}
          <form onSubmit={handleSendOtp} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-htg-fg">{t('email_label')}</span>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-htg-fg-muted" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('email_placeholder')}
                  className="w-full pl-11 pr-4 py-3 rounded-lg border border-htg-card-border bg-htg-bg text-htg-fg placeholder:text-htg-fg-muted focus:ring-2 focus:ring-htg-sage focus:border-transparent text-base"
                />
              </div>
            </label>

            {error && (
              <p className="text-red-600 text-sm bg-red-50 dark:bg-red-900/20 px-4 py-2 rounded-lg">{error}</p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleSendMagicLink}
                disabled={allDisabled || !email}
                className="bg-htg-sage text-white py-3 px-4 rounded-lg font-medium text-sm hover:bg-htg-sage-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('send_link')}
              </button>
              <button
                type="submit"
                disabled={allDisabled || !email}
                className="bg-htg-surface text-htg-fg py-3 px-4 rounded-lg font-medium text-sm border border-htg-card-border hover:bg-htg-card transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('send_code')}
              </button>
            </div>
          </form>

          {/* Divider + SSO — hidden on nagrania portal */}
          {!isNagrania && (
            <>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-htg-card-border" />
                <span className="text-xs text-htg-fg-muted uppercase tracking-wider">lub</span>
                <div className="flex-1 h-px bg-htg-card-border" />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => handleSSO('google')}
                  disabled={allDisabled}
                  className="py-2.5 px-2 rounded-lg font-medium text-xs bg-white dark:bg-htg-surface border border-htg-card-border dark:border-htg-fg-muted/20 text-htg-fg hover:bg-gray-50 dark:hover:bg-htg-card transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  Google
                </button>

                <button
                  type="button"
                  onClick={() => handleSSO('apple')}
                  disabled={allDisabled}
                  className="py-2.5 px-2 rounded-lg font-medium text-xs bg-black text-white border border-htg-card-border hover:bg-zinc-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  Apple
                </button>

                <button
                  type="button"
                  onClick={() => handleSSO('facebook')}
                  disabled={allDisabled}
                  className="py-2.5 px-2 rounded-lg font-medium text-xs bg-[#1877F2] text-white border border-transparent hover:bg-[#166FE5] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  Facebook
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
