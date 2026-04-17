import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

/**
 * GET /api/fragments/categories
 * Returns flat list of user's categories (client builds tree from parent_id).
 *
 * POST /api/fragments/categories
 * Create a new category.
 * Body: { name: string, parent_id?: string | null, color?: string, slug?: string }
 */

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: categories, error } = await supabase
    .from('user_categories')
    .select('id, name, slug, color, parent_id, sort_order, created_at')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    console.error('[categories] GET failed', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ categories: categories ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body?.name || typeof body.name !== 'string') {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const name = body.name.trim().slice(0, 100);
  if (!name) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 });

  const parentId: string | null = body.parent_id ?? null;
  const color: string | null = body.color ?? null;
  const slug: string | null = body.slug ?? null;

  // Validate parent belongs to user (service role lookup)
  if (parentId) {
    const db = createSupabaseServiceRole();
    const { data: parent } = await db
      .from('user_categories')
      .select('id, user_id')
      .eq('id', parentId)
      .single();
    if (!parent || parent.user_id !== user.id) {
      return NextResponse.json({ error: 'parent_id not found or not owned by user' }, { status: 400 });
    }
  }

  const { data, error } = await supabase
    .from('user_categories')
    .insert({ user_id: user.id, name, parent_id: parentId, color, slug })
    .select('id, name, slug, color, parent_id, sort_order, created_at')
    .single();

  if (error) {
    if (error.code === 'check_violation') {
      return NextResponse.json({ error: 'Category nesting exceeds maximum depth of 3' }, { status: 422 });
    }
    if (error.code === '23505') {
      return NextResponse.json({ error: 'A category with this slug already exists' }, { status: 409 });
    }
    console.error('[categories] POST failed', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ category: data }, { status: 201 });
}
