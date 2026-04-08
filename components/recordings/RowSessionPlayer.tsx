'use client';

import { Play, X } from 'lucide-react';

/**
 * Minimalistyczny toggle button dla wiersza w AdminSessionList / SessionList.
 * Renderuje TYLKO przycisk Odsłuchaj/Zamknij. Expanded player jest renderowany
 * przez parent komponent poza flex-row wiersza (żeby uniknąć layout issues z
 * `display:contents` w InlineRecordingPlayer, który zakłada CSS Grid parent).
 *
 * Labels hardcoded Polish (spójnie z AdminSessionList/SessionList).
 */
interface Props {
  isExpanded: boolean;
  onToggle: () => void;
}

export default function RowSessionPlayer({ isExpanded, onToggle }: Props) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={`
        flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
        ${isExpanded
          ? 'bg-htg-surface-hover text-htg-fg-muted hover:text-htg-fg'
          : 'bg-htg-sage text-white hover:bg-htg-sage/90'}
      `}
      title={isExpanded ? 'Zamknij' : 'Odsłuchaj'}
    >
      {isExpanded ? (
        <>
          <X className="w-3.5 h-3.5" />
          Zamknij
        </>
      ) : (
        <>
          <Play className="w-3.5 h-3.5" />
          Odsłuchaj
        </>
      )}
    </button>
  );
}
