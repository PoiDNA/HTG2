'use client';

import { useState, useEffect, useRef } from 'react';
import { FileText, ChevronDown, Settings, Plus } from 'lucide-react';

interface Template {
  id: string;
  name: string;
  category: string | null;
  body_text: string;
  body_html: string | null;
  created_by: string | null;
}

interface Props {
  onInsert: (text: string) => void;
  onManage: () => void;
  userId: string;
}

export default function TemplateInsert({ onInsert, onManage, userId }: Props) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Fetch templates when opening
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch('/api/email/templates')
      .then(r => r.json())
      .then(data => { setTemplates(data.templates || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [open]);

  const myTemplates = templates.filter(t => t.created_by === userId);
  const globalTemplates = templates.filter(t => !t.created_by || t.created_by !== userId);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        title="Wstaw szablon"
        className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-htg-fg-muted hover:text-htg-fg hover:bg-htg-surface border border-htg-card-border transition-colors"
      >
        <FileText className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Szablon</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute bottom-full mb-1 left-0 w-64 bg-htg-card border border-htg-card-border rounded-xl shadow-2xl z-20 max-h-72 overflow-y-auto">
          {loading ? (
            <div className="p-3 text-xs text-htg-fg-muted text-center">Ładowanie...</div>
          ) : templates.length === 0 ? (
            <div className="p-3 text-xs text-htg-fg-muted text-center">
              Brak szablonów. Utwórz pierwszy!
            </div>
          ) : (
            <>
              {myTemplates.length > 0 && (
                <>
                  <div className="px-3 pt-2 pb-1 text-[10px] font-semibold text-htg-fg-muted uppercase tracking-wider">Moje szablony</div>
                  {myTemplates.map(t => (
                    <button
                      key={t.id}
                      onClick={() => { onInsert(t.body_text); setOpen(false); }}
                      className="w-full text-left px-3 py-2 hover:bg-htg-surface transition-colors group"
                    >
                      <p className="text-sm text-htg-fg truncate">{t.name}</p>
                      <p className="text-[10px] text-htg-fg-muted truncate mt-0.5 group-hover:text-htg-fg/70">
                        {t.body_text.slice(0, 60)}{t.body_text.length > 60 ? '…' : ''}
                      </p>
                    </button>
                  ))}
                </>
              )}

              {globalTemplates.length > 0 && (
                <>
                  <div className="px-3 pt-2 pb-1 text-[10px] font-semibold text-htg-fg-muted uppercase tracking-wider">
                    {myTemplates.length > 0 ? 'Globalne' : 'Szablony'}
                  </div>
                  {globalTemplates.map(t => (
                    <button
                      key={t.id}
                      onClick={() => { onInsert(t.body_text); setOpen(false); }}
                      className="w-full text-left px-3 py-2 hover:bg-htg-surface transition-colors group"
                    >
                      <p className="text-sm text-htg-fg truncate">{t.name}</p>
                      <p className="text-[10px] text-htg-fg-muted truncate mt-0.5 group-hover:text-htg-fg/70">
                        {t.body_text.slice(0, 60)}{t.body_text.length > 60 ? '…' : ''}
                      </p>
                    </button>
                  ))}
                </>
              )}
            </>
          )}

          <div className="border-t border-htg-card-border">
            <button
              onClick={() => { onManage(); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-htg-fg-muted hover:text-htg-fg hover:bg-htg-surface transition-colors"
            >
              <Settings className="w-3 h-3" />
              Zarządzaj szablonami
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
