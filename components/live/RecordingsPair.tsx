'use client';

import { Video, Mic, Globe, Users, Lock, UserPlus } from 'lucide-react';

interface Recording {
  id: string;
  type: 'before' | 'after';
  format: 'video' | 'audio';
  storage_url: string;
  duration_seconds: number;
  sharing_mode: string;
  created_at: string;
}

interface RecordingsPairProps {
  before?: Recording;
  after?: Recording;
  clientName?: string;
  sessionDate?: string;
  showSharingControls?: boolean;
  onSharingChange?: (recordingId: string, mode: string) => void;
}

const SHARING_LABELS: Record<string, { icon: typeof Lock; label: string }> = {
  private: { icon: Lock, label: 'Prywatne' },
  favorites: { icon: Users, label: 'Polubieni' },
  invited: { icon: UserPlus, label: 'Zaproszeni' },
  public: { icon: Globe, label: 'Wszyscy' },
};

function RecordingCard({ recording, label, showSharingControls, onSharingChange }: {
  recording: Recording | undefined;
  label: string;
  showSharingControls?: boolean;
  onSharingChange?: (recordingId: string, mode: string) => void;
}) {
  if (!recording) {
    return (
      <div className="flex-1 bg-htg-surface/50 border border-htg-card-border rounded-xl p-4 flex items-center justify-center min-h-[120px]">
        <p className="text-htg-fg-muted/40 text-sm">{label} — brak nagrania</p>
      </div>
    );
  }

  const Icon = recording.format === 'video' ? Video : Mic;
  const sharing = SHARING_LABELS[recording.sharing_mode] || SHARING_LABELS.private;
  const SharingIcon = sharing.icon;
  const mins = Math.floor(recording.duration_seconds / 60);
  const secs = recording.duration_seconds % 60;

  return (
    <div className="flex-1 bg-htg-card border border-htg-card-border rounded-xl overflow-hidden">
      {/* Player */}
      <div className="relative bg-black">
        {recording.format === 'video' ? (
          <video
            src={recording.storage_url}
            controls
            playsInline
            controlsList="nodownload"
            className="w-full aspect-video object-cover"
          />
        ) : (
          <div className="p-6 flex items-center justify-center">
            <audio src={recording.storage_url} controls controlsList="nodownload" className="w-full" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs text-htg-fg-muted">
            <Icon className="w-3 h-3" />
            {label} · {mins}:{String(secs).padStart(2, '0')}
          </span>
          <span className="flex items-center gap-1 text-xs text-htg-fg-muted">
            <SharingIcon className="w-3 h-3" />
            {sharing.label}
          </span>
        </div>

        {/* Sharing controls */}
        {showSharingControls && onSharingChange && (
          <div className="flex gap-1">
            {Object.entries(SHARING_LABELS).map(([mode, { icon: MIcon, label: mLabel }]) => (
              <button
                key={mode}
                onClick={() => onSharingChange(recording.id, mode)}
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                  recording.sharing_mode === mode
                    ? 'bg-htg-sage text-white'
                    : 'bg-htg-surface text-htg-fg-muted hover:text-htg-fg'
                }`}
              >
                <MIcon className="w-3 h-3" />
                {mLabel}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function RecordingsPair({
  before,
  after,
  clientName,
  sessionDate,
  showSharingControls,
  onSharingChange,
}: RecordingsPairProps) {
  return (
    <div className="space-y-2">
      {(clientName || sessionDate) && (
        <div className="flex items-center gap-2 text-sm text-htg-fg-muted">
          {clientName && <span className="font-medium text-htg-fg">{clientName}</span>}
          {sessionDate && <span>· {sessionDate}</span>}
        </div>
      )}
      <div className="flex gap-3 flex-col sm:flex-row">
        <RecordingCard
          recording={before}
          label="Przed sesją"
          showSharingControls={showSharingControls}
          onSharingChange={onSharingChange}
        />
        <RecordingCard
          recording={after}
          label="Po sesji"
          showSharingControls={showSharingControls}
          onSharingChange={onSharingChange}
        />
      </div>
    </div>
  );
}
