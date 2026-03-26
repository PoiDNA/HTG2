'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n-config';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import { Mail, KeyRound, ArrowLeft, Loader2 } from 'lucide-react';
import { getRoleForEmail } from '@/lib/roles';

type Step = 'email' | 'code';

export default function LoginForm() {
  const t = useTranslations('Auth');
  const router = useRouter();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const supabase = createSupabaseBrowser();

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!consent) {
      setError(t('consent_required'));
      return;
    }
    setError('');
    setLoading(true);

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });

    setLoading(false);
    if (otpError) {
      setError(t('error_email'));
    } else {
      setStep('code');
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: 'email',
    });

    setLoading(false);
    if (verifyError) {
      setError(t('error_code'));
    } else {
      // Record GDPR consent
      try {
        await supabase.from('consent_records').insert({
          consent_type: 'sensitive_data',
          granted: true,
          consent_text: t('consent_label'),
        });
      } catch {
        // Non-blocking — consent may fail if table not yet created
      }

      // Auto-set role based on email
      try {
        const expectedRole = getRoleForEmail(email);
        if (expectedRole) {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            await supabase
              .from('profiles')
              .update({ role: expectedRole })
              .eq('id', user.id);
          }
        }
      } catch {
        // Non-blocking
      }

      router.push('/konto');
    }
  }

  return (
    <div className="bg-htg-card border border-htg-card-border rounded-2xl p-8 shadow-sm">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-serif font-bold text-htg-fg mb-2">
          {t('login_title')}
        </h1>
        <p className="text-htg-fg-muted">
          {step === 'email' ? t('login_subtitle') : t('code_subtitle', { email })}
        </p>
      </div>

      {step === 'email' ? (
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
                autoFocus
              />
            </div>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-1 w-5 h-5 rounded border-htg-card-border text-htg-sage focus:ring-htg-sage shrink-0"
            />
            <span className="text-sm text-htg-fg-muted leading-relaxed">
              {t('consent_label')}
            </span>
          </label>

          {error && (
            <p className="text-red-600 text-sm bg-red-50 dark:bg-red-900/20 px-4 py-2 rounded-lg">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !email}
            className="bg-htg-sage text-white py-3 px-6 rounded-lg font-medium text-base hover:bg-htg-sage-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-5 h-5 animate-spin" />}
            {t('send_code')}
          </button>
        </form>
      ) : (
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
      )}
    </div>
  );
}
