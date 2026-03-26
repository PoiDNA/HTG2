'use client';

import { useCallback, useState, useRef } from 'react';
import { Upload, X, FileAudio, Loader2 } from 'lucide-react';

interface TrackUploaderProps {
  publicationId: string;
  type: 'source' | 'edited';
  onUploadComplete: (tracks: { name: string; url: string; size: number }[]) => void;
  labels: {
    drag_drop: string;
    or_click: string;
    uploading: string;
    remove: string;
    upload: string;
  };
  accept?: string;
}

interface QueuedFile {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'done' | 'error';
  url?: string;
  error?: string;
}

export function TrackUploader({
  publicationId,
  type,
  onUploadComplete,
  labels,
  accept = '.wav,audio/wav,audio/x-wav',
}: TrackUploaderProps) {
  const [files, setFiles] = useState<QueuedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const items = Array.from(newFiles).map((file) => ({
      file,
      progress: 0,
      status: 'pending' as const,
    }));
    setFiles((prev) => [...prev, ...items]);
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles]
  );

  const handleUpload = async () => {
    const pendingFiles = files.filter((f) => f.status === 'pending');
    if (pendingFiles.length === 0) return;

    setIsUploading(true);
    const uploadedTracks: { name: string; url: string; size: number }[] = [];

    for (let i = 0; i < files.length; i++) {
      if (files[i].status !== 'pending') continue;

      setFiles((prev) =>
        prev.map((f, idx) => (idx === i ? { ...f, status: 'uploading' } : f))
      );

      try {
        const formData = new FormData();
        formData.append('file', files[i].file);
        formData.append('publicationId', publicationId);
        formData.append('type', type);
        formData.append('fileName', files[i].file.name);

        const res = await fetch('/api/publikacja/upload', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Upload failed');
        }

        const data = await res.json();
        uploadedTracks.push({
          name: files[i].file.name,
          url: data.cdnUrl,
          size: files[i].file.size,
        });

        setFiles((prev) =>
          prev.map((f, idx) =>
            idx === i ? { ...f, status: 'done', url: data.cdnUrl, progress: 100 } : f
          )
        );
      } catch (err) {
        setFiles((prev) =>
          prev.map((f, idx) =>
            idx === i
              ? { ...f, status: 'error', error: err instanceof Error ? err.message : 'Unknown error' }
              : f
          )
        );
      }
    }

    setIsUploading(false);
    if (uploadedTracks.length > 0) {
      onUploadComplete(uploadedTracks);
    }
  };

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
          isDragging
            ? 'border-htg-sage bg-htg-sage/5'
            : 'border-htg-card-border hover:border-htg-sage/50'
        }`}
      >
        <Upload className="w-8 h-8 text-htg-fg-muted mx-auto mb-3" />
        <p className="text-sm text-htg-fg font-medium">{labels.drag_drop}</p>
        <p className="text-xs text-htg-fg-muted mt-1">{labels.or_click}</p>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple
          onChange={(e) => e.target.files && addFiles(e.target.files)}
          className="hidden"
        />
      </div>

      {/* File queue */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((f, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-3 px-4 py-3 bg-htg-surface rounded-lg"
            >
              <div className="flex items-center gap-3 min-w-0">
                {f.status === 'uploading' ? (
                  <Loader2 className="w-5 h-5 text-htg-sage animate-spin shrink-0" />
                ) : (
                  <FileAudio className="w-5 h-5 text-htg-fg-muted shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-htg-fg truncate">{f.file.name}</p>
                  <p className="text-xs text-htg-fg-muted">
                    {(f.file.size / (1024 * 1024)).toFixed(1)} MB
                    {f.status === 'done' && ' — OK'}
                    {f.status === 'error' && ` — ${f.error}`}
                  </p>
                </div>
              </div>
              {f.status === 'pending' && (
                <button
                  onClick={() => removeFile(i)}
                  className="p-1 text-htg-fg-muted hover:text-htg-fg"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Upload button */}
      {files.some((f) => f.status === 'pending') && (
        <button
          onClick={handleUpload}
          disabled={isUploading}
          className="px-4 py-2 bg-htg-sage text-white text-sm font-medium rounded-lg hover:bg-htg-sage/90 disabled:opacity-50 transition-colors"
        >
          {isUploading ? labels.uploading : labels.upload}
        </button>
      )}
    </div>
  );
}
