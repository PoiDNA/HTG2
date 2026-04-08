// Map LiveKit participant identity → SpeakerRole for a given live session.
//
// Sources of truth:
// - Primary client: bookings.user_id
// - Partner (natalia_para): booking_companions.user_id WHERE accepted_at IS NOT NULL
// - Host (Natalia / practitioner): staff_members WHERE role='practitioner' — identity
//   matched against any active practitioner's user_id
// - Assistant: booking_slots.assistant_id → staff_members.user_id (if assistant session type)
// - Fallback: 'unknown'

import type { createSupabaseServiceRole } from '@/lib/supabase/service';
import type { SpeakerRole } from './types';
import { AnalysisError } from './errors';

type SupabaseServiceClient = ReturnType<typeof createSupabaseServiceRole>;

export interface SpeakerInfo {
  role: SpeakerRole;
  name: string;
}

export async function identifySpeakers(
  db: SupabaseServiceClient,
  liveSessionId: string,
): Promise<Map<string, SpeakerInfo>> {
  const roleMap = new Map<string, SpeakerInfo>();

  // 1. Load session + booking to find primary client and slot
  const { data: session, error: sessionErr } = await db
    .from('live_sessions')
    .select('booking_id, slot_id')
    .eq('id', liveSessionId)
    .single();

  if (sessionErr || !session) {
    throw new AnalysisError('identify_speakers_failed', 'live_session not found');
  }

  // 2. Primary client from booking
  const { data: booking } = await db
    .from('bookings')
    .select('user_id, session_type')
    .eq('id', session.booking_id)
    .single();

  if (booking?.user_id) {
    // Fetch display name
    const { data: profile } = await db
      .from('profiles')
      .select('display_name')
      .eq('id', booking.user_id)
      .maybeSingle();
    roleMap.set(booking.user_id, {
      role: 'client',
      name: profile?.display_name ?? 'Klient',
    });
  }

  // 3. Partner for natalia_para
  if (booking?.session_type === 'natalia_para') {
    const { data: companions } = await db
      .from('booking_companions')
      .select('user_id, display_name')
      .eq('booking_id', session.booking_id)
      .not('accepted_at', 'is', null);

    for (const c of companions ?? []) {
      if (c.user_id) {
        roleMap.set(c.user_id, {
          role: 'client',
          name: c.display_name ?? 'Partner',
        });
      }
    }
  }

  // 4. Host — any practitioner in staff_members with a linked auth user
  const { data: practitioners } = await db
    .from('staff_members')
    .select('user_id, name')
    .eq('role', 'practitioner')
    .eq('is_active', true)
    .not('user_id', 'is', null);

  for (const p of practitioners ?? []) {
    if (p.user_id) {
      // Don't override if already mapped (clients take precedence — shouldn't happen
      // but defensive coding)
      if (!roleMap.has(p.user_id)) {
        roleMap.set(p.user_id, { role: 'host', name: p.name ?? 'Prowadząca' });
      }
    }
  }

  // 5. Assistant via slot.assistant_id
  if (session.slot_id) {
    const { data: slot } = await db
      .from('booking_slots')
      .select('assistant_id')
      .eq('id', session.slot_id)
      .maybeSingle();

    if (slot?.assistant_id) {
      const { data: assistant } = await db
        .from('staff_members')
        .select('user_id, name')
        .eq('id', slot.assistant_id)
        .maybeSingle();

      if (assistant?.user_id && !roleMap.has(assistant.user_id)) {
        roleMap.set(assistant.user_id, {
          role: 'assistant',
          name: assistant.name ?? 'Asystent',
        });
      }
    }
  }

  return roleMap;
}
