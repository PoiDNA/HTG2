'use client';

import { useState, useRef } from 'react';

export interface OperatorContract {
  id: string;
  operator_name: string;
  operator_email: string | null;
  cdn_url: string;
  file_name: string;
  signed_by: 'operator' | 'admin' | 'both';
  uploaded_at: string;
}

const SIGNED_BY_LABEL: Record<string, string> = {
  operator: 'podpisana przez Operatora/kę',
  admin: 'podpisana przez Administratora',
  both: 'podpisana przez obie strony',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function ContractsSection({
  initialContracts,
  isAdmin,
}: {
  initialContracts: OperatorContract[];
  isAdmin: boolean;
}) {
  const [contracts, setContracts] = useState(initialContracts);
  const [showForm, setShowForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);

    const file = fd.get('file') as File;
    if (!file || file.size === 0) {
      setError('Wybierz plik PDF.');
      return;
    }

    setUploading(true);
    try {
      const res = await fetch('/api/admin/operator-contracts', {
        method: 'POST',
        body: fd,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Błąd ${res.status}`);
      }
      const newContract: OperatorContract = await res.json();
      setContracts((prev) => [newContract, ...prev]);
      setShowForm(false);
      form.reset();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Nieznany błąd');
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Usunąć ten dokument?')) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/operator-contracts?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setContracts((prev) => prev.filter((c) => c.id !== id));
    } catch {
      alert('Nie udało się usunąć.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="mt-14 border-t border-htg-card-border pt-10">
      <h2 className="text-xl font-serif font-semibold text-htg-fg mb-1">
        Podpisane umowy
      </h2>
      <p className="text-sm text-htg-fg-muted mb-6">
        Poniżej znajdują się zeskanowane egzemplarze podpisanych umów współpracy.
      </p>

      {/* Upload form — admin only */}
      {isAdmin && (
        <div className="mb-8">
          {!showForm ? (
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 text-sm font-medium text-htg-sage border border-htg-sage/40 rounded-lg px-4 py-2 hover:bg-htg-sage/10 transition-colors"
            >
              + Dodaj podpisany dokument
            </button>
          ) : (
            <form
              onSubmit={handleUpload}
              className="bg-htg-card border border-htg-card-border rounded-xl p-5 space-y-4 max-w-lg"
            >
              <p className="text-sm font-semibold text-htg-fg">Nowy podpisany dokument</p>

              <div>
                <label className="block text-xs text-htg-fg-muted mb-1">Imię i nazwisko Operatora/ki *</label>
                <input
                  name="operatorName"
                  required
                  placeholder="np. Anna Kowalska"
                  className="w-full text-sm bg-htg-bg border border-htg-card-border rounded-lg px-3 py-2 text-htg-fg placeholder:text-htg-fg-muted/60 focus:outline-none focus:ring-1 focus:ring-htg-sage"
                />
              </div>

              <div>
                <label className="block text-xs text-htg-fg-muted mb-1">E-mail Operatora/ki (opcjonalnie)</label>
                <input
                  name="operatorEmail"
                  type="email"
                  placeholder="anna@example.com"
                  className="w-full text-sm bg-htg-bg border border-htg-card-border rounded-lg px-3 py-2 text-htg-fg placeholder:text-htg-fg-muted/60 focus:outline-none focus:ring-1 focus:ring-htg-sage"
                />
              </div>

              <div>
                <label className="block text-xs text-htg-fg-muted mb-1">Kto podpisał *</label>
                <select
                  name="signedBy"
                  required
                  defaultValue="both"
                  className="w-full text-sm bg-htg-bg border border-htg-card-border rounded-lg px-3 py-2 text-htg-fg focus:outline-none focus:ring-1 focus:ring-htg-sage"
                >
                  <option value="both">Obie strony</option>
                  <option value="operator">Operator/ka</option>
                  <option value="admin">Administrator Serwisu</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-htg-fg-muted mb-1">Plik PDF *</label>
                <input
                  ref={fileRef}
                  name="file"
                  type="file"
                  accept="application/pdf"
                  required
                  className="w-full text-sm text-htg-fg-muted file:mr-3 file:text-sm file:font-medium file:bg-htg-sage/10 file:text-htg-sage file:border-0 file:rounded-md file:px-3 file:py-1 file:cursor-pointer hover:file:bg-htg-sage/20"
                />
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={uploading}
                  className="text-sm font-medium bg-htg-sage text-white rounded-lg px-4 py-2 hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {uploading ? 'Przesyłam…' : 'Prześlij'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setError(null); }}
                  className="text-sm text-htg-fg-muted hover:text-htg-fg transition-colors"
                >
                  Anuluj
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Contracts list */}
      {contracts.length === 0 ? (
        <p className="text-sm text-htg-fg-muted italic">Brak podpisanych dokumentów.</p>
      ) : (
        <ul className="space-y-3">
          {contracts.map((c) => (
            <li
              key={c.id}
              className="flex items-start justify-between gap-4 bg-htg-card border border-htg-card-border rounded-xl px-5 py-4"
            >
              <div className="flex items-start gap-3 min-w-0">
                {/* PDF icon */}
                <svg className="shrink-0 mt-0.5 text-htg-fg-muted" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-htg-fg truncate">{c.operator_name}</p>
                  <p className="text-xs text-htg-fg-muted mt-0.5">
                    {SIGNED_BY_LABEL[c.signed_by]} · dodano {formatDate(c.uploaded_at)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <a
                  href={c.cdn_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-htg-sage hover:underline"
                >
                  Pobierz PDF
                </a>
                {isAdmin && (
                  <button
                    onClick={() => handleDelete(c.id)}
                    disabled={deletingId === c.id}
                    className="text-xs text-htg-fg-muted hover:text-red-500 disabled:opacity-40 transition-colors"
                    title="Usuń"
                  >
                    {deletingId === c.id ? '…' : '✕'}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
