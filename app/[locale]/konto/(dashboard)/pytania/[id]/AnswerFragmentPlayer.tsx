'use client';

import { Play } from 'lucide-react';
import { usePlayer } from '@/lib/player-context';

interface Props {
  fragment: {
    id: string;
    title: string;
    start_sec: number;
    end_sec: number;
    session_template_id: string;
    session_title: string;
  };
  questionTitle: string;
}

export default function AnswerFragmentPlayer({ fragment, questionTitle }: Props) {
  const { startPlayback } = usePlayer();

  function play() {
    startPlayback({
      kind: 'pytania_answer',
      sessionFragmentId: fragment.id,
      sessionId: fragment.session_template_id,
      title: fragment.session_title,
      fragmentTitle: questionTitle,
      startSec: fragment.start_sec,
      endSec: fragment.end_sec,
    });
  }

  return (
    <button
      onClick={play}
      className="mt-6 w-full bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-left hover:bg-emerald-100 transition-colors group"
    >
      <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider mb-2">Odpowiedź w nagraniu</p>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center shrink-0 group-hover:bg-emerald-600 transition-colors">
          <Play className="w-5 h-5 text-white fill-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-emerald-900 truncate">{fragment.title}</p>
          <p className="text-xs text-emerald-700">
            {Math.floor(fragment.start_sec / 60)}:{String(Math.floor(fragment.start_sec % 60)).padStart(2, '0')} – {Math.floor(fragment.end_sec / 60)}:{String(Math.floor(fragment.end_sec % 60)).padStart(2, '0')}
          </p>
        </div>
      </div>
    </button>
  );
}
