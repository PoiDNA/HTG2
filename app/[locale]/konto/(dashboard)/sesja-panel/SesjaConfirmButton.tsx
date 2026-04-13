'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

export default function SesjaConfirmButton({ bookingId }: { bookingId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleConfirm() {
    setLoading(true);
    try {
      const res = await fetch('/api/booking/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Nie udało się potwierdzić sesji');
        return;
      }
      toast.success('Sesja potwierdzona!');
      router.refresh();
    } catch {
      toast.error('Wystąpił błąd. Spróbuj ponownie.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleConfirm}
      disabled={loading}
      className="bg-htg-sage text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-htg-sage-dark transition-colors disabled:opacity-50"
    >
      {loading ? 'Potwierdzam...' : 'Potwierdź udział'}
    </button>
  );
}
