'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n-config';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import { Mail, KeyRound, ArrowLeft, Loader2, User, Fingerprint } from 'lucide-react';
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

  const supabase = createSupabaseBrowser();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setReturnTo(params.get('returnTo') || '');

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

  // ─── Magic Link ─────────────────────────────────────────────
  async function handleSendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!consent) { setError(t('consent_required')); return; }
    setError('');
    setLoading(true);

    const locale = getLocale();
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${window.location.origin}/auth/confirm?next=/${locale}/konto&consent=1`,
      },
    });

    setLoading(false);
    if (otpError) {
      if (otpError.message?.includes('rate limit')) {
        setError(t('error_rate_limit'));
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

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });

    setLoading(false);
    if (otpError) {
      if (otpError.message?.includes('rate limit')) {
        setError(t('error_rate_limit'));
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
        redirectTo: `${window.location.origin}/auth/confirm?next=/${locale}/konto&consent=1`,
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
    if (!returnTo) {
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
    window.location.href = returnTo || `/${locale}/konto`;
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
        {step === 'email' && (
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

          {/* Consent */}
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

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-htg-card-border" />
            <span className="text-xs text-htg-fg-muted uppercase tracking-wider">lub</span>
            <div className="flex-1 h-px bg-htg-card-border" />
          </div>

          {/* SSO Buttons */}
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => handleSSO('google')}
              disabled={allDisabled}
              className="w-full py-2.5 px-4 rounded-lg font-medium text-sm bg-white dark:bg-htg-surface border border-htg-card-border dark:border-htg-fg-muted/20 text-htg-fg hover:bg-gray-50 dark:hover:bg-htg-card transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-3"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Google
            </button>

            <button
              type="button"
              onClick={() => handleSSO('apple')}
              disabled={allDisabled}
              className="w-full py-2.5 px-4 rounded-lg font-medium text-sm bg-black text-white border border-htg-card-border hover:bg-zinc-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-3"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
              </svg>
              Apple
            </button>

            <button
              type="button"
              onClick={() => handleSSO('facebook')}
              disabled={allDisabled}
              className="w-full py-2.5 px-4 rounded-lg font-medium text-sm bg-[#1877F2] text-white border border-transparent hover:bg-[#166FE5] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-3"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
              Facebook
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
