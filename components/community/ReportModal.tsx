'use client';

import { useState, useRef } from 'react';
import { X, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface ReportModalProps {
  targetType: 'post' | 'comment';
  targetId: string;
  onClose: () => void;
}

export function ReportModal({ targetType, targetId, onClose }: ReportModalProps) {
  const t = useTranslations('Community');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/community/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_type: targetType, target_id: targetId, reason }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Nie udało się zgłosić');
      }

      setSuccess(true);
      setTimeout(onClose, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Błąd');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
    >
      <div className="w-full max-w-md bg-htg-card border border-htg-card-border rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-htg-card-border">
          <h3 className="font-serif font-semibold text-htg-fg">Zgłoś treść</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-htg-surface">
            <X className="w-5 h-5 text-htg-fg-muted" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {success ? (
            <p className="text-sm text-htg-sage font-medium">
              Zgłoszenie zostało wysłane. Dziękujemy za pomoc w moderacji.
            </p>
          ) : (
            <>
              <p className="text-sm text-htg-fg-muted">
                Opisz powód zgłoszenia. Twoje zgłoszenie zostanie przejrzane przez zespół HTG.
              </p>

              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t('report_reason')}
                rows={3}
                className="w-full px-4 py-2 bg-htg-surface border border-htg-card-border rounded-lg text-htg-fg text-sm focus:outline-none focus:ring-1 focus:ring-htg-sage/50 resize-none"
              />

              {error && (
                <div className="px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                  {error}
                </div>
              )}

              <div className="flex gap-3 justify-end">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm text-htg-fg-muted hover:text-htg-fg transition-colors"
                >
                  Anuluj
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Zgłoś
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
