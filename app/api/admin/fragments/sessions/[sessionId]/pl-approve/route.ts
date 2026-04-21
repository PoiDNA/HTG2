import { NextRequest, NextResponse } from 'next/server';
import {
  requireAdminOrEditor,
  requireAdminOrEditorOrTranslator,
} from '@/lib/admin/auth';

/**
 * /api/admin/fragments/sessions/[sessionId]/pl-approve
 *
 * Gate akceptacji wersji PL przed auto-tłumaczeniem Claude.
 *
 *   POST   — admin/editor: ustawia pl_approved_at=now(), pl_approved_by=userId.
 *   DELETE — admin/editor: zeruje oba pola (odwołanie akceptacji).
 *   GET    — admin/editor/translator: zwraca {pl_approved_at, pl_approved_by}.
 *
 * Endpoint /translate czyta pl_approved_at i odmawia (403), jeśli NULL.
 */

export const runtime = 'nodejs';

type Params = { params: Promise<{ sessionId: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const auth = await requireAdminOrEditor();
  if ('error' in auth) return auth.error;

  const { sessionId } = await params;
  const now = new Date().toISOString();

  const { data, error } = await auth.supabase
    .from('session_templates')
    .update({ pl_approved_at: now, pl_approved_by: auth.user.id })
    .eq('id', sessionId)
    .select('pl_approved_at, pl_approved_by')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: `DB error: ${error.message}` }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    pl_approved_at: data.pl_approved_at,
    pl_approved_by: data.pl_approved_by,
  });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const auth = await requireAdminOrEditor();
  if ('error' in auth) return auth.error;

  const { sessionId } = await params;

  const { data, error } = await auth.supabase
    .from('session_templates')
    .update({ pl_approved_at: null, pl_approved_by: null })
    .eq('id', sessionId)
    .select('id')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: `DB error: ${error.message}` }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireAdminOrEditorOrTranslator();
  if ('error' in auth) return auth.error;

  const { sessionId } = await params;

  const { data, error } = await auth.supabase
    .from('session_templates')
    .select('pl_approved_at, pl_approved_by')
    .eq('id', sessionId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: `DB error: ${error.message}` }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  return NextResponse.json({
    pl_approved_at: (data.pl_approved_at as string | null) ?? null,
    pl_approved_by: (data.pl_approved_by as string | null) ?? null,
  });
}
