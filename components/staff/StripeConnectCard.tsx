'use client';

import { useState, useEffect } from 'react';
import { CreditCard, ExternalLink, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

export default function StripeConnectCard() {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetch('/api/stripe/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'status' }),
    })
      .then(r => r.json())
      .then(setStatus)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate() {
    setActionLoading(true);
    const res = await fetch('/api/stripe/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create' }),
    });
    const data = await res.json();
    if (data.onboardingUrl) {
      window.location.href = data.onboardingUrl;
    }
    setActionLoading(false);
  }

  async function handleOnboard() {
    setActionLoading(true);
    const res = await fetch('/api/stripe/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'onboard' }),
    });
    const data = await res.json();
    if (data.onboardingUrl) {
      window.location.href = data.onboardingUrl;
    }
    setActionLoading(false);
  }

  async function handleDashboard() {
    setActionLoading(true);
    const res = await fetch('/api/stripe/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'dashboard' }),
    });
    const data = await res.json();
    if (data.dashboardUrl) {
      window.open(data.dashboardUrl, '_blank');
    }
    setActionLoading(false);
  }

  if (loading) {
    return (
      <div className="bg-htg-card border border-htg-card-border rounded-xl p-6">
        <Loader2 className="w-5 h-5 animate-spin text-htg-fg-muted" />
      </div>
    );
  }

  return (
    <div className="bg-htg-card border border-htg-card-border rounded-xl p-6 space-y-4">
      <div className="flex items-center gap-3">
        <CreditCard className="w-5 h-5 text-htg-indigo" />
        <h3 className="font-serif font-bold text-htg-fg">Konto rozliczeniowe Stripe</h3>
      </div>

      {!status?.hasAccount ? (
        <>
          <p className="text-htg-fg-muted text-sm">
            Połącz swoje konto bankowe, aby otrzymywać wypłaty za sesje.
          </p>
          <button
            onClick={handleCreate}
            disabled={actionLoading}
            className="bg-htg-indigo text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-htg-indigo/90 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
            Połącz konto Stripe
          </button>
        </>
      ) : (
        <>
          {/* Status indicators */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              {status.detailsSubmitted ? (
                <CheckCircle className="w-4 h-4 text-green-400" />
              ) : (
                <AlertCircle className="w-4 h-4 text-yellow-400" />
              )}
              <span className="text-htg-fg">
                {status.detailsSubmitted ? 'Dane uzupełnione' : 'Wymagane uzupełnienie danych'}
              </span>
            </div>

            <div className="flex items-center gap-2 text-sm">
              {status.payoutsEnabled ? (
                <CheckCircle className="w-4 h-4 text-green-400" />
              ) : (
                <AlertCircle className="w-4 h-4 text-yellow-400" />
              )}
              <span className="text-htg-fg">
                {status.payoutsEnabled ? 'Wypłaty aktywne' : 'Wypłaty nieaktywne'}
              </span>
            </div>
          </div>

          <p className="text-xs text-htg-fg-muted">
            ID konta: {status.accountId}
          </p>

          <div className="flex gap-2">
            {!status.detailsSubmitted && (
              <button
                onClick={handleOnboard}
                disabled={actionLoading}
                className="bg-htg-warm text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-htg-warm/90 transition-colors disabled:opacity-50"
              >
                Uzupełnij dane
              </button>
            )}

            {status.detailsSubmitted && (
              <button
                onClick={handleDashboard}
                disabled={actionLoading}
                className="bg-htg-surface text-htg-fg px-4 py-2 rounded-lg text-sm font-medium hover:bg-htg-card-border transition-colors disabled:opacity-50 flex items-center gap-1"
              >
                <ExternalLink className="w-3 h-3" />
                Panel Stripe
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
