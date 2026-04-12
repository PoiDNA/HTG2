'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import { useUserRole } from '@/lib/useUserRole';
import { TRANSLATOR_LOCALE } from '@/lib/roles';
import { Send, CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react';

type TranslationIssue = {
  id: string;
  locale: string;
  page_url: string;
  current_text: string;
  suggested_fix: string;
  notes: string | null;
  status: string;
  created_at: string;
};

const STATUS_ICONS: Record<string, typeof Clock> = {
  open: Clock,
  resolved: CheckCircle,
  rejected: XCircle,
};

const STATUS_COLORS: Record<string, string> = {
  open: 'text-amber-500',
  resolved: 'text-green-500',
  rejected: 'text-red-500',
};

export default function TranslatorPanel() {
  const t = useTranslations('Translator');
  const { user, isTranslator, loading: roleLoading } = useUserRole();
  const [issues, setIssues] = useState<TranslationIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // Form state
  const [pageUrl, setPageUrl] = useState('');
  const [currentText, setCurrentText] = useState('');
  const [suggestedFix, setSuggestedFix] = useState('');
  const [notes, setNotes] = useState('');

  const translatorLocale = user?.email ? TRANSLATOR_LOCALE[user.email.toLowerCase()] : null;

  useEffect(() => {
    if (roleLoading || !user) return;
    loadIssues();
  }, [roleLoading, user]);

  async function loadIssues() {
    const supabase = createSupabaseBrowser();
    const { data } = await supabase
      .from('translation_issues')
      .select('*')
      .order('created_at', { ascending: false });
    setIssues(data ?? []);
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!translatorLocale || !pageUrl.trim() || !currentText.trim() || !suggestedFix.trim()) return;

    setSubmitting(true);
    const supabase = createSupabaseBrowser();
    const { error } = await supabase.from('translation_issues').insert({
      reporter_id: user!.id,
      locale: translatorLocale,
      page_url: pageUrl.trim(),
      current_text: currentText.trim(),
      suggested_fix: suggestedFix.trim(),
      notes: notes.trim() || null,
    });

    if (!error) {
      setPageUrl('');
      setCurrentText('');
      setSuggestedFix('');
      setNotes('');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      loadIssues();
    }
    setSubmitting(false);
  }

  if (roleLoading) {
    return <div className="p-8 text-center text-htg-fg-muted">{t('loading')}</div>;
  }

  if (!isTranslator) {
    return (
      <div className="p-8 text-center">
        <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-3" />
        <p className="text-htg-fg-muted">{t('not_authorized')}</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="font-serif text-2xl font-bold text-htg-fg">{t('title')}</h1>
        <p className="text-htg-fg-muted mt-1">
          {t('subtitle', { locale: translatorLocale?.toUpperCase() ?? '' })}
        </p>
      </div>

      {/* Submit form */}
      <form onSubmit={handleSubmit} className="bg-htg-card border border-htg-card-border rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-htg-fg">{t('report_title')}</h2>

        <div>
          <label className="block text-sm font-medium text-htg-fg mb-1">{t('page_url')}</label>
          <input
            type="text"
            value={pageUrl}
            onChange={(e) => setPageUrl(e.target.value)}
            placeholder="https://htgcyou.com/de/sesje"
            className="w-full px-3 py-2 rounded-lg border border-htg-card-border bg-htg-bg text-htg-fg text-sm"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-htg-fg mb-1">{t('current_text')}</label>
          <textarea
            value={currentText}
            onChange={(e) => setCurrentText(e.target.value)}
            placeholder={t('current_text_placeholder')}
            rows={2}
            className="w-full px-3 py-2 rounded-lg border border-htg-card-border bg-htg-bg text-htg-fg text-sm"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-htg-fg mb-1">{t('suggested_fix')}</label>
          <textarea
            value={suggestedFix}
            onChange={(e) => setSuggestedFix(e.target.value)}
            placeholder={t('suggested_fix_placeholder')}
            rows={2}
            className="w-full px-3 py-2 rounded-lg border border-htg-card-border bg-htg-bg text-htg-fg text-sm"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-htg-fg mb-1">{t('notes')}</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('notes_placeholder')}
            rows={2}
            className="w-full px-3 py-2 rounded-lg border border-htg-card-border bg-htg-bg text-htg-fg text-sm"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-htg-sage text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            {submitting ? t('submitting') : t('submit')}
          </button>
          {success && <span className="text-green-500 text-sm">{t('success')}</span>}
        </div>
      </form>

      {/* Issues list */}
      <div>
        <h2 className="font-semibold text-htg-fg mb-4">{t('my_issues')}</h2>
        {loading ? (
          <p className="text-htg-fg-muted text-sm">{t('loading')}</p>
        ) : issues.length === 0 ? (
          <p className="text-htg-fg-muted text-sm">{t('no_issues')}</p>
        ) : (
          <div className="space-y-3">
            {issues.map((issue) => {
              const Icon = STATUS_ICONS[issue.status] || Clock;
              const color = STATUS_COLORS[issue.status] || 'text-htg-fg-muted';
              return (
                <div key={issue.id} className="bg-htg-card border border-htg-card-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className={`w-4 h-4 ${color}`} />
                    <span className={`text-xs font-medium ${color}`}>{issue.status}</span>
                    <span className="text-xs text-htg-fg-muted ml-auto">
                      {new Date(issue.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-xs text-htg-fg-muted mb-1">{issue.page_url}</p>
                  <p className="text-sm text-htg-fg"><strong>{t('current')}:</strong> {issue.current_text}</p>
                  <p className="text-sm text-htg-fg"><strong>{t('fix')}:</strong> {issue.suggested_fix}</p>
                  {issue.notes && <p className="text-xs text-htg-fg-muted mt-1">{issue.notes}</p>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
