import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { isAdminEmail, isStaffEmail } from '@/lib/roles';

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Only admin, Natalia (practitioner) and assistants can initiate
    const isAdmin = isAdminEmail(user.email ?? '');
    const isStaff = isStaffEmail(user.email ?? '');
    if (!isAdmin && !isStaff) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { emails }: { emails: string[] } = await req.json();
    if (!emails?.length) {
      return NextResponse.json({ error: 'Podaj co najmniej jeden email' }, { status: 400 });
    }

    const db = createSupabaseServiceRole();

    // Resolve emails → user_ids from profiles
    const normalised = emails.map(e => e.trim().toLowerCase()).filter(Boolean);
    const { data: profiles } = await db
      .from('profiles')
      .select('id, email, display_name')
      .in('email', normalised);

    if (!profiles?.length) {
      return NextResponse.json({ error: 'Nie znaleziono żadnego użytkownika HTG dla podanych emaili' }, { status: 400 });
    }

    // Also fetch initiator's profile
    const { data: initiatorProfile } = await db
      .from('profiles')
      .select('id, email, display_name')
      .eq('id', user.id)
      .single();

    // Generate room name
    const shortId = crypto.randomUUID().slice(0, 8);
    const ts = Date.now().toString(36);
    const roomName = `qc-${shortId}-${ts}`;

    // Create call record
    const { data: call, error: callError } = await db
      .from('quick_calls')
      .insert({ created_by: user.id, room_name: roomName })
      .select('id')
      .single();

    if (callError || !call) {
      return NextResponse.json({ error: 'Błąd tworzenia połączenia' }, { status: 500 });
    }

    // Add initiator as first participant
    const participantRows = [
      {
        call_id: call.id,
        user_id: user.id,
        email: user.email ?? '',
        display_name: initiatorProfile?.display_name ?? user.email ?? '',
      },
      ...profiles.map(p => ({
        call_id: call.id,
        user_id: p.id,
        email: p.email ?? '',
        display_name: p.display_name ?? p.email ?? '',
      })),
    ];

    // Deduplicate (initiator might be in invitee list)
    const seen = new Set<string>();
    const uniqueRows = participantRows.filter(r => {
      if (seen.has(r.user_id)) return false;
      seen.add(r.user_id);
      return true;
    });

    await db.from('quick_call_participants').insert(uniqueRows);

    // Warn about emails not found
    const foundEmails = new Set(profiles.map(p => p.email?.toLowerCase()));
    const notFound = normalised.filter(e => !foundEmails.has(e));

    return NextResponse.json({ callId: call.id, notFound });
  } catch (e) {
    console.error('[quick-call/create]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
