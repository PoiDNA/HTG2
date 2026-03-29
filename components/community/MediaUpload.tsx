'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Attachment } from '@/lib/community/types';

interface MediaUploadProps {
  groupId: string;
  onUploadComplete: (attachment: Attachment) => void;
  maxFiles?: number;
}

export function MediaUpload({ groupId, onUploadComplete, maxFiles = 4 }: MediaUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(async (file: File) => {
    setError(null);

    // Client-side validation
    if (file.size > 5 * 1024 * 1024) {
      setError('Plik zbyt duży. Maksymalny rozmiar: 5MB.');
      return;
    }

    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      setError('Dozwolone formaty: JPG, PNG, WebP, GIF');
      return;
    }

    setUploading(true);

    try {
      // Client-side compression (if browser-image-compression is available)
      let fileToUpload = file;
      try {
        const imageCompression = (await import('browser-image-compression')).default;
        fileToUpload = await imageCompression(file, {
          maxSizeMB: 1,
          maxWidthOrHeight: 2048,
          useWebWorker: true,
        });
      } catch {
        // Compression failed, use original
      }

      const formData = new FormData();
      formData.append('file', fileToUpload);
      formData.append('group_id', groupId);

      const res = await fetch('/api/community/media/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Upload failed');
      }

      const { path } = await res.json();

      onUploadComplete({
        type: 'image',
        url: path,
        status: 'ready',
        metadata: {
          size_bytes: fileToUpload.size,
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload nieudany');
    } finally {
      setUploading(false);
    }
  }, [groupId, onUploadComplete]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);

    const files = Array.from(e.dataTransfer.files).slice(0, maxFiles);
    files.forEach(uploadFile);
  }, [uploadFile, maxFiles]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).slice(0, maxFiles);
    files.forEach(uploadFile);
    if (inputRef.current) inputRef.current.value = '';
  }, [uploadFile, maxFiles]);

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`
          border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors
          ${dragActive
            ? 'border-htg-sage bg-htg-sage/5'
            : 'border-htg-card-border hover:border-htg-sage/50'
          }
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />

        {uploading ? (
          <div className="flex items-center justify-center gap-2 text-htg-fg-muted">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Przesyłanie...</span>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 text-htg-fg-muted">
            <Upload className="w-5 h-5" />
            <span className="text-sm">Przeciągnij zdjęcia lub kliknij</span>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-2 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
