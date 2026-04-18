'use client';

import { useState, useEffect } from 'react';
import { Link } from '@/i18n-config';
import { Play } from 'lucide-react';

export default function MomentsButton() {
  const [phase, setPhase] = useState<'hidden' | 'visible' | 'fading'>('hidden');

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('visible'), 80);
    const t2 = setTimeout(() => setPhase('fading'), 2500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <Link href="/konto/momenty" className="flex items-center justify-end gap-4 group">
      <span
        className="text-4xl sm:text-[56px] font-serif font-bold leading-none text-htg-fg transition-all duration-700"
        style={{
          opacity: phase === 'visible' ? 1 : 0,
          transform: phase === 'visible' ? 'translateX(0)' : 'translateX(-16px)',
        }}
      >
        Momenty
      </span>
      <div className="shrink-0 w-16 h-16 rounded-full bg-violet-400 flex items-center justify-center shadow-xl shadow-violet-400/25 group-hover:brightness-110 transition-[filter]">
        <Play className="w-7 h-7 text-white ml-1" />
      </div>
    </Link>
  );
}
