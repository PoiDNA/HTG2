'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, FileAudio, X, Loader2, CheckCircle, Link as LinkIcon, Plus } from 'lucide-react';

interface MonthlySet {
  id: string;
  title: string;
}

interface ManualSessionFormProps {
  monthlySets: MonthlySet[];
  labels: {
    title_label: string;
    title_placeholder: string;
    monthly_set: string;
    select_set: string;
    description_label: string;
    description_placeholder: string;
    files_label: string;
    drag_drop: string;
    or_click: string;
    remove: string;
    submit: string;
    submitting: string;
    success: string;
    error: string;
  };
}

const MAX_UPLOAD_MB = 50;

export function ManualSessionForm({ monthlySets, labels }: ManualSessionFormProps) {
  const [title, setTitle] = useState('');
  const [monthlySetId, setMonthlySetId] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  // URL-based tracks for large files already on CDN
  const [urlTracks, setUrlTracks] = useState<{ name: string; url: string }[]>([]);
  const [urlInput, setUrlInput] = useState('');
  const [urlNameInput, setUrlNameInput] = useState('');
  const [inputMode, setInputMode] = useState<'file' | 'url'>('file');
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [uploadProgress, setUploadProgress] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const arr = Array.from(newFiles);
    const large = arr.filter(f => f.size > MAX_UPLOAD_MB * 1024 * 1024);
    if (large.length > 0) {
      alert(`Pliki powyżej ${MAX_UPLOAD_MB} MB nie mogą być przesłane przez przeglądarkę (limit Vercel). Użyj trybu URL — wgraj pliki na Bunny CDN przez FTP i wklej linki.\n\nZa duże pliki:\n${large.map(f => `- ${f.name} (${(f.size / 1024 / 1024).toFixed(0)} MB)`).join('\n')}`);
      const ok = arr.filter(f => f.size <= MAX_UPLOAD_MB * 1024 * 1024);
      if (ok.length > 0) setFiles(prev => [...prev, ...ok]);
    } else {
      setFiles(prev => [...prev, ...arr]);
    }
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const addUrlTrack = useCallback(() => {
    if (!urlInput.trim()) return;
    const name = urlNameInput.trim() || urlInput.split('/').pop() || 'track.wav';
    setUrlTracks(prev => [...prev, { name, url: urlInput.trim() }]);
    setUrlInput('');
    setUrlNameInput('');
  }, [urlInput, urlNameInput]);

  const removeUrlTrack = useCallback((index: number) => {
    setUrlTracks(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setStatus('submitting');
    setErrorMessage('');
    setUploadProgress('');

    try {
      // 1) Create session
      const createRes = await fetch('/api/publikacja/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          monthly_set_id: monthlySetId || null,
          description: description.trim() || null,
        }),
      });

      if (!createRes.ok) {
        const data = await createRes.json();
        throw new Error(data.error || 'Failed to create session');
      }

      const { publication } = await createRes.json();
      const uploadedTracks: { name: string; url: string; size: number }[] = [];

      // 2a) Upload small files
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadProgress(`Przesyłanie ${i + 1}/${files.length}: ${file.name}…`);

        const formData = new FormData();
        formData.append('file', file);
        formData.append('publicationId', publication.id);
        formData.append('type', 'source');
        formData.append('fileName', file.name);

        const uploadRes = await fetch('/api/publikacja/upload', {
          method: 'POST',
          body: formData,
        });

        if (!uploadRes.ok) {
          const data = await uploadRes.json();
          throw new Error(data.error || `Upload failed: ${file.name}`);
        }

        const data = await uploadRes.json();
        uploadedTracks.push({ name: file.name, url: data.cdnUrl, size: file.size });
      }

      // 2b) Register URL tracks (already on CDN)
      for (const track of urlTracks) {
        uploadedTracks.push({ name: track.name, url: track.url, size: 0 });
      }

      // 3) Update publication with track info
      if (uploadedTracks.length > 0) {
        await fetch(`/api/publikacja/sessions/${publication.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source_tracks: uploadedTracks }),
        });
      }

      setStatus('success');
      setTitle('');
      setMonthlySetId('');
      setDescription('');
      setFiles([]);
      setUrlTracks([]);
      setUploadProgress('');
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Unknown error');
      setUploadProgress('');
    }
  };

  const hasTracks = files.length > 0 || urlTracks.length > 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {/* Title */}
      <div>
        <label className="block text-sm font-medium text-htg-fg mb-1.5">{labels.title_label}</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={labels.title_placeholder}
          required
          className="w-full px-4 py-2.5 rounded-lg border border-htg-card-border bg-htg-card text-htg-fg text-sm focus:outline-none focus:ring-2 focus:ring-htg-sage"
        />
      </div>

      {/* Monthly set */}
      <div>
        <label className="block text-sm font-medium text-htg-fg mb-1.5">{labels.monthly_set}</label>
        <select
          value={monthlySetId}
          onChange={(e) => setMonthlySetId(e.target.value)}
          className="w-full px-4 py-2.5 rounded-lg border border-htg-card-border bg-htg-card text-htg-fg text-sm focus:outline-none focus:ring-2 focus:ring-htg-sage"
        >
          <option value="">{labels.select_set}</option>
          {monthlySets.map((set) => (
            <option key={set.id} value={set.id}>
              {set.title}
            </option>
          ))}
        </select>
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-htg-fg mb-1.5">{labels.description_label}</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={labels.description_placeholder}
          rows={3}
          className="w-full px-4 py-2.5 rounded-lg border border-htg-card-border bg-htg-card text-htg-fg text-sm focus:outline-none focus:ring-2 focus:ring-htg-sage resize-none"
        />
      </div>

      {/* Track input — mode toggle */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm font-medium text-htg-fg">{labels.files_label}</label>
          <div className="flex rounded-lg border border-htg-card-border overflow-hidden text-xs font-medium">
            <button
              type="button"
              onClick={() => setInputMode('file')}
              className={`px-3 py-1.5 flex items-center gap-1.5 transition-colors ${inputMode === 'file' ? 'bg-htg-sage text-white' : 'bg-htg-surface text-htg-fg-muted hover:text-htg-fg'}`}
            >
              <Upload className="w-3 h-3" />
              Prześlij plik
            </button>
            <button
              type="button"
              onClick={() => setInputMode('url')}
              className={`px-3 py-1.5 flex items-center gap-1.5 transition-colors ${inputMode === 'url' ? 'bg-htg-sage text-white' : 'bg-htg-surface text-htg-fg-muted hover:text-htg-fg'}`}
            >
              <LinkIcon className="w-3 h-3" />
              URL (duże pliki)
            </button>
          </div>
        </div>

        {inputMode === 'file' ? (
          <>
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); addFiles(e.dataTransfer.files); }}
              onClick={() => inputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                isDragging ? 'border-htg-sage bg-htg-sage/5' : 'border-htg-card-border hover:border-htg-sage/50'
              }`}
            >
              <Upload className="w-6 h-6 text-htg-fg-muted mx-auto mb-2" />
              <p className="text-sm text-htg-fg">{labels.drag_drop}</p>
              <p className="text-xs text-htg-fg-muted mt-1">{labels.or_click}</p>
              <p className="text-xs text-htg-fg-muted mt-1">Maks. {MAX_UPLOAD_MB} MB na plik</p>
              <input
                ref={inputRef}
                type="file"
                accept=".wav,audio/wav,audio/x-wav"
                multiple
                onChange={(e) => e.target.files && addFiles(e.target.files)}
                className="hidden"
              />
            </div>
            {files.length > 0 && (
              <div className="mt-3 space-y-2">
                {files.map((file, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 px-4 py-2 bg-htg-surface rounded-lg">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileAudio className="w-4 h-4 text-htg-fg-muted shrink-0" />
                      <span className="text-sm text-htg-fg truncate">{file.name}</span>
                      <span className="text-xs text-htg-fg-muted">({(file.size / (1024 * 1024)).toFixed(1)} MB)</span>
                    </div>
                    <button type="button" onClick={() => removeFile(i)} className="p-1 text-htg-fg-muted hover:text-htg-fg">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="bg-htg-surface border border-htg-card-border rounded-xl p-4 space-y-3">
              <p className="text-xs text-htg-fg-muted">
                Wgraj plik na Bunny CDN przez FTP (<code className="text-htg-sage">storage.bunnycdn.com</code> → strefa <code className="text-htg-sage">htg-storage</code>), a następnie wklej URL CDN poniżej.
              </p>
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  value={urlNameInput}
                  onChange={(e) => setUrlNameInput(e.target.value)}
                  placeholder="Nazwa ścieżki (np. Natalia.wav)"
                  className="w-full px-3 py-2 rounded-lg border border-htg-card-border bg-htg-card text-htg-fg text-sm focus:outline-none focus:border-htg-sage"
                />
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://htg2-cdn.b-cdn.net/..."
                    className="flex-1 px-3 py-2 rounded-lg border border-htg-card-border bg-htg-card text-htg-fg text-sm focus:outline-none focus:border-htg-sage"
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addUrlTrack())}
                  />
                  <button
                    type="button"
                    onClick={addUrlTrack}
                    disabled={!urlInput.trim()}
                    className="px-3 py-2 bg-htg-sage text-white rounded-lg text-sm hover:bg-htg-sage/90 disabled:opacity-40 transition-colors flex items-center gap-1"
                  >
                    <Plus className="w-4 h-4" />
                    Dodaj
                  </button>
                </div>
              </div>
            </div>
            {urlTracks.length > 0 && (
              <div className="mt-3 space-y-2">
                {urlTracks.map((track, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 px-4 py-2 bg-htg-surface rounded-lg">
                    <div className="flex items-center gap-2 min-w-0">
                      <LinkIcon className="w-4 h-4 text-htg-sage shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm text-htg-fg truncate">{track.name}</p>
                        <p className="text-xs text-htg-fg-muted truncate">{track.url}</p>
                      </div>
                    </div>
                    <button type="button" onClick={() => removeUrlTrack(i)} className="p-1 text-htg-fg-muted hover:text-htg-fg shrink-0">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={status === 'submitting' || !title.trim()}
        className="px-6 py-2.5 bg-htg-sage text-white text-sm font-medium rounded-lg hover:bg-htg-sage/90 disabled:opacity-50 transition-colors"
      >
        {status === 'submitting' ? (
          <span className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            {uploadProgress || labels.submitting}
          </span>
        ) : (
          labels.submit
        )}
      </button>

      {!hasTracks && status === 'idle' && (
        <p className="text-xs text-htg-fg-muted">Możesz dodać sesję bez ścieżek i przesłać je później w widoku szczegółów.</p>
      )}

      {status === 'success' && (
        <div className="flex items-center gap-2 text-sm text-htg-sage">
          <CheckCircle className="w-4 h-4" />
          {labels.success}
        </div>
      )}

      {status === 'error' && (
        <p className="text-sm text-red-500">{labels.error}: {errorMessage}</p>
      )}
    </form>
  );
}
