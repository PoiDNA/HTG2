'use client';

import { useState, useEffect } from 'react';
import { X, Plus, Pencil, Trash2, Save } from 'lucide-react';

interface Template {
  id: string;
  name: string;
  category: string | null;
  subject: string | null;
  body_text: string;
  body_html: string | null;
  created_by: string | null;
}

interface Props {
  onClose: () => void;
  isAdmin: boolean;
  userId: string;
}

export default function TemplateManager({ onClose, isAdmin, userId }: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null); // template id or 'new'
  const [form, setForm] = useState({ name: '', category: '', subject: '', bodyText: '' });
  const [saving, setSaving] = useState(false);

  const fetch_ = async () => {
    setLoading(true);
    const res = await fetch('/api/email/templates');
    const data = await res.json();
    setTemplates(data.templates || []);
    setLoading(false);
  };

  useEffect(() => { fetch_(); }, []);

  const startNew = () => {
    setEditing('new');
    setForm({ name: '', category: '', subject: '', bodyText: '' });
  };

  const startEdit = (t: Template) => {
    setEditing(t.id);
    setForm({ name: t.name, category: t.category || '', subject: t.subject || '', bodyText: t.body_text });
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.bodyText.trim()) return;
    setSaving(true);

    if (editing === 'new') {
      await fetch('/api/email/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          category: form.category || null,
          subject: form.subject || null,
          bodyText: form.bodyText,
          bodyHtml: `<p>${form.bodyText.replace(/\n/g, '<br/>')}</p>`,
        }),
      });
    } else if (editing) {
      await fetch(`/api/email/templates/${editing}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          category: form.category || null,
          subject: form.subject || null,
          bodyText: form.bodyText,
          bodyHtml: `<p>${form.bodyText.replace(/\n/g, '<br/>')}</p>`,
        }),
      });
    }

    setEditing(null);
    setSaving(false);
    fetch_();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Usunąć szablon?')) return;
    await fetch(`/api/email/templates/${id}`, { method: 'DELETE' });
    fetch_();
  };

  const canEdit = (t: Template) => isAdmin || t.created_by === userId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-htg-card border border-htg-card-border rounded-xl w-full max-w-2xl shadow-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-htg-card-border shrink-0">
          <h3 className="font-serif font-semibold text-htg-fg">Szablony wiadomości</h3>
          <button onClick={onClose} className="text-htg-fg-muted hover:text-htg-fg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {editing ? (
            /* Edit/Create form */
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-htg-fg-muted block mb-1">Nazwa szablonu *</label>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="np. Potwierdzenie rezerwacji"
                  className="w-full px-3 py-2 rounded-lg border border-htg-card-border bg-htg-surface text-htg-fg text-sm focus:outline-none focus:ring-1 focus:ring-htg-sage"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-htg-fg-muted block mb-1">Kategoria</label>
                  <input
                    value={form.category}
                    onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    placeholder="np. rezerwacja"
                    className="w-full px-3 py-2 rounded-lg border border-htg-card-border bg-htg-surface text-htg-fg text-sm focus:outline-none focus:ring-1 focus:ring-htg-sage"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-htg-fg-muted block mb-1">Temat (opcjonalnie)</label>
                  <input
                    value={form.subject}
                    onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                    placeholder="np. Potwierdzenie"
                    className="w-full px-3 py-2 rounded-lg border border-htg-card-border bg-htg-surface text-htg-fg text-sm focus:outline-none focus:ring-1 focus:ring-htg-sage"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-htg-fg-muted block mb-1">Treść szablonu *</label>
                <textarea
                  value={form.bodyText}
                  onChange={e => setForm(f => ({ ...f, bodyText: e.target.value }))}
                  rows={8}
                  placeholder="Dzień dobry,&#10;&#10;Dziękujemy za kontakt...&#10;&#10;Pozdrawiam,&#10;Zespół HTG"
                  className="w-full px-3 py-2 rounded-lg border border-htg-card-border bg-htg-surface text-htg-fg text-sm focus:outline-none focus:ring-1 focus:ring-htg-sage resize-none"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setEditing(null)}
                  className="px-4 py-2 text-sm rounded-lg border border-htg-card-border text-htg-fg-muted hover:text-htg-fg transition-colors"
                >
                  Anuluj
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !form.name.trim() || !form.bodyText.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-htg-sage text-white font-medium hover:bg-htg-sage-dark disabled:opacity-50 transition-colors"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Zapisywanie...' : 'Zapisz'}
                </button>
              </div>
            </div>
          ) : (
            /* Template list */
            <div className="space-y-2">
              {loading ? (
                <p className="text-sm text-htg-fg-muted text-center py-4">Ładowanie...</p>
              ) : templates.length === 0 ? (
                <p className="text-sm text-htg-fg-muted text-center py-4">Brak szablonów. Utwórz pierwszy!</p>
              ) : (
                templates.map(t => (
                  <div key={t.id} className="flex items-start gap-3 p-3 rounded-lg bg-htg-surface border border-htg-card-border">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-htg-fg truncate">{t.name}</p>
                        {t.category && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-htg-card text-htg-fg-muted">{t.category}</span>
                        )}
                        {!t.created_by && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-htg-sage/10 text-htg-sage">globalny</span>
                        )}
                      </div>
                      <p className="text-xs text-htg-fg-muted mt-1 line-clamp-2">{t.body_text}</p>
                    </div>
                    {canEdit(t) && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => startEdit(t)} className="p-1.5 rounded hover:bg-htg-card text-htg-fg-muted hover:text-htg-fg transition-colors" title="Edytuj">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(t.id)} className="p-1.5 rounded hover:bg-red-500/10 text-htg-fg-muted hover:text-red-500 transition-colors" title="Usuń">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer — new template button */}
        {!editing && (
          <div className="p-3 border-t border-htg-card-border shrink-0">
            <button
              onClick={startNew}
              className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-htg-sage text-white font-medium hover:bg-htg-sage-dark transition-colors"
            >
              <Plus className="w-4 h-4" />
              Nowy szablon
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
