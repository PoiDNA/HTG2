import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { requireSesjeEditor } from '../_auth';

interface Ctx { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await requireSesjeEditor();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: 403 });
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const {
    session_date, start_time, display_name, email, phone,
    session_type, status, topics, payment_notes,
  } = body as Record<string, string | undefined>;

  const db = createSupabaseServiceRole();

  // Load existing booking + profile for diff and to know user_id
  const { data: existing } = await db
    .from('bookings')
    .select('id, user_id, session_type, status, session_date, start_time, topics, payment_notes')
    .eq('id', id)
    .single();
  if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const { data: existingProfile } = await db
    .from('profiles')
    .select('id, display_name, email, phone')
    .eq('id', existing.user_id)
    .single();

  // Update booking fields
  const bookingPatch: Record<string, unknown> = {};
  if (session_date !== undefined) bookingPatch.session_date = session_date || null;
  if (start_time !== undefined) bookingPatch.start_time = start_time || null;
  if (session_type !== undefined) bookingPatch.session_type = session_type;
  if (status !== undefined) bookingPatch.status = status;
  if (topics !== undefined) bookingPatch.topics = topics || null;
  if (payment_notes !== undefined) bookingPatch.payment_notes = payment_notes || null;

  if (Object.keys(bookingPatch).length > 0) {
    const { error: upErr } = await db.from('bookings').update(bookingPatch).eq('id', id);
    if (upErr) return NextResponse.json({ error: `Update failed: ${upErr.message}` }, { status: 500 });
  }

  // Update profile fields
  const profilePatch: Record<string, string | null> = {};
  if (display_name !== undefined) profilePatch.display_name = display_name || null;
  if (phone !== undefined) profilePatch.phone = phone || null;
  if (Object.keys(profilePatch).length > 0) {
    await db.from('profiles').update(profilePatch).eq('id', existing.user_id);
  }

  // Email change: update both auth.users and profiles
  let emailChanged = false;
  if (email !== undefined) {
    const newEmail = email.trim().toLowerCase();
    if (newEmail && newEmail !== existingProfile?.email) {
      const { error: emailErr } = await db.auth.admin.updateUserById(existing.user_id, { email: newEmail });
      if (emailErr) {
        return NextResponse.json({ error: `Zmiana emaila nieudana: ${emailErr.message}` }, { status: 500 });
      }
      await db.from('profiles').update({ email: newEmail }).eq('id', existing.user_id);
      emailChanged = true;
    }
  }

  // Build diff for audit
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [k, v] of Object.entries(bookingPatch)) {
    const before = (existing as Record<string, unknown>)[k];
    if (before !== v) changes[k] = { from: before, to: v };
  }
  for (const [k, v] of Object.entries(profilePatch)) {
    const before = (existingProfile as Record<string, unknown> | null)?.[k] ?? null;
    if (before !== v) changes[`profile.${k}`] = { from: before, to: v };
  }
  if (emailChanged) {
    changes['profile.email'] = { from: existingProfile?.email ?? null, to: email!.trim().toLowerCase() };
  }

  if (Object.keys(changes).length > 0) {
    await db.from('admin_audit_log').insert({
      admin_id: auth.user.id,
      action: 'sesje_update',
      details: {
        booking_id: id,
        actor_email: auth.user.email,
        changes,
      },
    });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const auth = await requireSesjeEditor();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: 403 });
  if (!auth.isAdmin) return NextResponse.json({ error: 'admin_only' }, { status: 403 });
  const { id } = await params;

  const db = createSupabaseServiceRole();
  const { data: booking } = await db
    .from('bookings')
    .select('id, user_id, session_type, session_date, start_time, status')
    .eq('id', id)
    .single();
  if (!booking) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const { error: delErr } = await db.from('bookings').delete().eq('id', id);
  if (delErr) return NextResponse.json({ error: `Delete failed: ${delErr.message}` }, { status: 500 });

  await db.from('admin_audit_log').insert({
    admin_id: auth.user.id,
    action: 'sesje_delete',
    details: {
      booking_id: id,
      actor_email: auth.user.email,
      deleted: booking,
    },
  });

  return NextResponse.json({ ok: true });
}
