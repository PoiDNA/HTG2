import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { requireAdmin } from '@/lib/admin/auth';
import { checkRateLimit, logAutoReply } from '@/lib/email/hub';

const resend = new Resend(process.env.RESEND_API_KEY);

// POST — send magic link to verify email-to-account association
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;
  const { id } = await params;

  const { data: conv } = await auth.supabase
    .from('conversations')
    .select('from_address, user_id, user_link_verified')
    .eq('id', id)
    .single();

  if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  if (!conv.user_id) return NextResponse.json({ error: 'No user linked' }, { status: 400 });
  if (conv.user_link_verified) return NextResponse.json({ error: 'Already verified' }, { status: 400 });

  // Cooldown: max 1 magic link per 15 minutes per address
  const rateLimited = await checkRateLimit(conv.from_address, 'magic_link', 15);
  if (rateLimited) {
    return NextResponse.json({ error: 'Link already sent. Wait 15 minutes.' }, { status: 429 });
  }

  // Build verification URL
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://htgcyou.com';
  const token = Buffer.from(JSON.stringify({ conversationId: id, userId: conv.user_id, ts: Date.now() }))
    .toString('base64url');
  const verifyUrl = `${baseUrl}/api/email/verify?token=${token}`;

  // Send verification email
  await resend.emails.send({
    from: 'HTG <sesje@htgcyou.com>',
    to: conv.from_address,
    subject: 'Potwierdź swój adres email — HTG',
    html: `
      <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a1a2e; padding: 32px; text-align: center;">
          <h1 style="color: #c9b97a; margin: 0;">HTG</h1>
        </div>
        <div style="padding: 32px; background: #f8f6f0;">
          <h2 style="color: #1a1a2e;">Potwierdź swój adres email</h2>
          <p>Otrzymaliśmy wiadomość z tego adresu. Kliknij poniżej, aby potwierdzić że to Ty:</p>
          <a href="${verifyUrl}" style="display: inline-block; background: #8B9E7C; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">Potwierdź email →</a>
          <p style="margin-top: 20px; color: #666; font-size: 13px;">Link jest ważny 24 godziny. Jeśli to nie Ty wysyłałeś(aś) wiadomość do HTG, zignoruj tego maila.</p>
        </div>
      </div>
    `,
  });

  await logAutoReply(conv.from_address, 'magic_link');

  return NextResponse.json({ sent: true });
}
