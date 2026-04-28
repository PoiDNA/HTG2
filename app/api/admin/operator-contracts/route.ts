import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/auth';
import { uploadFile, deleteFile, getCdnUrl } from '@/lib/bunny-storage';
import { randomUUID } from 'crypto';

const MAX_SIZE = 20 * 1024 * 1024; // 20 MB

/**
 * POST /api/admin/operator-contracts
 * Upload a signed contract PDF to Bunny htg2 / operator-contracts/ and record in DB.
 * FormData: file, operatorName, operatorEmail?, signedBy (operator|admin|both)
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { supabase, user } = auth;

  const form = await request.formData();
  const file = form.get('file') as File | null;
  const operatorName = (form.get('operatorName') as string | null)?.trim();
  const operatorEmail = (form.get('operatorEmail') as string | null)?.trim() || null;
  const signedBy = form.get('signedBy') as string | null;

  if (!file || !operatorName || !signedBy) {
    return NextResponse.json({ error: 'Wymagane pola: file, operatorName, signedBy' }, { status: 400 });
  }
  if (!['operator', 'admin', 'both'].includes(signedBy)) {
    return NextResponse.json({ error: 'signedBy musi być: operator, admin lub both' }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'Plik za duży (max 20 MB)' }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: 'Tylko pliki PDF' }, { status: 400 });
  }

  const uuid = randomUUID();
  const bunnyPath = `operator-contracts/${uuid}.pdf`;
  const buffer = await file.arrayBuffer();

  await uploadFile(bunnyPath, buffer, 'application/pdf');
  const cdnUrl = getCdnUrl(bunnyPath);

  const { data, error } = await supabase
    .from('operator_signed_contracts')
    .insert({
      operator_name: operatorName,
      operator_email: operatorEmail,
      bunny_path: bunnyPath,
      cdn_url: cdnUrl,
      file_name: file.name,
      signed_by: signedBy,
      uploaded_by: user.email!,
    })
    .select()
    .single();

  if (error) {
    await deleteFile(bunnyPath).catch(() => {});
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

/**
 * DELETE /api/admin/operator-contracts?id=<uuid>
 */
export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { supabase } = auth;

  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Brak id' }, { status: 400 });

  const { data: row, error: fetchError } = await supabase
    .from('operator_signed_contracts')
    .select('bunny_path')
    .eq('id', id)
    .single();

  if (fetchError || !row) {
    return NextResponse.json({ error: 'Nie znaleziono' }, { status: 404 });
  }

  await deleteFile(row.bunny_path).catch(() => {});

  await supabase.from('operator_signed_contracts').delete().eq('id', id);

  return NextResponse.json({ ok: true });
}
