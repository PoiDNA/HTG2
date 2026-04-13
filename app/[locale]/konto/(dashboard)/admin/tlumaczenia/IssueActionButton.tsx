'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

interface Props {
  id: string;
  action: 'resolve' | 'reject';
  label: string;
  className: string;
}

export default function IssueActionButton({ id, action, label, className }: Props) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleClick() {
    setLoading(true);
    try {
      await fetch(`/api/admin/translation-issues/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-white disabled:opacity-50 hover:opacity-90 ${className}`}
    >
      {loading && <Loader2 className="w-3 h-3 animate-spin" />}
      {label}
    </button>
  );
}
