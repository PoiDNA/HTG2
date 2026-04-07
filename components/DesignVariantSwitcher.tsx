'use client';

import { usePathname } from '@/i18n-config';
import { setDesignVariant } from '@/lib/design-variant-actions';
import type { DesignVariant } from '@/lib/design-variant';

const VARIANTS: DesignVariant[] = ['v1', 'v2', 'v3'];

export default function DesignVariantSwitcher({
  currentVariant,
  locale,
}: {
  currentVariant: DesignVariant;
  locale: string;
}) {
  const pathname = usePathname();

  return (
    <div className="fixed bottom-4 left-4 z-[9999] flex items-center gap-1 rounded-full bg-htg-card border border-htg-card-border shadow-lg px-2 py-1.5 text-xs font-medium">
      <span className="px-2 text-htg-fg-muted">Design</span>
      {VARIANTS.map((v) => (
        <form key={v} action={setDesignVariant}>
          <input type="hidden" name="variant" value={v} />
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="path" value={`/${locale}${pathname}`} />
          <button
            type="submit"
            className={`px-3 py-1.5 rounded-full transition-colors ${
              v === currentVariant
                ? 'bg-htg-indigo text-white'
                : 'text-htg-fg-muted hover:text-htg-fg hover:bg-htg-surface'
            }`}
          >
            {v.toUpperCase()}
          </button>
        </form>
      ))}
    </div>
  );
}
