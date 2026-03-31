'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import { ExternalLink, ShieldCheck } from 'lucide-react';

const REQUIRED_CONSENTS = [
  {
    type: 'terms_v3',
    label: 'Akceptuję Regulamin serwisu (v3.0)',
    text: 'Akceptacja Regulaminu Sesji HTG w wersji 3.0, obowiązującego od 1 kwietnia 2025 r.',
    href: '/terms',
  },
  {
    type: 'privacy_v3',
    label: 'Akceptuję Politykę prywatności',
    text: 'Akceptacja Polityki Prywatności HTG w wersji 1.1',
    href: '/privacy',
  },
  {
    type: 'sensitive_data',
    label: 'Wyrażam zgodę na przetwarzanie danych wrażliwych (RODO art. 9)',
    text: 'Zgoda na przetwarzanie danych dotyczących przekonań, zdrowia i życia osobistego ujawnianych w trakcie sesji rozwoju osobistego (art. 9 ust. 2 lit. a RODO).',
    description: 'Dotyczy danych osobistych poruszanych podczas sesji. Możesz wycofać tę zgodę w dowolnym momencie w profilu — może to jednak uniemożliwić realizację kolejnych sesji.',
  },
  {
    type: 'recording_publication',
    label: 'Rozumiem, że sesja jest nagrywana i może zostać opublikowana po montażu',
    text: 'Rozumiem, że sesja jest nagrywana i może zostać opublikowana po montażu. Mogę wskazać fragmenty do usunięcia w ciągu 7 dni od udostępnienia nagrania. Zgoda stanowi warunek zawarcia umowy.',
    description: 'Warunek realizacji usługi — nie podlega wycofaniu. Zachowujesz prawo do wskazania fragmentów do usunięcia przed publikacją.',
  },
] as const;

export default function ConsentGatePage() {
  const router = useRouter();
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const allChecked = REQUIRED_CONSENTS.every(c => checked[c.type]);

  async function handleAcceptAll() {
    if (!allChecked) return;
    setSaving(true);
    setError('');

    try {
      const supabase = createSupabaseBrowser();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError('Sesja wygasła. Zaloguj się ponownie.'); return; }

      // Insert all consent records (user_id required by RLS policy)
      const records = REQUIRED_CONSENTS.map(c => ({
        user_id: user.id,
        consent_type: c.type,
        granted: true,
        consent_text: c.text,
      }));

      const { error: insertError } = await supabase
        .from('consent_records')
        .insert(records);

      if (insertError) {
        setError('Wystąpił błąd. Spróbuj ponownie.');
        return;
      }

      // Redirect to account panel
      router.push('/konto');
      router.refresh();
    } catch {
      setError('Wystąpił błąd. Spróbuj ponownie.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <div className="text-center mb-10">
        <ShieldCheck className="w-12 h-12 text-htg-sage mx-auto mb-4" />
        <h1 className="text-2xl md:text-3xl font-serif font-bold text-htg-fg mb-3">
          Aktualizacja zgód
        </h1>
        <p className="text-htg-fg-muted text-sm leading-relaxed max-w-lg mx-auto">
          Zaktualizowaliśmy regulamin i politykę prywatności. Aby kontynuować korzystanie
          z panelu klienta, prosimy o zapoznanie się z nowymi dokumentami i wyrażenie zgód.
        </p>
      </div>

      <div className="bg-htg-card border border-htg-card-border rounded-xl p-6 space-y-4">
        {REQUIRED_CONSENTS.map((consent) => (
          <label
            key={consent.type}
            className="flex items-start gap-3 cursor-pointer bg-htg-surface rounded-lg p-4 hover:bg-htg-surface/80 transition-colors"
          >
            <input
              type="checkbox"
              checked={!!checked[consent.type]}
              onChange={(e) => setChecked(prev => ({ ...prev, [consent.type]: e.target.checked }))}
              className="mt-0.5 w-5 h-5 rounded border-htg-card-border text-htg-sage focus:ring-htg-sage shrink-0 accent-htg-sage"
            />
            <div className="min-w-0">
              <span className="text-sm font-medium text-htg-fg leading-relaxed">
                {consent.label}
                {'href' in consent && consent.href && (
                  <>
                    {' '}
                    <a
                      href={consent.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-htg-indigo hover:underline inline-flex items-center gap-0.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </>
                )}
              </span>
              {'description' in consent && consent.description && (
                <p className="text-xs text-htg-fg-muted mt-1 leading-relaxed">{consent.description}</p>
              )}
            </div>
          </label>
        ))}

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400 text-center">{error}</p>
        )}

        <button
          onClick={handleAcceptAll}
          disabled={!allChecked || saving}
          className="w-full bg-htg-sage text-white py-4 rounded-lg font-semibold text-lg hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? 'Zapisuję...' : 'Potwierdzam i przechodzę do panelu'}
        </button>

        {!allChecked && (
          <p className="text-xs text-htg-fg-muted text-center">
            Zaznacz wszystkie zgody, aby kontynuować
          </p>
        )}
      </div>
    </div>
  );
}
