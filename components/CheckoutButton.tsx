'use client';

import { useState } from 'react';
import { useRouter } from '@/i18n-config';

interface CheckoutButtonProps {
  priceId: string;
  mode: 'payment' | 'subscription';
  children: React.ReactNode;
  className?: string;
  /** URL to redirect to if user is not logged in */
  loginUrl?: string;
}

export function CheckoutButton({
  priceId,
  mode,
  children,
  className = '',
  loginUrl = '/login',
}: CheckoutButtonProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId, mode }),
      });

      const data = await res.json();

      if (res.status === 401) {
        // Not logged in — redirect to login
        router.push(loginUrl as any);
        return;
      }

      if (data.url) {
        window.location.href = data.url;
      } else {
        console.error('No checkout URL returned:', data);
      }
    } catch (err) {
      console.error('Checkout error:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={`${className} ${loading ? 'opacity-50 cursor-wait' : ''}`}
    >
      {loading ? (
        <span className="inline-flex items-center gap-2">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>Przetwarzanie...</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
}
