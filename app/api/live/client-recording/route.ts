import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '@/lib/supabase/server';
import { uploadFile } from '@/lib/bunny-storage';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const bookingId = formData.get('bookingId') as string;
    const liveSessionId = formData.get('liveSessionId') as string;
    const type = formData.get('type') as string; // 'before' | 'after'
    const format = formData.get('format') as string; // 'video' | 'audio'
    const duration = parseInt(formData.get('duration') as string) || 0;

    if (!file || !bookingId || !type || !format) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Upload to Bunny Storage
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = format === 'video' ? 'webm' : 'webm';
    const path = `client-recordings/${user.id}/${bookingId}/${type}-${Date.now()}.${ext}`;

    await uploadFile(path, buffer, file.type || 'video/webm');

    const cdnUrl = `${process.env.NEXT_PUBLIC_BUNNY_CDN_URL}/${path}`;

    // Save to DB
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    const { data: recording, error: dbError } = await admin
      .from('client_recordings')
      .insert({
        user_id: user.id,
        booking_id: bookingId,
        live_session_id: liveSessionId || null,
        type,
        format,
        storage_url: cdnUrl,
        duration_seconds: duration,
        file_size_bytes: buffer.length,
        sharing_mode: 'private',
      })
      .select('id')
      .single();

    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    return NextResponse.json({ id: recording.id, url: cdnUrl });
  } catch (error: any) {
    console.error('Client recording upload error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// GET — list recordings for a booking
export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bookingId = request.nextUrl.searchParams.get('bookingId');
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  let query = admin.from('client_recordings').select('*');

  if (bookingId) {
    query = query.eq('booking_id', bookingId);
  } else {
    query = query.eq('user_id', user.id);
  }

  const { data, error } = await query.order('created_at', { ascending: false }).limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ recordings: data });
}
