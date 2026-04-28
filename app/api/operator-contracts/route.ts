import { NextResponse } from 'next/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

/**
 * GET /api/operator-contracts
 * Public list of signed operator contracts (name, date, download link).
 */
export async function GET() {
  const supabase = createSupabaseServiceRole();

  const { data, error } = await supabase
    .from('operator_signed_contracts')
    .select('id, operator_name, operator_email, cdn_url, file_name, signed_by, uploaded_at')
    .order('uploaded_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
