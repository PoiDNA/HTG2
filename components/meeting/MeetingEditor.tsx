'use client';

import MeetingForm from './MeetingForm';
import StageEditor from './StageEditor';

interface MeetingEditorProps {
  meeting: any;
  stages: any[];
  locale: string;
  basePath?: string;
}

export default function MeetingEditor({ meeting, stages, locale, basePath = '/prowadzacy/spotkania-htg' }: MeetingEditorProps) {
  return (
    <div className="space-y-8">
      {/* Basic config */}
      <div>
        <h3 className="text-lg font-serif font-semibold text-htg-fg mb-4">Konfiguracja</h3>
        <MeetingForm
          locale={locale}
          meetingId={meeting.id}
          basePath={basePath}
          initial={{
            name: meeting.name,
            meeting_type: meeting.meeting_type,
            max_participants: meeting.max_participants,
            allow_self_register: meeting.allow_self_register,
            participant_selection: meeting.participant_selection,
          }}
        />
      </div>

      {/* Stage editor */}
      <div>
        <h3 className="text-lg font-serif font-semibold text-htg-fg mb-4">Plan spotkania</h3>
        <StageEditor meetingId={meeting.id} initialStages={stages} />
      </div>
    </div>
  );
}
