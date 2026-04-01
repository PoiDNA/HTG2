'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Clock } from 'lucide-react';
import InlineRecordingPlayer from './InlineRecordingPlayer';
import RevokeButton from '../nagrania-sesji/RevokeButton';

export interface DashboardRecordingItem {
  id: string;
  title: string;
  configColor: string;
  configLabel: string;
  isPara: boolean;
  isReady: boolean;
  isLegalHold: boolean;
  dateLabel: string;
  durationLabel: string | null;
  showRevoke: boolean;
  recordingEmail?: string | null;
}

interface Props {
  items: DashboardRecordingItem[];
  userEmail: string;
  userId: string;
}

export default function DashboardRecordingList({ items, userEmail, userId }: Props) {
  const t = useTranslations('PrivateRecordings');
  const [activeRecordingId, setActiveRecordingId] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const isExpanded = activeRecordingId === item.id;
        
        return (
          <div key={item.id} className="bg-htg-card border border-htg-card-border rounded-xl p-4">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-x-4 gap-y-3 items-start">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs text-white ${item.configColor}`}>
                    {item.configLabel}
                  </span>
                  {item.isPara && (
                    <span className="text-xs text-htg-fg-muted">z partnerem/ką</span>
                  )}
                </div>
                <h3 className="font-medium text-htg-fg text-sm truncate">
                  {item.title}
                </h3>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-htg-fg-muted flex-wrap">
                  {item.dateLabel && <span>{item.dateLabel}</span>}
                  {item.recordingEmail && (
                    <span className="text-htg-fg-muted/70">{item.recordingEmail}</span>
                  )}
                  {item.durationLabel && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {item.durationLabel}
                    </span>
                  )}
                </div>
              </div>

              {item.isReady ? (
                <InlineRecordingPlayer
                  recordingId={item.id}
                  userEmail={userEmail}
                  userId={userId}
                  isExpanded={isExpanded}
                  onToggle={() => setActiveRecordingId(isExpanded ? null : item.id)}
                >
                  {item.showRevoke && <RevokeButton recordingId={item.id} isPara={item.isPara} />}
                </InlineRecordingPlayer>
              ) : (
                <div className="flex items-center gap-2 shrink-0 md:justify-end">
                  <div className="flex items-center gap-1.5 text-htg-fg-muted text-xs px-2 py-1.5">
                    <div className="w-3 h-3 border-2 border-htg-fg-muted/30 border-t-htg-sage rounded-full animate-spin" />
                    <span>{t('processing')}</span>
                  </div>
                  {item.showRevoke && <RevokeButton recordingId={item.id} isPara={item.isPara} />}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
