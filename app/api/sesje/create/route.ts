import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { requireSesjeEditor } from '../_auth';

export async function POST(req: NextRequest) {
  const auth = await requireSesjeEditor();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const {
    session_date, start_time, display_name, email, phone,
    session_type, status, topics, payment_notes,
  } = body as Record<string, string | undefined>;

  if (!email || !session_type) {
    return NextResponse.json({ error: 'email and session_type are required' }, { status: 400 });
  }

  const db = createSupabaseServiceRole();

  // Find or create profile by email
  const emailLc = email.trim().toLowerCase();
  let { data: profile } = await db
    .from('profiles')
    .select('id, display_name, email, phone')
    .eq('email', emailLc)
    .maybeSingle();

  let userId: string;
  if (profile) {
    userId = profile.id;
    // Update profile fields if provided
    const profilePatch: Record<string, string | null> = {};
    if (display_name !== undefined) profilePatch.display_name = display_name || null;
    if (phone !== undefined) profilePatch.phone = phone || null;
    if (Object.keys(profilePatch).length > 0) {
      await db.from('profiles').update(profilePatch).eq('id', userId);
    }
  } else {
    // Create new auth user (auto-confirmed) — Supabase will trigger profile creation
    const { data: created, error: createErr } = await db.auth.admin.createUser({
      email: emailLc,
      email_confirm: true,
      user_metadata: { name: display_name ?? null },
    });
    if (createErr || !created.user) {
      return NextResponse.json({ error: `Nie udało się utworzyć użytkownika: ${createErr?.message ?? 'unknown'}` }, { status: 500 });
    }
    userId = created.user.id;
    // Ensure profile row exists with provided fields
    await db.from('profiles').upsert({
      id: userId,
      email: emailLc,
      display_name: display_name || null,
      phone: phone || null,
    });
  }

  const insertRow: Record<string, unknown> = {
    user_id: userId,
    session_type,
    status: status || 'pending_confirmation',
    topics: topics || null,
    payment_notes: payment_notes || null,
    session_date: session_date || null,
    start_time: start_time || null,
  };

  const { data: booking, error: insertErr } = await db
    .from('bookings')
    .insert(insertRow)
    .select('id')
    .single();

  if (insertErr || !booking) {
    return NextResponse.json({ error: `Insert failed: ${insertErr?.message}` }, { status: 500 });
  }

  await db.from('admin_audit_log').insert({
    admin_id: auth.user.id,
    action: 'sesje_create',
    details: {
      booking_id: booking.id,
      actor_email: auth.user.email,
      client_email: emailLc,
      session_type,
      session_date: session_date || null,
      start_time: start_time || null,
    },
  });

  return NextResponse.json({ ok: true, id: booking.id });
}
