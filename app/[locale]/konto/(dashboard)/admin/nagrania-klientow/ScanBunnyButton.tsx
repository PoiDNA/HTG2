'use client';

import { useState } from 'react';
import { RefreshCw, CheckCircle2, AlertCircle, Clock, X } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface ScanResult {
  newFiles: Array<{
    sourceUrl: string;
    filename: string;
    folder: string;
    fileSize: number;
    parsedEmail: string | null;
    parsedDate: string | null;
    inferredSessionType: string | null;
  }>;
  skippedCount: number;
  totalScanned: number;
  folders: string[];
}

interface ImportResult {
  imported: Array<{ id: string; sourceUrl: string }>;
  manualReview: Array<{ id: string; sourceUrl: string }>;
  skippedCount: number;
}

type Phase = 'idle' | 'scanning' | 'scanned' | 'importing' | 'done' | 'error';

export default function ScanBunnyButton() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('idle');
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [totals, setTotals] = useState({ imported: 0, manualReview: 0, skipped: 0, errors: 0 });
  const [errorMsg, setErrorMsg] = useState('');

  async function handleScan() {
    setPhase('scanning');
    setErrorMsg('');
    try {
      const res = await fetch('/api/admin/scan-bunny', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Błąd skanowania');
      }
      const data: ScanResult = await res.json();
      setScanResult(data);
      setPhase('scanned');
    } catch (err: any) {
      setErrorMsg(err.message);
      setPhase('error');
    }
  }

  async function handleImport() {
    if (!scanResult) return;
    setPhase('importing');
    const files = scanResult.newFiles;
    const BATCH = 30;
    const totalsAcc = { imported: 0, manualReview: 0, skipped: 0, errors: 0 };
    setProgress({ current: 0, total: files.length });

    for (let i = 0; i < files.length; i += BATCH) {
      const batch = files.slice(i, i + BATCH);
      try {
        const res = await fetch('/api/admin/scan-bunny/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            files: batch.map(f => ({ sourceUrl: f.sourceUrl, fileSize: f.fileSize })),
          }),
        });
        if (!res.ok) {
          totalsAcc.errors += batch.length;
        } else {
          const data: ImportResult = await res.json();
          totalsAcc.imported += data.imported.length;
          totalsAcc.manualReview += data.manualReview.length;
          totalsAcc.skipped += data.skippedCount;
        }
      } catch {
        totalsAcc.errors += batch.length;
      }
      setProgress({ current: Math.min(i + BATCH, files.length), total: files.length });
      setTotals({ ...totalsAcc });
    }

    setTotals(totalsAcc);
    setPhase('done');
  }

  function handleClose() {
    setPhase('idle');
    setScanResult(null);
    setTotals({ imported: 0, manualReview: 0, skipped: 0, errors: 0 });
    router.refresh();
  }

  return (
    <div>
      {phase === 'idle' && (
        <button
          onClick={handleScan}
          className="flex items-center gap-2 px-4 py-2 bg-htg-surface border border-htg-card-border rounded-lg text-sm font-medium text-htg-fg hover:border-htg-sage/40 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Skanuj Bunny
        </button>
      )}

      {phase === 'scanning' && (
        <div className="flex items-center gap-2 px-4 py-2 bg-htg-surface border border-htg-card-border rounded-lg text-sm text-htg-fg-muted">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Skanowanie...
        </div>
      )}

      {phase === 'scanned' && scanResult && (
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-htg-fg">
              Znaleziono <strong className="text-htg-sage">{scanResult.newFiles.length}</strong> nowych plików
              <span className="text-htg-fg-muted"> (pominięto {scanResult.skippedCount} duplikatów)</span>
            </p>
            <button onClick={handleClose} className="text-htg-fg-muted hover:text-htg-fg p-1">
              <X className="w-4 h-4" />
            </button>
          </div>

          {scanResult.newFiles.length > 0 && (
            <>
              <div className="max-h-40 overflow-y-auto text-xs text-htg-fg-muted space-y-1">
                {scanResult.newFiles.slice(0, 20).map(f => (
                  <div key={f.sourceUrl} className="flex items-center gap-2">
                    <span className={f.parsedEmail ? 'text-htg-sage' : 'text-amber-400'}>
                      {f.parsedEmail ? '✓' : '?'}
                    </span>
                    <span className="truncate">{f.filename}</span>
                  </div>
                ))}
                {scanResult.newFiles.length > 20 && (
                  <p className="text-htg-fg-muted">...i {scanResult.newFiles.length - 20} więcej</p>
                )}
              </div>
              <button
                onClick={handleImport}
                className="w-full bg-htg-sage text-white py-2.5 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Importuj {scanResult.newFiles.length} plików
              </button>
            </>
          )}

          {scanResult.newFiles.length === 0 && (
            <p className="text-sm text-htg-fg-muted">Wszystko zsynchronizowane — brak nowych plików.</p>
          )}
        </div>
      )}

      {phase === 'importing' && (
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-4 space-y-3">
          <p className="text-sm text-htg-fg">Importowanie...</p>
          <div className="w-full bg-htg-surface rounded-full h-2">
            <div
              className="bg-htg-sage h-2 rounded-full transition-all"
              style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
            />
          </div>
          <p className="text-xs text-htg-fg-muted">{progress.current} / {progress.total}</p>
        </div>
      )}

      {phase === 'done' && (
        <div className="bg-htg-card border border-htg-card-border rounded-xl p-4 space-y-3">
          <p className="text-sm font-medium text-htg-fg">Import zakończony</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex items-center gap-1.5 text-green-400">
              <CheckCircle2 className="w-3.5 h-3.5" /> Zaimportowano: {totals.imported}
            </div>
            <div className="flex items-center gap-1.5 text-amber-400">
              <Clock className="w-3.5 h-3.5" /> Do przeglądu: {totals.manualReview}
            </div>
            <div className="flex items-center gap-1.5 text-htg-fg-muted">
              Pominięto: {totals.skipped}
            </div>
            {totals.errors > 0 && (
              <div className="flex items-center gap-1.5 text-red-400">
                <AlertCircle className="w-3.5 h-3.5" /> Błędy: {totals.errors}
              </div>
            )}
          </div>
          <button
            onClick={handleClose}
            className="w-full bg-htg-surface text-htg-fg py-2 rounded-lg text-sm font-medium hover:bg-htg-surface/80 transition-colors"
          >
            Zamknij
          </button>
        </div>
      )}

      {phase === 'error' && (
        <div className="bg-htg-card border border-red-500/30 rounded-xl p-4 space-y-2">
          <p className="text-sm text-red-400">{errorMsg}</p>
          <button
            onClick={handleClose}
            className="text-sm text-htg-fg-muted hover:text-htg-fg"
          >
            Zamknij
          </button>
        </div>
      )}
    </div>
  );
}
