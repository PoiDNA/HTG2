'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { useRouter } from '@/i18n-config';
import { createSupabaseBrowser } from '@/lib/supabase/client';
import { LogOut, KeyRound, Plus, Trash2, Loader2, Smartphone, X } from 'lucide-react';

interface PlanerHeaderProps {
  userEmail: string;
  locale: string;
}

interface PasskeyCredential {
  id: string;
  credential_id: string;
  friendly_name: string | null;
  device_type: string;
  created_at: string;
  last_used_at: string | null;
}

function PasskeyModal({ onClose }: { onClose: () => void }) {
  const supabase = createSupabaseBrowser();
  const [passkeys, setPasskeys] = useState<PasskeyCredential[]>([]);
  const [supported, setSupported] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showNameInput, setShowNameInput] = useState(false);
  const [friendlyName, setFriendlyName] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('passkey_credentials')
      .select('id, credential_id, friendly_name, device_type, created_at, last_used_at')
      .order('created_at', { ascending: false });
    setPasskeys(data ?? []);
  }, [supabase]);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.PublicKeyCredential && window.isSecureContext) {
      setSupported(true);
      load();
    }
  }, [load]);

  function fmtDate(d: string | null) {
    if (!d) return 'nigdy';
    return new Date(d).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  async function handleRegister() {
    setLoading(true);
    setMsg(null);
    try {
      const { startRegistration } = await import('@simplewebauthn/browser');
      const optRes = await fetch('/api/auth/passkey/register-options');
      if (!optRes.ok) throw new Error('Nie udało się pobrać opcji');
      const options = await optRes.json();
      const attResponse = await startRegistration({ optionsJSON: options });
      const verRes = await fetch('/api/auth/passkey/register-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: attResponse, friendlyName: friendlyName.trim() || null }),
      });
      if (!verRes.ok) {
        const e = await verRes.json();
        throw new Error(e.error || 'Rejestracja nieudana');
      }
      setMsg({ ok: true, text: 'Passkey dodany' });
      setShowNameInput(false);
      setFriendlyName('');
      await load();
    } catch (err: any) {
      if (err.name !== 'NotAllowedError') setMsg({ ok: false, text: 'Błąd: ' + err.message });
    } finally {
      setLoading(false);
    }
  }

  async function handleRemove(id: string) {
    if (!confirm('Usunąć ten passkey?')) return;
    const { error } = await supabase.from('passkey_credentials').delete().eq('id', id);
    if (error) setMsg({ ok: false, text: 'Błąd usuwania' });
    else { setMsg({ ok: true, text: 'Passkey usunięty' }); await load(); }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 pt-20 px-4">
      <div className="bg-htg-card border border-htg-card-border rounded-xl p-6 w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif font-bold text-lg flex items-center gap-2">
            <KeyRound className="w-5 h-5" /> Passkeys
          </h2>
          <button onClick={onClose} className="text-htg-fg-muted hover:text-htg-fg"><X className="w-5 h-5" /></button>
        </div>

        {msg && (
          <div className={`text-sm px-3 py-2 rounded mb-3 ${msg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {msg.text}
          </div>
        )}

        {!supported && (
          <p className="text-sm text-htg-fg-muted">Twoja przeglądarka nie obsługuje passkeys.</p>
        )}

        {supported && (
          <>
            {passkeys.length === 0 ? (
              <p className="text-sm text-htg-fg-muted mb-4">Brak zapisanych passkeys.</p>
            ) : (
              <div className="space-y-2 mb-4">
                {passkeys.map(pk => (
                  <div key={pk.id} className="flex items-center justify-between bg-htg-surface rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Smartphone className="w-4 h-4 text-htg-fg-muted shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-htg-fg">
                          {pk.friendly_name || `Klucz ${pk.credential_id.slice(0, 8)}…`}
                        </p>
                        <p className="text-xs text-htg-fg-muted">
                          Dodany: {fmtDate(pk.created_at)}
                          {pk.last_used_at && ` · Użyty: ${fmtDate(pk.last_used_at)}`}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemove(pk.id)}
                      className="text-red-500 hover:text-red-600 p-1"
                      title="Usuń"
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
                  onChange={e => setFriendlyName(e.target.value)}
                  placeholder="Np. MacBook Touch ID"
                  className="flex-1 px-3 py-1.5 rounded border border-htg-card-border bg-white text-htg-fg text-sm"
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleRegister()}
                />
                <button
                  onClick={handleRegister}
                  disabled={loading}
                  className="bg-htg-sage text-white px-3 py-1.5 rounded text-sm font-medium flex items-center gap-1 disabled:opacity-50"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                  Dodaj
                </button>
                <button
                  onClick={() => { setShowNameInput(false); setFriendlyName(''); }}
                  className="px-2 py-1.5 rounded border border-htg-card-border text-sm"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowNameInput(true)}
                className="text-htg-sage hover:text-htg-sage/80 text-sm font-medium flex items-center gap-1"
              >
                <Plus className="w-4 h-4" /> Dodaj passkey
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function PlanerHeader({ userEmail, locale }: PlanerHeaderProps) {
  const router = useRouter();
  const [showPasskeys, setShowPasskeys] = useState(false);

  async function handleLogout() {
    const supabase = createSupabaseBrowser();
    await supabase.auth.signOut();
    router.push('/login');
  }

  return (
    <>
      <header className="flex items-center justify-between mb-8 pb-4 border-b border-htg-card-border">
        <a href={`/${locale}/konto/admin/sesje`} className="flex items-center gap-2 text-htg-fg hover:text-htg-sage transition-colors">
          <Image src="/icon.png" alt="HTG" width={32} height={32} className="rounded-full" />
          <span className="text-lg font-serif font-bold">Panel sesji</span>
        </a>
        <div className="flex items-center gap-2">
          <span className="text-sm text-htg-fg-muted hidden sm:block mr-2">{userEmail}</span>
          <button
            onClick={() => setShowPasskeys(true)}
            className="p-2 rounded-lg text-htg-fg-muted hover:text-htg-sage hover:bg-htg-surface transition-colors"
            title="Passkeys"
          >
            <KeyRound className="w-5 h-5" />
          </button>
          <button
            onClick={handleLogout}
            className="p-2 rounded-lg text-htg-fg-muted hover:text-red-500 hover:bg-htg-surface transition-colors"
            title="Wyloguj"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>
      {showPasskeys && <PasskeyModal onClose={() => setShowPasskeys(false)} />}
    </>
  );
}
