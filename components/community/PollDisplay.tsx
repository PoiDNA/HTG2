'use client';

import { useState, useEffect, useCallback } from 'react';
import { BarChart3, Check } from 'lucide-react';

interface PollDisplayProps {
  postId: string;
  question: string;
  options: string[];
}

interface PollResults {
  vote_counts: Record<number, number>;
  total_votes: number;
  user_vote: number | null;
}

/**
 * Displays a poll with voting functionality and live results.
 */
export function PollDisplay({ postId, question, options }: PollDisplayProps) {
  const [results, setResults] = useState<PollResults | null>(null);
  const [voting, setVoting] = useState(false);
  const [loading, setLoading] = useState(true);

  // Fetch current results
  useEffect(() => {
    fetch(`/api/community/polls/vote?post_id=${postId}`)
      .then(r => r.json())
      .then(data => {
        setResults(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [postId]);

  const handleVote = useCallback(async (optionIndex: number) => {
    if (voting) return;
    setVoting(true);

    // Optimistic update
    setResults(prev => {
      if (!prev) return { vote_counts: { [optionIndex]: 1 }, total_votes: 1, user_vote: optionIndex };
      const counts = { ...prev.vote_counts };
      // Remove old vote
      if (prev.user_vote !== null && counts[prev.user_vote]) {
        counts[prev.user_vote] = Math.max(0, counts[prev.user_vote] - 1);
      }
      // Add new vote
      counts[optionIndex] = (counts[optionIndex] || 0) + 1;
      return {
        ...prev,
        vote_counts: counts,
        total_votes: prev.user_vote !== null ? prev.total_votes : prev.total_votes + 1,
        user_vote: optionIndex,
      };
    });

    try {
      const res = await fetch('/api/community/polls/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: postId, option_index: optionIndex }),
      });

      if (res.ok) {
        const data = await res.json();
        setResults(data);
      }
    } finally {
      setVoting(false);
    }
  }, [postId, voting]);

  const hasVoted = results?.user_vote !== null && results?.user_vote !== undefined;
  const totalVotes = results?.total_votes ?? 0;

  return (
    <div className="mx-4 mb-3 border border-htg-card-border rounded-xl p-4">
      <h4 className="font-medium text-sm text-htg-fg mb-3 flex items-center gap-1.5">
        <BarChart3 className="w-4 h-4 text-htg-sage" />
        {question}
      </h4>

      <div className="space-y-2">
        {options.map((option, i) => {
          const voteCount = results?.vote_counts[i] ?? 0;
          const percentage = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
          const isSelected = results?.user_vote === i;

          return (
            <button
              key={i}
              onClick={() => handleVote(i)}
              disabled={voting || loading}
              className={`w-full text-left relative overflow-hidden rounded-lg border transition-colors ${
                isSelected
                  ? 'border-htg-sage bg-htg-sage/5'
                  : 'border-htg-card-border hover:border-htg-sage/30'
              }`}
            >
              {/* Progress bar background */}
              {hasVoted && (
                <div
                  className="absolute inset-0 bg-htg-sage/10 transition-all duration-500"
                  style={{ width: `${percentage}%` }}
                />
              )}

              <div className="relative flex items-center justify-between px-3 py-2.5">
                <div className="flex items-center gap-2">
                  {isSelected && <Check className="w-4 h-4 text-htg-sage" />}
                  <span className="text-sm text-htg-fg">{option}</span>
                </div>
                {hasVoted && (
                  <span className="text-xs text-htg-fg-muted font-medium tabular-nums">
                    {percentage}% ({voteCount})
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <p className="text-xs text-htg-fg-muted mt-2">
        {totalVotes} {totalVotes === 1 ? 'głos' : totalVotes < 5 ? 'głosy' : 'głosów'}
      </p>
    </div>
  );
}
