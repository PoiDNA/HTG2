import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase/server';

/**
 * PATCH /api/fragments/categories/[id]
 * Update category name, color, slug, sort_order, or parent_id.
 * All fields optional; partial update.
 *
 * DELETE /api/fragments/categories/[id]
 * Delete a category. Saves in this category have category_id SET NULL (DB cascade).
 * Children categories are CASCADE deleted (DB).
 * Returns 409 if category has children (prevent accidental tree deletion).
 */

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim().slice(0, 100);
    if (!name) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 });
    updates.name = name;
  }
  if (body.color !== undefined)      updates.color = body.color ?? null;
  if (body.slug !== undefined)       updates.slug = body.slug ?? null;
  if (body.sort_order !== undefined) updates.sort_order = Number(body.sort_order);
  if (body.parent_id !== undefined)  updates.parent_id = body.parent_id ?? null;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('user_categories')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id) // RLS enforced, but explicit for clarity
    .select('id, name, slug, color, parent_id, sort_order, updated_at')
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    }
    if (error.code === 'check_violation') {
      return NextResponse.json({ error: 'Category nesting exceeds maximum depth of 3' }, { status: 422 });
    }
    if (error.code === '23505') {
      return NextResponse.json({ error: 'A category with this slug already exists' }, { status: 409 });
    }
    console.error('[categories] PATCH failed', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ category: data });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  // Prevent accidental deletion of categories that still have children
  const { count: childCount } = await supabase
    .from('user_categories')
    .select('id', { count: 'exact', head: true })
    .eq('parent_id', id)
    .eq('user_id', user.id);

  if ((childCount ?? 0) > 0) {
    return NextResponse.json(
      { error: 'Category has subcategories. Delete them first or move them.' },
      { status: 409 },
    );
  }

  const { error } = await supabase
    .from('user_categories')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    }
    console.error('[categories] DELETE failed', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
