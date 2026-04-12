'use client';

import { useState, useEffect, useCallback } from 'react';
import { useLocale } from 'next-intl';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import { KeyRound, Plus, Trash2, Loader2, Smartphone } from 'lucide-react';
import { formatDateTime } from '@/lib/format';

interface PasskeyCredential {
  id: string;
  credential_id: string;
  friendly_name: string | null;
  device_type: string;
  created_at: string;
  last_used_at: string | null;
}

interface PasskeySectionProps {
  labels: {
    title: string;
    add: string;
    remove: string;
    noPasskeys: string;
    namePrompt: string;
    namePlaceholder: string;
    added: string;
    lastUsed: string;
    never: string;
    confirm_remove: string;
    success_added: string;
    success_removed: string;
    error_generic: string;
    not_supported: string;
  };
}

export function PasskeySection({ labels }: PasskeySectionProps) {
  const locale = useLocale();
  const [passkeys, setPasskeys] = useState<PasskeyCredential[]>([]);
  const [supported, setSupported] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showNameInput, setShowNameInput] = useState(false);
  const [friendlyName, setFriendlyName] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const supabase = createSupabaseBrowser();

  const loadPasskeys = useCallback(async () => {
    const { data } = await supabase
      .from('passkey_credentials')
      .select('id, credential_id, friendly_name, device_type, created_at, last_used_at')
      .order('created_at', { ascending: false });
    setPasskeys(data ?? []);
  }, [supabase]);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.PublicKeyCredential && window.isSecureContext) {
      setSupported(true);
      loadPasskeys();
    }
  }, [loadPasskeys]);

  if (!supported) return null;

  async function handleRegister() {
    setLoading(true);
    setMessage(null);

    try {
      const { startRegistration } = await import('@simplewebauthn/browser');

      const optionsRes = await fetch('/api/auth/passkey/register-options');
      if (!optionsRes.ok) throw new Error('Failed to get options');
      const options = await optionsRes.json();

      const attResponse = await startRegistration({ optionsJSON: options });

      const verifyRes = await fetch('/api/auth/passkey/register-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          response: attResponse,
          friendlyName: friendlyName.trim() || null,
        }),
      });

      if (!verifyRes.ok) {
        const err = await verifyRes.json();
        throw new Error(err.error || 'Registration failed');
      }

      setMessage({ type: 'success', text: labels.success_added });
      setShowNameInput(false);
      setFriendlyName('');
      await loadPasskeys();
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        // User cancelled — silent
      } else {
        setMessage({ type: 'error', text: labels.error_generic });
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleRemove(id: string) {
    if (!confirm(labels.confirm_remove)) return;

    const { error } = await supabase
      .from('passkey_credentials')
      .delete()
      .eq('id', id);

    if (!error) {
      setMessage({ type: 'success', text: labels.success_removed });
      await loadPasskeys();
    } else {
      setMessage({ type: 'error', text: labels.error_generic });
    }
  }

  function fmtDate(dateStr: string | null) {
    if (!dateStr) return labels.never;
    return formatDateTime(dateStr, locale);
  }

  return (
    <div className="border-t border-htg-card-border pt-6">
      <h3 className="text-lg font-semibold text-htg-fg mb-4 flex items-center gap-2">
        <KeyRound className="w-5 h-5" />
        {labels.title}
      </h3>

      {message && (
        <div className={`text-sm px-4 py-2 rounded-lg mb-4 ${
          message.type === 'success'
            ? 'text-green-700 bg-green-50 dark:text-green-400 dark:bg-green-900/20'
            : 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-900/20'
        }`}>
          {message.text}
        </div>
      )}

      {passkeys.length === 0 ? (
        <p className="text-sm text-htg-fg-muted mb-4">{labels.noPasskeys}</p>
      ) : (
        <div className="space-y-3 mb-4">
          {passkeys.map((pk) => (
            <div
              key={pk.id}
              className="flex items-center justify-between bg-htg-surface rounded-lg p-3"
            >
              <div className="flex items-center gap-3">
                <Smartphone className="w-5 h-5 text-htg-fg-muted shrink-0" />
                <div>
                  <p className="text-sm font-medium text-htg-fg">
                    {pk.friendly_name || `Klucz ${pk.credential_id.slice(0, 8)}...`}
                  </p>
                  <p className="text-xs text-htg-fg-muted">
                    {labels.added}: {fmtDate(pk.created_at)}
                    {pk.last_used_at && ` · ${labels.lastUsed}: ${fmtDate(pk.last_used_at)}`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleRemove(pk.id)}
                className="text-red-500 hover:text-red-600 p-1"
                title={labels.remove}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {showNameInput ? (
        <div className="flex gap-2">
          <input
            type="text"
            value={friendlyName}
            onChange={(e) => setFriendlyName(e.target.value)}
            placeholder={labels.namePlaceholder}
            className="flex-1 px-3 py-2 rounded-lg border border-htg-card-border bg-htg-bg text-htg-fg text-sm"
            autoFocus
          />
          <button
            onClick={handleRegister}
            disabled={loading}
            className="bg-htg-sage text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-htg-sage-dark transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
            {labels.add}
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowNameInput(true)}
          disabled={loading}
          className="text-htg-sage hover:text-htg-sage-dark text-sm font-medium flex items-center gap-2 transition-colors"
        >
          <Plus className="w-4 h-4" />
          {labels.add}
        </button>
      )}
    </div>
  );
}
