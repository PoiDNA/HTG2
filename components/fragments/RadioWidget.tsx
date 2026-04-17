'use client';

/**
 * RadioWidget — compact embeddable Radio Momentów card.
 * Designed for /konto and other pages where radio is a secondary feature.
 * Wraps RadioPlayer (compact=true, scope="all") inside a titled section.
 */

import { Link } from '@/i18n-config';
import { Radio } from 'lucide-react';
import RadioPlayer from './RadioPlayer';

export default function RadioWidget() {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-htg-sage" />
          <h2 className="text-sm font-semibold text-htg-fg">Radio Momentów</h2>
        </div>
        <Link
          href="/konto/momenty/radio"
          className="text-xs text-htg-fg-muted hover:text-htg-sage transition-colors"
        >
          Pełny widok →
        </Link>
      </div>
      <RadioPlayer scope="all" compact />
    </div>
  );
}
