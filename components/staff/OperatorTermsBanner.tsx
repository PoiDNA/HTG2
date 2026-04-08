'use client';

import { useEffect, useState } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import { Link } from '@/i18n-config';
import { FileText, Check, Loader2 } from 'lucide-react';

/**
 * Banner shown on the staff dashboard (/prowadzacy) prompting the operator
 * to read & accept the Operator Regulamin. Disappears once accepted.
 *
 * Renders nothing while loading, on error, or once acceptance is confirmed.
 */
export default function OperatorTermsBanner() {
  const [state, setState] = useState<'loading' | 'needs-accept' | 'accepted' | 'submitting'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createSupabaseBrowser();

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setState('accepted'); // hide if not logged in
        return;
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('operator_terms_accepted_at')
        .eq('id', user.id)
        .single();
      if (cancelled) return;
      setState(profile?.operator_terms_accepted_at ? 'accepted' : 'needs-accept');
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleAccept() {
    setState('submitting');
    setError(null);
    try {
      const res = await fetch('/api/user/accept-operator-terms', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'Nie udało się zapisać akceptacji.');
      }
      setState('accepted');
    } catch (e: any) {
      setError(e?.message ?? 'Nie udało się zapisać akceptacji.');
      setState('needs-accept');
    }
  }

  if (state === 'loading' || state === 'accepted') return null;

  return (
    <div className="bg-htg-sage/10 border-2 border-htg-sage/30 rounded-2xl p-5 md:p-6">
      <div className="flex items-start gap-4">
        <div className="shrink-0 w-10 h-10 rounded-full bg-htg-sage/20 flex items-center justify-center">
          <FileText className="w-5 h-5 text-htg-sage" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base md:text-lg font-serif font-bold text-htg-fg mb-1">
            Zapoznaj się z regulaminem Operatora
          </h2>
          <p className="text-sm text-htg-fg-muted leading-relaxed mb-4">
            Mamy spisane kilka zasad naszej współpracy — krótkie, ludzkie, ważne
            zarówno dla Ciebie, jak i dla nas. Prosimy, przeczytaj i potwierdź,
            że Cię obowiązują. Po akceptacji ten baner zniknie.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <Link
              href={'/operator-terms' as any}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-htg-sage/40 text-htg-sage hover:bg-htg-sage/10 transition-colors text-sm font-medium"
            >
              <FileText className="w-4 h-4" />
              Otwórz regulamin
            </Link>
            <button
              type="button"
              onClick={handleAccept}
              disabled={state === 'submitting'}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-htg-sage text-white hover:bg-htg-sage/90 transition-colors text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {state === 'submitting' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Zapisuję…
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Zapoznałam/em się i akceptuję
                </>
              )}
            </button>
          </div>
          {error && (
            <p className="mt-2 text-xs text-red-500">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
