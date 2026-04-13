'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Clock } from 'lucide-react';
import InlineRecordingPlayer from '../_sections/InlineRecordingPlayer';
import RevokeButton from './RevokeButton';

export interface RecordingPart {
  id: string;
  durationLabel: string | null;
  isReady: boolean;
  showRevoke: boolean;
  isPara: boolean;
}

export interface RecordingGroup {
  bookingId: string;
  mainId: string;
  title: string;
  configColor: string;
  configLabel: string;
  isPara: boolean;
  isReady: boolean;
  isLegalHold: boolean;
  dateLabel: string;
  durationLabel: string | null;
  expiresLabel: string | null;
  recordingStartedLabel: string | null;
  legalHoldMessage: string | null;
  recordingEmail?: string | null;
  parts: RecordingPart[];
}

interface Props {
  groups: RecordingGroup[];
  userEmail: string;
  userId: string;
}

export default function FullRecordingList({ groups, userEmail, userId }: Props) {
  const t = useTranslations('PrivateRecordings');
  const [activeRecordingId, setActiveRecordingId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {groups.map((group) => {
        const isSingle = group.parts.length === 1;

        return (
          <div key={group.bookingId} className="bg-htg-card border border-htg-card-border rounded-xl p-5">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-x-4 gap-y-4 items-start">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs text-white ${group.configColor}`}>
                    {group.configLabel}
                  </span>
                  {group.isPara && (
                    <span className="text-xs text-htg-fg-muted">dostępne również dla partnera/ki</span>
                  )}
                </div>
                
                <h3 className="font-medium text-htg-fg truncate">{group.title}</h3>
                
                <div className="flex items-center gap-3 mt-1 text-sm text-htg-fg-muted flex-wrap">
                  {group.dateLabel && <span>{group.dateLabel}</span>}
                  {group.recordingEmail && (
                    <span className="text-htg-fg-muted/70 text-xs">{group.recordingEmail}</span>
                  )}
                  {group.durationLabel && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {group.durationLabel}
                    </span>
                  )}
                  {group.expiresLabel && (
                    <span className="text-xs">{group.expiresLabel}</span>
                  )}
                </div>

                {group.recordingStartedLabel && (
                  <p className="text-xs text-amber-500/80 mt-1">
                    {group.recordingStartedLabel}
                  </p>
                )}

                {group.legalHoldMessage && (
                  <p className="text-xs text-htg-fg-muted mt-1" dangerouslySetInnerHTML={{ __html: group.legalHoldMessage }} />
                )}

                {/* Multiple parts */}
                {!isSingle && (
                  <div className="mt-4 space-y-4">
                    {group.parts.map((part, i) => {
                      const isExpanded = activeRecordingId === part.id;
                      return (
                        <div key={part.id} className="text-sm border-t border-htg-card-border/50 pt-3 first:border-0 first:pt-0">
                          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-x-4 gap-y-3 items-center">
                            <span className="text-htg-fg-muted">
                              Część {i + 1}{part.durationLabel ? ` (${part.durationLabel})` : ''}
                            </span>
                            
                            {part.isReady && (
                              <InlineRecordingPlayer
                                recordingId={part.id}
                                userEmail={userEmail}
                                userId={userId}
                                isExpanded={isExpanded}
                                onToggle={() => setActiveRecordingId(isExpanded ? null : part.id)}
                              >
                                {part.showRevoke && <RevokeButton recordingId={part.id} isPara={part.isPara} />}
                              </InlineRecordingPlayer>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Action area for single part */}
              {isSingle && (
                <div className="flex items-center gap-2 md:justify-end">
                  {group.isReady ? (
                    <InlineRecordingPlayer
                      recordingId={group.parts[0].id}
                      userEmail={userEmail}
                      userId={userId}
                      isExpanded={activeRecordingId === group.parts[0].id}
                      onToggle={() => setActiveRecordingId(activeRecordingId === group.parts[0].id ? null : group.parts[0].id)}
                    >
                      {group.parts[0].showRevoke && <RevokeButton recordingId={group.parts[0].id} isPara={group.parts[0].isPara} />}
                    </InlineRecordingPlayer>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 text-htg-fg-muted text-sm px-2 py-1.5">
                        <div className="w-4 h-4 border-2 border-htg-fg-muted/30 border-t-htg-sage rounded-full animate-spin" />
                        <span>{t('processing')}</span>
                      </div>
                      {group.parts[0].showRevoke && <RevokeButton recordingId={group.parts[0].id} isPara={group.parts[0].isPara} />}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
