'use client';

import { useState, useEffect } from 'react';
import { Link } from '@/i18n-config';
import MomentyGlobe from './MomentyGlobe';

interface Moment {
  id: string;
  title: string;
  session_title: string;
  session_slug: string;
}

const CYCLE_INTERVAL = 8000; // ms per fragment

export default function MomentyPlayer({ moments }: { moments: Moment[] }) {
  const [index, setIndex] = useState(0);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (moments.length <= 1) return;
    const timer = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % moments.length);
        setFading(false);
      }, 400);
    }, CYCLE_INTERVAL);
    return () => clearInterval(timer);
  }, [moments.length]);

  if (moments.length === 0) return null;

  const current = moments[index];

  return (
    <div className="flex flex-col items-center gap-8 w-full">
      {/* Globe */}
      <div className="relative w-48 h-48 sm:w-64 sm:h-64">
        <MomentyGlobe fragmentIndex={index} />
      </div>

      {/* Fragment info */}
      <div
        className="text-center transition-opacity duration-400"
        style={{ opacity: fading ? 0 : 1 }}
      >
        <p className="text-xs font-medium text-htg-sage uppercase tracking-widest mb-2">
          Moment
        </p>
        <h3 className="font-serif font-semibold text-xl text-htg-fg mb-1 max-w-sm">
          {current.title}
        </h3>
        <p className="text-sm text-htg-fg-muted">{current.session_title}</p>
      </div>

      {/* Dots */}
      {moments.length > 1 && (
        <div className="flex gap-2">
          {moments.map((_, i) => (
            <button
              key={i}
              onClick={() => { setFading(true); setTimeout(() => { setIndex(i); setFading(false); }, 300); }}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === index ? 'bg-htg-sage' : 'bg-htg-fg-muted/30'
              }`}
              aria-label={`Moment ${i + 1}`}
            />
          ))}
        </div>
      )}

      {/* CTA */}
      <Link
        href="/konto/momenty"
        className="text-sm text-htg-fg-muted/70 hover:text-htg-fg transition-colors"
      >
        Słuchaj swoich Momentów →
      </Link>
    </div>
  );
}
