'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

export function MonthFilter({ label }: { label: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get('month') || '';

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const params = new URLSearchParams(searchParams.toString());
      if (e.target.value) {
        params.set('month', e.target.value);
      } else {
        params.delete('month');
      }
      router.push(`?${params.toString()}`);
    },
    [router, searchParams]
  );

  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-htg-fg-muted">{label}</label>
      <input
        type="month"
        value={current}
        onChange={handleChange}
        className="rounded-lg border border-htg-card-border bg-htg-card px-3 py-1.5 text-sm text-htg-fg focus:outline-none focus:ring-2 focus:ring-htg-sage"
      />
    </div>
  );
}
