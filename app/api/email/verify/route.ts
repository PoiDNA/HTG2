import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';

// GET /api/email/verify?token=... — Magic link callback to verify email association
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.redirect(new URL('/pl/konto', req.url));

  try {
    const payload = JSON.parse(Buffer.from(token, 'base64url').toString());
    const { conversationId, userId, ts } = payload;

    // Check 24h expiry
    if (Date.now() - ts > 24 * 60 * 60 * 1000) {
      return NextResponse.redirect(new URL('/pl/konto?msg=link-expired', req.url));
    }

    const db = createSupabaseServiceRole();
    await db.from('conversations').update({
      user_link_verified: true,
      user_link_method: 'magic_link',
    }).eq('id', conversationId).eq('user_id', userId);

    return NextResponse.redirect(new URL('/pl/konto?msg=email-verified', req.url));
  } catch {
    return NextResponse.redirect(new URL('/pl/konto?msg=invalid-link', req.url));
  }
}
