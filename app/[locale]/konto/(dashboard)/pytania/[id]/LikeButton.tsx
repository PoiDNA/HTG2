'use client';

import { useState } from 'react';
import { ThumbsUp } from 'lucide-react';

interface Props {
  questionId: string;
  initialLiked: boolean;
  initialCount: number;
}

export default function LikeButton({ questionId, initialLiked, initialCount }: Props) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    if (loading) return;
    setLoading(true);
    const res = await fetch(`/api/pytania/${questionId}/like`, { method: 'POST' });
    setLoading(false);
    if (!res.ok) return;
    const { action } = await res.json();
    if (action === 'added') { setLiked(true); setCount(c => c + 1); }
    if (action === 'removed') { setLiked(false); setCount(c => c - 1); }
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
        liked
          ? 'bg-htg-sage/10 border-htg-sage text-htg-sage'
          : 'border-htg-card-border text-htg-fg-muted hover:border-htg-sage/50 hover:text-htg-sage'
      } disabled:opacity-50`}
    >
      <ThumbsUp className={`w-4 h-4 ${liked ? 'fill-htg-sage' : ''}`} />
      {count} {count === 1 ? 'polubienie' : 'polubień'}
    </button>
  );
}
