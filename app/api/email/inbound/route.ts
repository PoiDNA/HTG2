import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { saveInboundMessage, isAutoSubmittedOrBulk } from '@/lib/email/hub';
import type { InboundWebhookPayload } from '@/lib/email/types';

// Hardcoded blocklist — no DB queries in webhook
const BLOCKED_PREFIXES = ['noreply@', 'no-reply@', 'mailer-daemon@', 'postmaster@', 'bounce@'];

// POST /api/email/inbound — Resend inbound webhook
// "Stupid and fast" — zero DB queries for filtering, just save and return 200
export async function POST(req: NextRequest) {
  // 1. Read raw body for Svix verification
  const rawBody = await req.text();
  const svixId = req.headers.get('svix-id');
  const svixTimestamp = req.headers.get('svix-timestamp');
  const svixSignature = req.headers.get('svix-signature');

  // 2. Svix HMAC-SHA256 verification
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (webhookSecret && svixId && svixTimestamp && svixSignature) {
    const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
    // Secret from Resend is base64 encoded with "whsec_" prefix
    const secretBytes = Buffer.from(
      webhookSecret.startsWith('whsec_') ? webhookSecret.slice(6) : webhookSecret,
      'base64'
    );
    const expectedSignature = crypto
      .createHmac('sha256', secretBytes)
      .update(signedContent)
      .digest('base64');

    // Svix sends multiple signatures separated by space, check if any matches
    const signatures = svixSignature.split(' ').map(s => s.replace(/^v1,/, ''));
    if (!signatures.includes(expectedSignature)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    // Timestamp tolerance (5 minutes)
    const ts = parseInt(svixTimestamp, 10);
    if (Math.abs(Date.now() / 1000 - ts) > 300) {
      return NextResponse.json({ error: 'Timestamp too old' }, { status: 400 });
    }
  }

  // 3. Parse payload
  let payload: InboundWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!payload.data?.email_id || !payload.data?.from) {
    return NextResponse.json({ received: true }); // Silently ignore non-email events
  }

  const fromLower = payload.data.from.toLowerCase();

  // 4. Hardcoded blocklist (no DB)
  if (BLOCKED_PREFIXES.some(p => fromLower.startsWith(p) || fromLower.includes(`<${p}`))) {
    return NextResponse.json({ received: true });
  }

  // 5. Anti-loop check (headers only, no DB)
  if (isAutoSubmittedOrBulk(payload.data.headers)) {
    return NextResponse.json({ received: true });
  }

  // 6. Save message with processing_status = 'pending'
  // ON CONFLICT (channel, provider_message_id) DO NOTHING handles duplicate webhooks
  await saveInboundMessage(payload);

  // 7. Return 200 immediately — cron will process async
  return NextResponse.json({ received: true });
}
