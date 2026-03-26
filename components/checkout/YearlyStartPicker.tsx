'use client';

import { useState } from 'react';
import { Calendar, Check } from 'lucide-react';

interface YearlyStartPickerProps {
  months: { label: string; title: string }[];
  priceId: string;
  onCheckout: (startMonth: string) => void;
  loading?: boolean;
}

export default function YearlyStartPicker({ months, priceId, onCheckout, loading }: YearlyStartPickerProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const selectedIdx = selected ? months.findIndex(m => m.label === selected) : -1;
  const coveredMonths = selectedIdx >= 0 ? months.slice(selectedIdx, selectedIdx + 12) : [];

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full bg-htg-sage text-white py-3 rounded-lg font-medium hover:bg-htg-sage-dark transition-colors"
      >
        Subskrybuj
      </button>

      {open && (
        <div className="mt-4 bg-htg-card border border-htg-card-border rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-5 h-5 text-htg-sage" />
            <h3 className="font-serif font-bold text-htg-fg">Od którego miesiąca?</h3>
          </div>
          <p className="text-htg-fg-muted text-sm mb-4">
            Wybierz miesiąc startowy. Otrzymasz dostęp do 12 kolejnych miesięcy.
          </p>

          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-4">
            {months.map(m => {
              const isCovered = coveredMonths.some(cm => cm.label === m.label);
              const isStart = m.label === selected;
              return (
                <button
                  key={m.label}
                  onClick={() => setSelected(m.label)}
                  className={`text-xs p-2 rounded-lg border transition-all ${
                    isStart
                      ? 'bg-htg-sage text-white border-htg-sage font-bold'
                      : isCovered
                        ? 'bg-htg-sage/20 text-htg-fg border-htg-sage/30'
                        : 'bg-htg-surface text-htg-fg-muted border-htg-card-border hover:border-htg-sage/40'
                  }`}
                >
                  {m.title.replace('Sesje ', '')}
                  {isStart && <Check className="w-3 h-3 inline ml-1" />}
                </button>
              );
            })}
          </div>

          {selected && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-htg-card-border">
              <div>
                <p className="text-htg-fg font-medium">12 miesięcy od {coveredMonths[0]?.title.replace('Sesje ', '')}</p>
                <p className="text-htg-fg-muted text-sm">do {coveredMonths[coveredMonths.length - 1]?.title.replace('Sesje ', '')}</p>
              </div>
              <button
                onClick={() => onCheckout(selected)}
                disabled={loading}
                className="bg-htg-sage text-white px-6 py-3 rounded-lg font-medium hover:bg-htg-sage-dark transition-colors disabled:opacity-50"
              >
                {loading ? 'Przetwarzanie...' : '999 PLN / rok — Subskrybuj'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
