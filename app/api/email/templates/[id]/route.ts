import { NextRequest, NextResponse } from 'next/server';
import { requireEmailAccess } from '@/lib/email/auth';

// PUT — update template
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireEmailAccess();
  if ('error' in auth) return auth.error;
  const { supabase, user, isAdmin } = auth;
  const { id } = await params;

  // Check ownership
  const { data: existing } = await supabase
    .from('message_templates')
    .select('created_by')
    .eq('id', id)
    .single();

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!isAdmin && existing.created_by !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { name, category, subject, bodyHtml, bodyText } = await req.json();

  const { data, error } = await supabase
    .from('message_templates')
    .update({
      ...(name !== undefined && { name }),
      ...(category !== undefined && { category }),
      ...(subject !== undefined && { subject }),
      ...(bodyHtml !== undefined && { body_html: bodyHtml }),
      ...(bodyText !== undefined && { body_text: bodyText }),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ template: data });
}

// DELETE — delete template
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireEmailAccess();
  if ('error' in auth) return auth.error;
  const { supabase, user, isAdmin } = auth;
  const { id } = await params;

  const { data: existing } = await supabase
    .from('message_templates')
    .select('created_by')
    .eq('id', id)
    .single();

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!isAdmin && existing.created_by !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await supabase.from('message_templates').update({ is_active: false }).eq('id', id);
  return NextResponse.json({ deleted: true });
}
