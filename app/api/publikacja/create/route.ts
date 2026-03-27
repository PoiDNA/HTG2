import { NextRequest, NextResponse } from 'next/server';
import { requirePublication } from '@/lib/publication/auth';

export async function POST(request: NextRequest) {
  const auth = await requirePublication();
  if ('error' in auth) return auth.error;
  const { supabase } = auth;

  const body = await request.json();
  const { title, monthly_set_id, description } = body;

  if (!title || typeof title !== 'string') {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  const { data: publication, error } = await supabase
    .from('session_publications')
    .insert({
      title: title || null,
      status: 'raw',
      monthly_set_id: monthly_set_id || null,
      editor_notes: description || null,
      source_tracks: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ publication });
}
