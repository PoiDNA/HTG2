'use client';

import { useState } from 'react';
import { Radio, Star, Bookmark } from 'lucide-react';
import RadioPlayer from '@/components/fragments/RadioPlayer';

interface Category {
  id: string;
  name: string;
  color: string | null;
}

interface Props {
  categories: Category[];
}

type ScopeOption =
  | { id: 'all';       label: string; icon: React.ReactNode }
  | { id: 'favorites'; label: string; icon: React.ReactNode }
  | { id: string;      label: string; icon: React.ReactNode; categoryId: string };

export default function RadioPageClient({ categories }: Props) {
  const [activeScope, setActiveScope] = useState<string>('all');

  const scopeOptions: ScopeOption[] = [
    { id: 'all',       label: 'Wszystkie Momenty', icon: <Radio className="w-3.5 h-3.5" /> },
    { id: 'favorites', label: '⭐ Ulubione',        icon: <Star  className="w-3.5 h-3.5" /> },
    ...categories.map(cat => ({
      id: `cat:${cat.id}`,
      label: cat.name,
      icon: <Bookmark className="w-3.5 h-3.5" />,
      categoryId: cat.id,
    })),
  ];

  const active = scopeOptions.find(s => s.id === activeScope) ?? scopeOptions[0];
  const scope   = active.id === 'all' ? 'all' : active.id === 'favorites' ? 'favorites' : 'category';
  const scopeId = 'categoryId' in active ? active.categoryId : undefined;

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 bg-htg-sage/10 rounded-2xl flex items-center justify-center">
          <Radio className="w-6 h-6 text-htg-sage" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-htg-fg">Radio Momentów</h1>
          <p className="text-sm text-htg-fg-muted">Ciągłe odtwarzanie Twoich Momentów w losowej kolejności</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Scope selector sidebar */}
        <nav className="lg:w-52 shrink-0">
          <p className="text-xs font-semibold text-htg-fg-muted uppercase tracking-wider px-3 mb-2">
            Źródło
          </p>
          <div className="space-y-1">
            {scopeOptions.map(opt => (
              <button
                key={opt.id}
                onClick={() => setActiveScope(opt.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2
                           ${activeScope === opt.id
                             ? 'bg-htg-sage/10 text-htg-sage font-medium'
                             : 'text-htg-fg-muted hover:text-htg-fg hover:bg-htg-surface'}`}
              >
                <span className="shrink-0">{opt.icon}</span>
                <span className="truncate">{opt.label}</span>
              </button>
            ))}
          </div>
        </nav>

        {/* Player */}
        <div className="flex-1">
          <RadioPlayer
            scope={scope as 'all' | 'favorites' | 'category'}
            scopeId={scopeId}
            scopeLabel={active.label}
          />
        </div>
      </div>
    </div>
  );
}
