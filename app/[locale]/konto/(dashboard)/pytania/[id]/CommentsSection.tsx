'use client';

import { useState } from 'react';
import { Send } from 'lucide-react';

export interface Comment {
  id: string;
  body: string;
  created_at: string;
  author: { display_name: string | null; avatar_url: string | null } | null;
}

interface Props {
  questionId: string;
  initialComments: Comment[];
  isBlocked: boolean;
}

export default function CommentsSection({ questionId, initialComments, isBlocked }: Props) {
  const [comments, setComments] = useState<Comment[]>(initialComments);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/pytania/${questionId}/komentarze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: body.trim() }),
    });
    setLoading(false);
    if (!res.ok) {
      const json = await res.json();
      setError(json.error ?? 'Błąd — spróbuj ponownie');
      return;
    }
    const newComment: Comment = await res.json();
    setComments(prev => [...prev, newComment]);
    setBody('');
  }

  return (
    <div>
      <h2 className="text-base font-semibold text-htg-fg mb-4">
        Komentarze ({comments.length})
      </h2>

      {comments.length === 0 ? (
        <p className="text-sm text-htg-fg-muted mb-4">Brak komentarzy — bądź pierwszym!</p>
      ) : (
        <div className="space-y-3 mb-4">
          {comments.map(c => (
            <div key={c.id} className="bg-htg-surface rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium text-htg-fg">
                  {c.author?.display_name ?? 'Uczestnik'}
                </span>
                <span className="text-xs text-htg-fg-muted/60">
                  {new Date(c.created_at).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </div>
              <p className="text-sm text-htg-fg leading-relaxed">{c.body}</p>
            </div>
          ))}
        </div>
      )}

      {isBlocked ? (
        <p className="text-sm text-htg-fg-muted bg-htg-surface rounded-lg px-3 py-2 italic">
          Komentowanie zostało zamknięte — pytanie zostało rozpoznane.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Napisz komentarz lub uzupełnienie…"
            maxLength={3000}
            className="flex-1 bg-htg-surface border border-htg-card-border rounded-lg px-3 py-2 text-sm text-htg-fg placeholder:text-htg-fg-muted/60 focus:outline-none focus:border-htg-sage"
          />
          <button
            type="submit"
            disabled={loading || !body.trim()}
            className="px-3 py-2 rounded-lg bg-htg-sage text-white hover:bg-htg-sage/90 transition-colors disabled:opacity-40"
          >
            <Send className="w-4 h-4" />
          </button>
          {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        </form>
      )}
    </div>
  );
}
