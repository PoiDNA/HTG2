'use client';

import { useState } from 'react';
import { CheckCircle, Edit2, X, Save, Loader2 } from 'lucide-react';

const LOCALES = ['en', 'de', 'pt'] as const;
type Locale = typeof LOCALES[number];

const LOCALE_LABELS: Record<Locale, string> = { en: 'EN', de: 'DE', pt: 'PT' };

interface Props {
  id: string;
  table: 'session_templates' | 'monthly_sets';
  title: string;
  description: string | null;
  titleI18n: Record<string, string> | null;
  descriptionI18n: Record<string, string> | null;
}

export default function I18nRow({ id, table, title, description, titleI18n, descriptionI18n }: Props) {
  const [editing, setEditing] = useState<Locale | null>(null);
  const [titleVal, setTitleVal] = useState('');
  const [descVal, setDescVal] = useState('');
  const [saving, setSaving] = useState(false);
  const [i18nTitle, setI18nTitle] = useState<Record<string, string>>(titleI18n ?? {});
  const [i18nDesc, setI18nDesc] = useState<Record<string, string>>(descriptionI18n ?? {});

  function startEdit(locale: Locale) {
    setTitleVal(i18nTitle[locale] ?? '');
    setDescVal(i18nDesc[locale] ?? '');
    setEditing(locale);
  }

  async function save() {
    if (!editing) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/session-i18n', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table, id, locale: editing, title: titleVal, description: descVal }),
      });
      if (res.ok) {
        setI18nTitle(prev => ({ ...prev, [editing]: titleVal }));
        setI18nDesc(prev => ({ ...prev, [editing]: descVal }));
        setEditing(null);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-htg-card border border-htg-card-border rounded-xl p-4">
      <p className="text-sm font-semibold text-htg-fg mb-1">{title}</p>
      {description && <p className="text-xs text-htg-fg-muted mb-3 line-clamp-2">{description}</p>}

      <div className="space-y-2">
        {LOCALES.map((locale) => {
          const hasTitle = !!i18nTitle[locale];
          const isEditing = editing === locale;

          return (
            <div key={locale} className="border border-htg-card-border rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-htg-surface">
                <span className="text-xs font-bold text-htg-fg-muted w-6">{LOCALE_LABELS[locale]}</span>
                {hasTitle
                  ? <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />
                  : <span className="w-3.5 h-3.5 rounded-full border-2 border-htg-fg-muted/30 shrink-0" />
                }
                <span className="text-xs text-htg-fg flex-1 truncate">
                  {i18nTitle[locale] || <span className="text-htg-fg-muted italic">brak</span>}
                </span>
                {!isEditing && (
                  <button
                    onClick={() => startEdit(locale)}
                    className="text-htg-fg-muted hover:text-htg-fg transition-colors"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {isEditing && (
                <div className="p-3 space-y-2 border-t border-htg-card-border bg-htg-bg">
                  <input
                    type="text"
                    value={titleVal}
                    onChange={e => setTitleVal(e.target.value)}
                    placeholder="Tytuł..."
                    className="w-full text-sm bg-htg-surface border border-htg-card-border rounded-lg px-3 py-1.5 text-htg-fg placeholder:text-htg-fg-muted focus:outline-none focus:ring-1 focus:ring-htg-warm/50"
                  />
                  {description !== null && (
                    <textarea
                      value={descVal}
                      onChange={e => setDescVal(e.target.value)}
                      placeholder="Opis (opcjonalnie)..."
                      rows={2}
                      className="w-full text-sm bg-htg-surface border border-htg-card-border rounded-lg px-3 py-1.5 text-htg-fg placeholder:text-htg-fg-muted focus:outline-none focus:ring-1 focus:ring-htg-warm/50 resize-none"
                    />
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={save}
                      disabled={saving || !titleVal.trim()}
                      className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg bg-htg-sage text-white disabled:opacity-50 hover:opacity-90"
                    >
                      {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                      Zapisz
                    </button>
                    <button
                      onClick={() => setEditing(null)}
                      className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg border border-htg-card-border text-htg-fg-muted hover:text-htg-fg"
                    >
                      <X className="w-3 h-3" />
                      Anuluj
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
