'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, FileAudio, X, Loader2, CheckCircle } from 'lucide-react';

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

export function ManualSessionForm({ monthlySets, labels }: ManualSessionFormProps) {
  const [title, setTitle] = useState('');
  const [monthlySetId, setMonthlySetId] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    setFiles((prev) => [...prev, ...Array.from(newFiles)]);
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setStatus('submitting');
    setErrorMessage('');

    try {
      // 1) Upload files first
      const uploadedTracks: { name: string; url: string; size: number }[] = [];

      // Create session first to get publicationId
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

      // 2) Upload each file
      for (const file of files) {
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
          throw new Error(data.error || 'Upload failed');
        }

        const data = await uploadRes.json();
        uploadedTracks.push({ name: file.name, url: data.cdnUrl, size: file.size });
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
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Unknown error');
    }
  };

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

      {/* File upload */}
      <div>
        <label className="block text-sm font-medium text-htg-fg mb-1.5">{labels.files_label}</label>
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
            {labels.submitting}
          </span>
        ) : (
          labels.submit
        )}
      </button>

      {status === 'success' && (
        <div className="flex items-center gap-2 text-sm text-green-600">
          <CheckCircle className="w-4 h-4" />
          {labels.success}
        </div>
      )}

      {status === 'error' && (
        <p className="text-sm text-red-600">{labels.error}: {errorMessage}</p>
      )}
    </form>
  );
}
