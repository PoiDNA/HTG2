'use client';

import { ShoppingCart, X } from 'lucide-react';

interface FloatingCartProps {
  count: number;
  totalPrice: number;
  label: string;
  onCheckout: () => void;
  onClear: () => void;
  loading?: boolean;
}

export default function FloatingCart({ count, totalPrice, label, onCheckout, onClear, loading }: FloatingCartProps) {
  if (count === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-htg-card/95 backdrop-blur-md border-t border-htg-card-border shadow-2xl">
      <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <ShoppingCart className="w-5 h-5 text-htg-sage" />
          <span className="text-htg-fg font-medium">
            {count} {label}
          </span>
          <button onClick={onClear} className="text-htg-fg-muted hover:text-red-400 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xl font-bold text-htg-fg">{totalPrice} PLN</span>
          <button
            onClick={onCheckout}
            disabled={loading}
            className="bg-htg-sage text-white px-6 py-3 rounded-lg font-medium hover:bg-htg-sage-dark transition-colors disabled:opacity-50"
          >
            {loading ? 'Przetwarzanie...' : 'Przejdź do płatności'}
          </button>
        </div>
      </div>
    </div>
  );
}
