import { setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { locales } from '@/i18n-config';
import { requireAdmin } from '@/lib/admin/auth';
import { CheckCircle, XCircle, Clock, Globe } from 'lucide-react';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

type Issue = {
  id: string;
  locale: string;
  page_url: string;
  current_text: string;
  suggested_fix: string;
  notes: string | null;
  status: string;
  created_at: string;
  reporter: { display_name: string | null; email: string | null } | null;
};

export default async function AdminTranslationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const result = await requireAdmin();
  if ('error' in result) redirect(`/${locale}/konto`);
  const { supabase } = result;

  const { data: issues } = await supabase
    .from('translation_issues')
    .select('*, reporter:profiles!reporter_id(display_name, email)')
    .order('created_at', { ascending: false });

  const allIssues = (issues ?? []) as Issue[];

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Globe className="w-6 h-6 text-htg-sage" />
        <h1 className="font-serif text-2xl font-bold text-htg-fg">Zgłoszenia tłumaczeń</h1>
      </div>

      <div className="text-sm text-htg-fg-muted">
        {allIssues.length} zgłoszeń ({allIssues.filter(i => i.status === 'open').length} otwartych)
      </div>

      {allIssues.length === 0 ? (
        <p className="text-htg-fg-muted">Brak zgłoszeń.</p>
      ) : (
        <div className="space-y-4">
          {allIssues.map((issue) => (
            <div key={issue.id} className="bg-htg-card border border-htg-card-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                {issue.status === 'open' && <Clock className="w-4 h-4 text-amber-500" />}
                {issue.status === 'resolved' && <CheckCircle className="w-4 h-4 text-green-500" />}
                {issue.status === 'rejected' && <XCircle className="w-4 h-4 text-red-500" />}
                <span className="text-xs font-medium uppercase tracking-wide text-htg-fg-muted">{issue.status}</span>
                <span className="px-2 py-0.5 text-xs rounded-full bg-htg-surface text-htg-fg-muted font-medium">{issue.locale.toUpperCase()}</span>
                <span className="text-xs text-htg-fg-muted ml-auto">
                  {issue.reporter?.display_name || issue.reporter?.email || 'Unknown'} · {new Date(issue.created_at).toLocaleDateString('pl-PL')}
                </span>
              </div>

              <p className="text-xs text-htg-fg-muted mb-2 break-all">{issue.page_url}</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-2">
                <div className="p-3 bg-red-500/5 border border-red-500/10 rounded-lg">
                  <p className="text-xs font-medium text-red-400 mb-1">Aktualny tekst</p>
                  <p className="text-sm text-htg-fg">{issue.current_text}</p>
                </div>
                <div className="p-3 bg-green-500/5 border border-green-500/10 rounded-lg">
                  <p className="text-xs font-medium text-green-400 mb-1">Proponowana poprawka</p>
                  <p className="text-sm text-htg-fg">{issue.suggested_fix}</p>
                </div>
              </div>

              {issue.notes && (
                <p className="text-xs text-htg-fg-muted italic mt-2">{issue.notes}</p>
              )}

              {issue.status === 'open' && (
                <div className="flex gap-2 mt-3">
                  <form action={`/api/admin/translation-issues/${issue.id}/resolve`} method="POST">
                    <button type="submit" className="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-600 text-white hover:opacity-90">
                      Rozwiązane
                    </button>
                  </form>
                  <form action={`/api/admin/translation-issues/${issue.id}/reject`} method="POST">
                    <button type="submit" className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-600 text-white hover:opacity-90">
                      Odrzuć
                    </button>
                  </form>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
