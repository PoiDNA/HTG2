'use client';

import { useState } from 'react';
import { MessageSquare } from 'lucide-react';

export default function PaymentCommentEditor({
  bookingId,
  initialComment,
}: {
  bookingId: string;
  initialComment: string;
}) {
  const [comment, setComment] = useState(initialComment);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    await fetch(`/api/booking/${bookingId}/payment-status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payment_comment: comment }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="bg-htg-card border border-htg-card-border rounded-xl p-6 space-y-3">
      <h2 className="text-base font-serif font-bold text-htg-fg flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-htg-warm" />
        Komentarz płatności
      </h2>
      <p className="text-xs text-htg-fg-muted">Widoczny tylko dla Natalii i Admina</p>
      <textarea
        value={comment}
        onChange={e => setComment(e.target.value)}
        className="w-full bg-htg-surface border border-htg-card-border rounded-lg p-3 text-sm text-htg-fg placeholder-htg-fg-muted resize-none"
        rows={2}
        placeholder="Notatka o płatności..."
      />
      <button
        onClick={save}
        disabled={saving}
        className="bg-htg-sage text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-htg-sage/90 transition-colors disabled:opacity-50"
      >
        {saving ? 'Zapisywanie...' : saved ? 'Zapisano ✓' : 'Zapisz komentarz'}
      </button>
    </div>
  );
}
