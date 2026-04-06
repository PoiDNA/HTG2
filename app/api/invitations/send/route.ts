import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { sendInvitationEmail } from '@/lib/email/resend';

const RATE_LIMIT = 5; // max invitations per 24h
const NAME_RE = /^[\p{L}\s\-'.]+$/u;
const URL_RE = /https?:\/\/|www\.|[a-z0-9]+\.[a-z]{2,}/i;
const HTML_RE = /<[^>]+>/;
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://htgcyou.com';

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const email = (body.email || '').toLowerCase().trim();
  const inviterName = (body.inviterName || '').trim();
  const personalMessage = (body.personalMessage || '').trim() || null;

  // Validate email
  if (!email || !email.includes('@') || email.length > 254) {
    return NextResponse.json({ error: 'Nieprawidłowy adres e-mail' }, { status: 400 });
  }
  if (email === user.email?.toLowerCase()) {
    return NextResponse.json({ error: 'Nie możesz zaprosić siebie' }, { status: 400 });
  }

  // Validate inviterName
  if (!inviterName || inviterName.length > 50 || !NAME_RE.test(inviterName)) {
    return NextResponse.json({ error: 'Podaj prawidłowe imię (max 50 znaków)' }, { status: 400 });
  }

  // Validate personalMessage
  if (personalMessage) {
    if (personalMessage.length > 250) {
      return NextResponse.json({ error: 'Wiadomość max 250 znaków' }, { status: 400 });
    }
    if (URL_RE.test(personalMessage) || HTML_RE.test(personalMessage)) {
      return NextResponse.json({ error: 'Wiadomość nie może zawierać adresów URL ani kodu HTML' }, { status: 400 });
    }
  }

  const serviceDb = createSupabaseServiceRole();

  // Rate limit: count invitations sent in last 24h
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await serviceDb
    .from('external_invitations')
    .select('id', { count: 'exact', head: true })
    .eq('inviter_id', user.id)
    .gte('sent_at', since);

  if ((count ?? 0) >= RATE_LIMIT) {
    return NextResponse.json({ error: 'Limit zaproszeń (5/24h) wyczerpany. Spróbuj jutro.' }, { status: 429 });
  }

  // Check if email already registered in HTG (via profiles)
  const { data: existingUser } = await serviceDb
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  const userExists = !!existingUser;

  // Generate token (audit trail)
  const token = crypto.randomBytes(16).toString('hex');

  // Upsert invitation (service role bypasses RLS)
  const { error: dbError } = await serviceDb
    .from('external_invitations')
    .upsert({
      inviter_id: user.id,
      email,
      inviter_name: inviterName,
      personal_message: personalMessage,
      token,
      status: 'sent',
      sent_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      registered_user_id: null,
      registered_at: null,
    }, {
      onConflict: 'inviter_id,email',
    });

  if (dbError) {
    console.error('Invitation upsert error:', dbError);
    return NextResponse.json({ error: 'Błąd zapisu zaproszenia' }, { status: 500 });
  }

  // Always return success (constant time — anti-enumeration)
  const response = NextResponse.json({ success: true });

  // Fire-and-forget: send email only if user doesn't exist in HTG
  if (!userExists) {
    const registerUrl = `${BASE_URL}/pl/login`;
    void sendInvitationEmail(email, {
      inviterName,
      personalMessage: personalMessage || undefined,
      registerUrl,
    }).catch(err => console.error('Invitation email error:', err));
  }

  return response;
}
