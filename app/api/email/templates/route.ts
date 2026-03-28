import { NextRequest, NextResponse } from 'next/server';
import { requireEmailAccess } from '@/lib/email/auth';

// GET — list templates (own + global)
export async function GET(req: NextRequest) {
  const auth = await requireEmailAccess();
  if ('error' in auth) return auth.error;
  const { supabase, user, isAdmin } = auth;

  let query = supabase
    .from('message_templates')
    .select('*')
    .eq('is_active', true)
    .order('name');

  // Admin sees all; staff sees own + global (created_by IS NULL)
  if (!isAdmin) {
    query = query.or(`created_by.eq.${user.id},created_by.is.null`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ templates: data || [] });
}

// POST — create template
export async function POST(req: NextRequest) {
  const auth = await requireEmailAccess();
  if ('error' in auth) return auth.error;
  const { supabase, user } = auth;

  const { name, category, subject, bodyHtml, bodyText } = await req.json();
  if (!name || !bodyText) {
    return NextResponse.json({ error: 'name and bodyText required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('message_templates')
    .insert({
      name,
      category: category || null,
      subject: subject || null,
      body_html: bodyHtml || null,
      body_text: bodyText,
      channel: 'email',
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ template: data });
}
