'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n-config';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import { Mail, KeyRound, ArrowLeft, Loader2, User, Fingerprint } from 'lucide-react';
import { getRoleForEmail } from '@/lib/roles';

type Step = 'email' | 'code' | 'name';

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

const AppleIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden="true">
    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
  </svg>
);

const FacebookIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden="true">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
  </svg>
);

export default function LoginForm() {
  const t = useTranslations('Auth');
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [consent, setConsent] = useState(true); // checked by default
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [isNewUser, setIsNewUser] = useState(false);
  const [returnTo, setReturnTo] = useState('');
  const [locale, setLocale] = useState('pl');

  const supabase = createSupabaseBrowser();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setReturnTo(params.get('returnTo') || '');
    setLocale(window.location.pathname.split('/')[1] || 'pl');
  }, []);

  async function handlePasskey() {
    if (!consent) { setError('Zaakceptuj politykę prywatności i regulamin.'); return; }
    setLoading(true);
    setError('');
    try {
      // @ts-ignore — signInWithPasskey is available in recent supabase-js
      const { error: passkeyError } = await supabase.auth.signInWithPasskey?.({ challenge: undefined });
      if (passkeyError) setError(passkeyError.message);
      else await finishLogin();
    } catch {
      setError('Passkey niedostępny na tym urządzeniu.');
    }
    setLoading(false);
  }

  async function handleOAuth(provider: 'google' | 'apple' | 'facebook') {
    if (!consent) { setError('Zaakceptuj politykę prywatności i regulamin.'); return; }
    setOauthLoading(provider);
    setError('');
    const redirectTo = returnTo
      ? `${window.location.origin}/${locale}/konto?returnTo=${encodeURIComponent(returnTo)}`
      : `${window.location.origin}/${locale}/konto`;
    await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
    setOauthLoading(null);
  }

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!consent) { setError('Zaakceptuj politykę prywatności i regulamin.'); return; }
    setError('');
    setLoading(true);
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    setLoading(false);
    if (otpError) {
      setError(otpError.message?.includes('rate limit') ? t('error_rate_limit') : t('error_email'));
    } else {
      setStep('code');
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
    setLoading(false);
    if (verifyError) { setError(t('error_code')); return; }

    const session = verifyData?.session;
    if (session?.access_token && session?.refresh_token) {
      try {
        await fetch('/api/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token }),
        });
      } catch { /* Non-blocking */ }
    }

    try {
      await supabase.from('consent_records').insert({ consent_type: 'sensitive_data', granted: true, consent_text: t('consent_label') });
    } catch { /* Non-blocking */ }

    try {
      const expectedRole = getRoleForEmail(email);
      if (expectedRole) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) await supabase.from('profiles').update({ role: expectedRole }).eq('id', user.id);
      }
    } catch { /* Non-blocking */ }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', user.id).single();
        if (!profile?.display_name) { setIsNewUser(true); setStep('name'); return; }
      }
    } catch { /* Non-blocking */ }

    await finishLogin();
  }

  async function finishLogin(name?: string) {
    try { await fetch('/api/gift/link-pending', { method: 'POST' }); } catch { /* Non-blocking */ }
    if (isNewUser) {
      try {
        await fetch('/api/auth/welcome', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name || displayName || email.split('@')[0] }),
        });
      } catch { /* Non-blocking */ }
    }
    if (!returnTo) {
      try {
        const { data: { user: u } } = await supabase.auth.getUser();
        if (u) {
          const { data: prof } = await supabase.from('profiles').select('role').eq('id', u.id).single();
          if (prof?.role === 'admin' || getRoleForEmail(u.email ?? '') === 'admin') {
            window.location.href = `/${locale}/konto/admin`; return;
          }
        }
      } catch { /* fallback */ }
    }
    window.location.href = returnTo || `/${locale}/konto`;
  }

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName.trim()) { await finishLogin(); return; }
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) await supabase.from('profiles').update({ display_name: displayName.trim() }).eq('id', user.id);
    } catch { /* Non-blocking */ }
    await finishLogin(displayName.trim());
  }

  // ── STEP: name ────────────────────────────────────────────────
  if (step === 'name') {
    return (
      <div className="bg-htg-card border border-htg-card-border rounded-2xl p-8 shadow-sm">
        <h1 className="text-2xl font-serif font-bold text-htg-fg mb-2">Jak masz na imię?</h1>
        <p className="text-htg-fg-muted mb-6">Powiedz nam jak masz na imię</p>
        <form onSubmit={handleSaveName} className="flex flex-col gap-4">
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-htg-fg-muted" />
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="np. Jan Kowalski"
              className="w-full pl-11 pr-4 py-3 rounded-lg border border-htg-card-border bg-htg-bg text-htg-fg placeholder:text-htg-fg-muted focus:ring-2 focus:ring-htg-sage focus:border-transparent text-base"
              autoFocus
            />
          </div>
          <button type="submit" disabled={loading}
            className="bg-htg-sage text-white py-3 px-6 rounded-lg font-medium text-base hover:bg-htg-sage-dark transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {loading && <Loader2 className="w-5 h-5 animate-spin" />}
            Przejdź do konta
          </button>
          <button type="button" onClick={() => finishLogin()}
            className="text-htg-fg-muted text-sm hover:text-htg-fg transition-colors text-center">
            Pomiń
          </button>
        </form>
      </div>
    );
  }

  // ── STEP: code ────────────────────────────────────────────────
  if (step === 'code') {
    return (
      <div className="bg-htg-card border border-htg-card-border rounded-2xl p-8 shadow-sm">
        <h1 className="text-2xl font-serif font-bold text-htg-fg mb-2">{t('login_title')}</h1>
        <p className="text-htg-fg-muted mb-6">{t('code_subtitle', { email })}</p>
        <form onSubmit={handleVerifyOtp} className="flex flex-col gap-4">
          <div className="bg-htg-surface rounded-lg p-4 text-center">
            <p className="text-sm font-medium text-htg-sage">{t('code_sent')}</p>
          </div>
          <div className="relative">
            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-htg-fg-muted" />
            <input
              type="text" required value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder={t('code_placeholder')} maxLength={6} pattern="[0-9]{6}" inputMode="numeric"
              className="w-full pl-11 pr-4 py-3 rounded-lg border border-htg-card-border bg-htg-bg text-htg-fg placeholder:text-htg-fg-muted focus:ring-2 focus:ring-htg-sage focus:border-transparent text-center text-2xl tracking-[0.5em] font-mono"
              autoFocus
            />
          </div>
          {error && <p className="text-red-600 text-sm bg-red-50 dark:bg-red-900/20 px-4 py-2 rounded-lg">{error}</p>}
          <button type="submit" disabled={loading || code.length !== 6}
            className="bg-htg-sage text-white py-3 px-6 rounded-lg font-medium text-base hover:bg-htg-sage-dark transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {loading && <Loader2 className="w-5 h-5 animate-spin" />}
            {t('verify')}
          </button>
          <button type="button" onClick={() => { setStep('email'); setCode(''); setError(''); }}
            className="text-htg-fg-muted text-sm hover:text-htg-fg transition-colors flex items-center justify-center gap-1">
            <ArrowLeft className="w-4 h-4" />{t('back')}
          </button>
        </form>
      </div>
    );
  }

  // ── STEP: email (main) ────────────────────────────────────────
  return (
    <div className="bg-htg-card border border-htg-card-border rounded-2xl p-8 shadow-sm">
      {/* Title + passkey icon */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-serif font-bold text-htg-fg">Zaloguj się</h1>
        <button
          type="button"
          onClick={handlePasskey}
          disabled={loading}
          title="Zaloguj biometrycznie / Passkey"
          className="p-2 rounded-lg text-htg-fg-muted hover:text-htg-indigo hover:bg-htg-surface transition-colors disabled:opacity-40"
        >
          <Fingerprint className="w-7 h-7" />
        </button>
      </div>

      {/* Consent — default checked */}
      <label className="flex items-start gap-3 cursor-pointer mb-5">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 w-4 h-4 rounded border-htg-card-border text-htg-sage focus:ring-htg-sage shrink-0 accent-htg-sage"
        />
        <span className="text-sm text-htg-fg-muted leading-relaxed">
          Akceptuję{' '}
          <Link href="/privacy" className="text-htg-sage hover:underline font-medium">politykę prywatności</Link>
          {' '}i{' '}
          <Link href="/terms" className="text-htg-sage hover:underline font-medium">regulamin</Link>
        </span>
      </label>

      {/* Email form */}
      <form onSubmit={handleSendOtp} className="flex flex-col gap-3 mb-5">
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-htg-fg-muted" />
          <input
            type="email" required value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('email_placeholder')}
            className="w-full pl-11 pr-4 py-3 rounded-lg border border-htg-card-border bg-htg-bg text-htg-fg placeholder:text-htg-fg-muted focus:ring-2 focus:ring-htg-sage focus:border-transparent text-base"
            autoFocus
          />
        </div>
        {error && <p className="text-red-600 text-sm bg-red-50 dark:bg-red-900/20 px-4 py-2 rounded-lg">{error}</p>}
        <button type="submit" disabled={loading || !email}
          className="bg-htg-sage text-white py-3 px-6 rounded-lg font-medium text-base hover:bg-htg-sage-dark transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
          {loading && <Loader2 className="w-5 h-5 animate-spin" />}
          {t('send_code')}
        </button>
      </form>

      {/* Divider */}
      <div className="flex items-center gap-3 mb-5">
        <div className="flex-1 border-t border-htg-card-border" />
        <span className="text-xs text-htg-fg-muted uppercase tracking-wider">lub</span>
        <div className="flex-1 border-t border-htg-card-border" />
      </div>

      {/* OAuth buttons */}
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => handleOAuth('google')}
          disabled={!!oauthLoading}
          className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-lg border border-htg-card-border bg-htg-surface hover:bg-htg-bg text-htg-fg font-medium text-sm transition-colors disabled:opacity-50"
        >
          {oauthLoading === 'google' ? <Loader2 className="w-5 h-5 animate-spin" /> : <GoogleIcon />}
          Kontynuuj z Google
        </button>
        <button
          type="button"
          onClick={() => handleOAuth('apple')}
          disabled={!!oauthLoading}
          className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-lg bg-black text-white hover:bg-neutral-900 font-medium text-sm transition-colors disabled:opacity-50"
        >
          {oauthLoading === 'apple' ? <Loader2 className="w-5 h-5 animate-spin" /> : <AppleIcon />}
          Kontynuuj z Apple
        </button>
        <button
          type="button"
          onClick={() => handleOAuth('facebook')}
          disabled={!!oauthLoading}
          className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-lg bg-[#1877F2] text-white hover:bg-[#166FE5] font-medium text-sm transition-colors disabled:opacity-50"
        >
          {oauthLoading === 'facebook' ? <Loader2 className="w-5 h-5 animate-spin" /> : <FacebookIcon />}
          Kontynuuj z Facebook
        </button>
      </div>
    </div>
  );
}
