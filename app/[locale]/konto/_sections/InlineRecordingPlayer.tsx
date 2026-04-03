'use client';

import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { Loader2, Play, X } from 'lucide-react';
import { ReactNode } from 'react';

const SessionReviewPlayer = dynamic(() => import('@/components/session-review/SessionReviewPlayer'), {
  ssr: false,
  loading: () => (
    <div className="w-full aspect-[9/14] md:aspect-video bg-black rounded-xl flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-white/50 animate-spin" />
    </div>
  ),
});

interface Props {
  recordingId: string;
  userEmail: string;
  userId: string;
  isExpanded: boolean;
  onToggle: () => void;
  children?: ReactNode;
}

export default function InlineRecordingPlayer({
  recordingId,
  userEmail,
  userId,
  isExpanded,
  onToggle,
  children,
}: Props) {
  const t = useTranslations('PrivateRecordings');

  return (
    <div className="contents">
      <div className="flex items-center gap-2 shrink-0 md:justify-end">
        <button
          onClick={onToggle}
          className={`
            flex items-center gap-2 px-4 py-2.5 md:px-3 md:py-1.5 rounded-lg text-sm md:text-xs font-medium transition-colors
            ${isExpanded
              ? 'bg-htg-surface-hover text-htg-fg-muted hover:text-htg-fg'
              : 'bg-htg-sage text-white hover:bg-htg-sage/90'}
          `}
        >
          {isExpanded ? (
            <>
              <X className="w-4 h-4 md:w-3.5 md:h-3.5" />
              {t('close')}
            </>
          ) : (
            <>
              <Play className="w-4 h-4 md:w-3.5 md:h-3.5" />
              {t('listen')}
            </>
          )}
        </button>
        {children}
      </div>

      {isExpanded && (
        <div className="col-span-1 md:col-span-2 w-full mt-1 animate-in fade-in slide-in-from-top-2 duration-200">
          <SessionReviewPlayer
            playbackId={recordingId}
            idFieldName="recordingId"
            userEmail={userEmail}
            userId={userId}
            tokenEndpoint="/api/video/booking-recording-token"
          />
          <p className="text-xs text-htg-fg-muted mt-3 px-1 text-center sm:text-left">
            {t('sharing_prohibited')}
          </p>
        </div>
      )}
    </div>
  );
}
