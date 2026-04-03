'use client';

// ---------------------------------------------------------------------------
// ImportRecording — admin UI for uploading audio files and assigning to users
//
// Flow:
// 1. Admin fills form: file, session type, date, user email(s)
// 2. POST /api/admin/import-recording → creates Bunny video + DB records
// 3. Browser uploads directly to Bunny via TUS protocol (no server proxy)
// 4. Cron auto-polls Bunny status → marks "ready" when processing done
// ---------------------------------------------------------------------------

import { useState, useRef, useCallback } from 'react';
import { Upload, X, Plus, Loader2, CheckCircle, AlertCircle, FileAudio } from 'lucide-react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SESSION_TYPES = [
  { value: 'natalia_solo', label: 'Sesja 1:1 z Natalią' },
  { value: 'natalia_agata', label: 'Natalia + Agata' },
  { value: 'natalia_justyna', label: 'Natalia + Justyna' },
  { value: 'natalia_para', label: 'Sesja dla par' },
  { value: 'natalia_asysta', label: 'Sesja z Asystą' },
  { value: 'pre_session', label: 'Pre-sesja' },
] as const;

type UploadState = 'idle' | 'preparing' | 'uploading' | 'processing' | 'done' | 'error';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ImportRecording({ onDone }: { onDone?: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [sessionType, setSessionType] = useState('natalia_solo');
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().slice(0, 10));
  const [emails, setEmails] = useState<string[]>(['']);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [successInfo, setSuccessInfo] = useState('');

  const abortRef = useRef<XMLHttpRequest | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // -------------------------------------------------------------------------
  // Email list management
  // -------------------------------------------------------------------------
  const addEmail = useCallback(() => setEmails(prev => [...prev, '']), []);

  const updateEmail = useCallback((index: number, value: string) => {
    setEmails(prev => prev.map((e, i) => i === index ? value : e));
  }, []);

  const removeEmail = useCallback((index: number) => {
    setEmails(prev => prev.filter((_, i) => i !== index));
  }, []);

  // -------------------------------------------------------------------------
  // File selection
  // -------------------------------------------------------------------------
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  }, []);

  // -------------------------------------------------------------------------
  // Reset
  // -------------------------------------------------------------------------
  const reset = useCallback(() => {
    setUploadState('idle');
    setProgress(0);
    setErrorMessage('');
    setSuccessInfo('');
    setFile(null);
    setEmails(['']);
    setTitle('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  // -------------------------------------------------------------------------
  // TUS upload to Bunny Stream
  // -------------------------------------------------------------------------
  async function tusUpload(
    file: File,
    config: {
      tusEndpoint: string;
      videoId: string;
      libraryId: string;
      authSignature: string;
      authExpire: number;
    },
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // Step 1: TUS POST to create upload
      const createXhr = new XMLHttpRequest();
      createXhr.open('POST', config.tusEndpoint, true);
      createXhr.setRequestHeader('Tus-Resumable', '1.0.0');
      createXhr.setRequestHeader('Upload-Length', file.size.toString());
      const safeType = btoa(file.type || 'application/octet-stream');
      const safeTitle = btoa(unescape(encodeURIComponent(file.name)));
      createXhr.setRequestHeader('Upload-Metadata',
        `filetype ${safeType},title ${safeTitle}`);
      createXhr.setRequestHeader('AuthorizationSignature', config.authSignature);
      createXhr.setRequestHeader('AuthorizationExpire', config.authExpire.toString());
      createXhr.setRequestHeader('VideoId', config.videoId);
      createXhr.setRequestHeader('LibraryId', config.libraryId);

      createXhr.onload = () => {
        if (createXhr.status !== 201 && createXhr.status !== 200) {
          reject(new Error(`TUS create failed: ${createXhr.status} ${createXhr.responseText}`));
          return;
        }

        const uploadUrl = createXhr.getResponseHeader('Location');
        if (!uploadUrl) {
          reject(new Error('TUS create did not return Location header'));
          return;
        }

        // Step 2: TUS PATCH to upload file data
        const patchXhr = new XMLHttpRequest();
        abortRef.current = patchXhr;

        patchXhr.open('PATCH', uploadUrl, true);
        patchXhr.setRequestHeader('Tus-Resumable', '1.0.0');
        patchXhr.setRequestHeader('Upload-Offset', '0');
        patchXhr.setRequestHeader('Content-Type', 'application/offset+octet-stream');

        patchXhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setProgress(Math.round((e.loaded / e.total) * 100));
          }
        };

        patchXhr.onload = () => {
          abortRef.current = null;
          if (patchXhr.status >= 200 && patchXhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`TUS upload failed: ${patchXhr.status}`));
          }
        };

        patchXhr.onerror = () => {
          abortRef.current = null;
          reject(new Error('Network error during upload'));
        };

        patchXhr.onabort = () => {
          abortRef.current = null;
          reject(new Error('Upload cancelled'));
        };

        patchXhr.send(file);
      };

      createXhr.onerror = () => {
        reject(new Error('Network error creating TUS upload'));
      };

      createXhr.send(null);
    });
  }

  // -------------------------------------------------------------------------
  // Submit handler
  // -------------------------------------------------------------------------
  const handleSubmit = useCallback(async () => {
    if (!file) return;

    const validEmails = emails.map(e => e.trim().toLowerCase()).filter(Boolean);
    if (validEmails.length === 0) {
      setErrorMessage('Podaj przynajmniej jeden email użytkownika');
      return;
    }

    setUploadState('preparing');
    setErrorMessage('');
    setProgress(0);

    try {
      // Step 1: Create recording + get TUS config
      const res = await fetch('/api/admin/import-recording', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionType,
          sessionDate,
          userEmails: validEmails,
          title: title.trim() || undefined,
          fileSize: file.size,
          fileName: file.name,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Błąd tworzenia nagrania');
      }

      // Step 2: Upload file via TUS
      setUploadState('uploading');

      await tusUpload(file, {
        tusEndpoint: data.tusEndpoint,
        videoId: data.videoId,
        libraryId: data.libraryId,
        authSignature: data.authSignature,
        authExpire: data.authExpire,
      });

      // Step 3: Done — cron will poll Bunny for processing status
      setUploadState('done');
      const userNames = data.resolvedUsers
        .map((u: { displayName: string | null; email: string }) => u.displayName || u.email)
        .join(', ');
      setSuccessInfo(`Nagranie przesłane. Przydzielono: ${userNames}. Bunny przetworzy plik w ciągu kilku minut.`);

      // Refresh parent after short delay
      if (onDone) setTimeout(onDone, 2000);
    } catch (err) {
      setUploadState('error');
      setErrorMessage(err instanceof Error ? err.message : 'Nieznany błąd');
    }
  }, [file, emails, sessionType, sessionDate, title, onDone]);

  // -------------------------------------------------------------------------
  // Cancel upload
  // -------------------------------------------------------------------------
  const handleCancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    reset();
  }, [reset]);

  // -------------------------------------------------------------------------
  // File size display
  // -------------------------------------------------------------------------
  function formatFileSize(bytes: number): string {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 bg-htg-sage text-white px-4 py-2.5 rounded-lg text-sm font-medium
                   hover:bg-htg-sage/90 transition-colors"
      >
        <Upload className="w-4 h-4" />
        Importuj nagranie
      </button>
    );
  }

  const isUploading = uploadState === 'preparing' || uploadState === 'uploading';
  const isDone = uploadState === 'done';

  return (
    <div className="bg-htg-card border border-htg-card-border rounded-xl p-6 mb-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-base font-serif font-bold text-htg-fg flex items-center gap-2">
          <Upload className="w-5 h-5 text-htg-sage" />
          Import nagrania sesji
        </h2>
        <button
          onClick={() => { reset(); setIsOpen(false); }}
          className="p-1.5 rounded-lg hover:bg-htg-surface text-htg-fg-muted hover:text-htg-fg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Success */}
      {isDone && (
        <div className="flex items-start gap-3 bg-green-500/10 border border-green-500/20 rounded-xl p-4 mb-4">
          <CheckCircle className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-green-300 font-medium">Sukces!</p>
            <p className="text-xs text-green-400/80 mt-1">{successInfo}</p>
          </div>
        </div>
      )}

      {/* Error */}
      {uploadState === 'error' && (
        <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-4">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-red-300 font-medium">Błąd</p>
            <p className="text-xs text-red-400/80 mt-1">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* Progress */}
      {isUploading && (
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            <Loader2 className="w-4 h-4 animate-spin text-htg-sage" />
            <span className="text-sm text-htg-fg">
              {uploadState === 'preparing' ? 'Przygotowywanie...' : `Wysyłanie: ${progress}%`}
            </span>
          </div>
          <div className="h-2 bg-htg-surface rounded-full overflow-hidden">
            <div
              className="h-full bg-htg-sage transition-[width] duration-300 rounded-full"
              style={{ width: `${uploadState === 'preparing' ? 5 : progress}%` }}
            />
          </div>
          <button
            onClick={handleCancel}
            className="mt-2 text-xs text-red-400 hover:text-red-300 transition-colors"
          >
            Anuluj
          </button>
        </div>
      )}

      {/* Form */}
      {!isDone && !isUploading && (
        <div className="space-y-4">
          {/* File */}
          <div>
            <label className="block text-xs font-medium text-htg-fg-muted mb-1.5">
              Plik audio *
            </label>
            <div className="relative">
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.webm"
                onChange={handleFileSelect}
                className="hidden"
                id="import-file"
              />
              <label
                htmlFor="import-file"
                className="flex items-center gap-3 bg-htg-surface border border-htg-card-border rounded-lg
                           px-4 py-3 cursor-pointer hover:border-htg-sage/50 transition-colors"
              >
                <FileAudio className="w-5 h-5 text-htg-fg-muted shrink-0" />
                {file ? (
                  <div className="min-w-0">
                    <p className="text-sm text-htg-fg truncate">{file.name}</p>
                    <p className="text-xs text-htg-fg-muted">{formatFileSize(file.size)}</p>
                  </div>
                ) : (
                  <span className="text-sm text-htg-fg-muted">Wybierz plik audio...</span>
                )}
              </label>
            </div>
          </div>

          {/* Session type + date row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-htg-fg-muted mb-1.5">
                Typ sesji *
              </label>
              <select
                value={sessionType}
                onChange={(e) => setSessionType(e.target.value)}
                className="w-full bg-htg-surface border border-htg-card-border rounded-lg px-3 py-2.5 text-sm text-htg-fg"
              >
                {SESSION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-htg-fg-muted mb-1.5">
                Data sesji *
              </label>
              <input
                type="date"
                value={sessionDate}
                onChange={(e) => setSessionDate(e.target.value)}
                className="w-full bg-htg-surface border border-htg-card-border rounded-lg px-3 py-2.5 text-sm text-htg-fg"
              />
            </div>
          </div>

          {/* User emails */}
          <div>
            <label className="block text-xs font-medium text-htg-fg-muted mb-1.5">
              Email uczestnika/ów *
            </label>
            <div className="space-y-2">
              {emails.map((email, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => updateEmail(i, e.target.value)}
                    placeholder="email@example.com"
                    className="flex-1 bg-htg-surface border border-htg-card-border rounded-lg px-3 py-2 text-sm text-htg-fg
                               placeholder:text-htg-fg-muted/50"
                  />
                  {emails.length > 1 && (
                    <button
                      onClick={() => removeEmail(i)}
                      className="p-2 rounded-lg hover:bg-htg-surface text-htg-fg-muted hover:text-red-400 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={addEmail}
              className="mt-2 flex items-center gap-1 text-xs text-htg-sage hover:text-htg-sage/80 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Dodaj uczestnika (sesja dla par)
            </button>
          </div>

          {/* Title (optional) */}
          <div>
            <label className="block text-xs font-medium text-htg-fg-muted mb-1.5">
              Tytuł (opcjonalnie)
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="np. Sesja z Natalią — 15.03.2026"
              className="w-full bg-htg-surface border border-htg-card-border rounded-lg px-3 py-2 text-sm text-htg-fg
                         placeholder:text-htg-fg-muted/50"
            />
          </div>

          {/* Error inline */}
          {errorMessage && uploadState !== 'error' && (
            <p className="text-xs text-red-400">{errorMessage}</p>
          )}

          {/* Submit */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleSubmit}
              disabled={!file || !sessionDate || !emails.some(e => e.trim())}
              className="flex items-center gap-2 bg-htg-sage text-white px-5 py-2.5 rounded-lg text-sm font-medium
                         hover:bg-htg-sage/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Upload className="w-4 h-4" />
              Importuj nagranie
            </button>
            <button
              onClick={() => { reset(); setIsOpen(false); }}
              className="px-4 py-2.5 rounded-lg text-sm text-htg-fg-muted hover:text-htg-fg
                         hover:bg-htg-surface transition-colors"
            >
              Anuluj
            </button>
          </div>
        </div>
      )}

      {/* Done — new import button */}
      {isDone && (
        <div className="flex gap-3">
          <button
            onClick={reset}
            className="flex items-center gap-2 bg-htg-sage text-white px-4 py-2.5 rounded-lg text-sm font-medium
                       hover:bg-htg-sage/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Kolejne nagranie
          </button>
          <button
            onClick={() => { reset(); setIsOpen(false); }}
            className="px-4 py-2.5 rounded-lg text-sm text-htg-fg-muted hover:text-htg-fg
                       hover:bg-htg-surface transition-colors"
          >
            Zamknij
          </button>
        </div>
      )}
    </div>
  );
}
