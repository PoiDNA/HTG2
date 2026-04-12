'use client';

import { useState } from 'react';
import { Plus, X, BarChart3 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Attachment } from '@/lib/community/types';

interface PollCreatorProps {
  onPollCreated: (attachment: Attachment) => void;
  onCancel: () => void;
}

/**
 * Inline poll creator for PostEditor.
 * Creates a poll attachment to include in a post.
 */
export function PollCreator({ onPollCreated, onCancel }: PollCreatorProps) {
  const t = useTranslations('Community');
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);

  const addOption = () => {
    if (options.length < 6) setOptions([...options, '']);
  };

  const removeOption = (index: number) => {
    if (options.length <= 2) return;
    setOptions(options.filter((_, i) => i !== index));
  };

  const handleCreate = () => {
    const validOptions = options.filter(o => o.trim());
    if (!question.trim() || validOptions.length < 2) return;

    const pollAttachment: Attachment = {
      type: 'poll' as 'image', // Type assertion for now — polls use custom type
      url: '',
      status: 'ready',
      metadata: {
        question: question.trim(),
        options: validOptions,
        multiple: false,
      } as Record<string, unknown>,
    } as unknown as Attachment;

    onPollCreated(pollAttachment);
  };

  return (
    <div className="border border-htg-card-border rounded-lg p-4 bg-htg-surface/50">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium text-htg-fg flex items-center gap-1">
          <BarChart3 className="w-4 h-4 text-htg-sage" />
          Ankieta
        </h4>
        <button
          onClick={onCancel}
          className="p-1 rounded text-htg-fg-muted hover:text-htg-fg"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Question */}
      <input
        type="text"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder={t('poll_question_placeholder')}
        className="w-full px-3 py-2 mb-3 bg-htg-card border border-htg-card-border rounded-lg text-sm text-htg-fg focus:outline-none focus:ring-1 focus:ring-htg-sage/50"
      />

      {/* Options */}
      <div className="space-y-2 mb-3">
        {options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-xs text-htg-fg-muted w-5 text-center">{i + 1}.</span>
            <input
              type="text"
              value={opt}
              onChange={(e) => {
                const next = [...options];
                next[i] = e.target.value;
                setOptions(next);
              }}
              placeholder={`Opcja ${i + 1}`}
              className="flex-1 px-3 py-1.5 bg-htg-card border border-htg-card-border rounded-lg text-sm text-htg-fg focus:outline-none focus:ring-1 focus:ring-htg-sage/50"
            />
            {options.length > 2 && (
              <button
                onClick={() => removeOption(i)}
                className="p-1 text-htg-fg-muted hover:text-red-500"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        {options.length < 6 && (
          <button
            onClick={addOption}
            className="flex items-center gap-1 text-xs text-htg-sage hover:underline"
          >
            <Plus className="w-3 h-3" /> Dodaj opcję
          </button>
        )}

        <button
          onClick={handleCreate}
          disabled={!question.trim() || options.filter(o => o.trim()).length < 2}
          className="px-3 py-1.5 bg-htg-sage text-white rounded-lg text-xs font-medium hover:bg-htg-sage-dark disabled:opacity-50"
        >
          Dodaj ankietę
        </button>
      </div>
    </div>
  );
}
