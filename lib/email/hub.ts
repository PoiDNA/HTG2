// ============================================================
// HTG Communication Hub — Core hub logic
// Threading, normalization, inbound save, attachments
// ============================================================

import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { uploadFile, getCdnUrl } from '@/lib/bunny-storage';
import type { InboundWebhookPayload, Message } from './types';

const RESEND_API_KEY = process.env.RESEND_API_KEY!;

// Generic subjects that must NOT match existing threads via fallback
const GENERIC_SUBJECTS = new Set([
  '', 'pytanie', 'brak tematu', 'no subject', 'question', 'hi', 'hello', 'hej', 'cześć',
]);

// ── Address normalization ──────────────────────────────────────

export function normalizeAddress(address: string, channel: string): string {
  if (channel === 'sms') {
    // E.164: strip spaces, ensure +48 prefix
    const digits = address.replace(/[^\d+]/g, '');
    if (digits.startsWith('+')) return digits;
    if (digits.startsWith('48')) return '+' + digits;
    if (digits.startsWith('0048')) return '+' + digits.slice(2);
    return '+48' + digits;
  }
  return address.toLowerCase().trim();
}

// ── Auto-submitted / bulk detection (anti-loop) ───────────────

export function isAutoSubmittedOrBulk(headers: Record<string, string> | undefined): boolean {
  if (!headers) return false;
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  if (h['auto-submitted'] && h['auto-submitted'] !== 'no') return true;
  if (h['precedence'] && ['bulk', 'list', 'junk'].includes(h['precedence'].toLowerCase())) return true;
  if (h['x-auto-response-suppress']) return true;
  return false;
}

// ── Mailbox resolution ────────────────────────────────────────

export async function resolveMailbox(toAddress: string) {
  const db = createSupabaseServiceRole();
  const normalized = normalizeAddress(toAddress, 'email');

  const { data } = await db
    .from('mailboxes')
    .select('id')
    .eq('address', normalized)
    .eq('is_active', true)
    .maybeSingle();

  if (data) return data.id;

  // Fallback to default mailbox
  const { data: defaultMb } = await db
    .from('mailboxes')
    .select('id')
    .eq('is_default', true)
    .maybeSingle();

  return defaultMb?.id || null;
}

// ── User resolution (From → Reply-To → CC hierarchy) ─────────

export async function resolveUser(
  fromAddress: string,
  replyTo?: string,
  ccList?: string[],
  spfPass?: boolean,
  dkimPass?: boolean
): Promise<{ userId: string | null; verified: boolean; method: string | null }> {
  const db = createSupabaseServiceRole();

  // Priority: from_address → reply_to → cc addresses
  const candidates = [fromAddress];
  if (replyTo) candidates.push(replyTo);
  if (ccList) candidates.push(...ccList);

  for (const addr of candidates) {
    const normalized = normalizeAddress(addr, 'email');
    const { data: profile } = await db
      .from('profiles')
      .select('id')
      .eq('email', normalized)
      .maybeSingle();

    if (profile) {
      const verified = (spfPass === true && dkimPass !== false);
      return { userId: profile.id, verified, method: 'auto_spf' };
    }
  }

  return { userId: null, verified: false, method: null };
}

// ── Thread resolution ─────────────────────────────────────────

export async function resolveThread(
  channel: string,
  smtpMessageId: string | undefined,
  smtpInReplyTo: string | undefined,
  smtpReferences: string[] | undefined,
  fromAddress: string,
  subject: string | undefined
): Promise<string | null> {
  const db = createSupabaseServiceRole();

  // 1. Hard match: In-Reply-To → existing smtp_message_id (always wins, even for generic subjects)
  if (smtpInReplyTo) {
    const { data } = await db
      .from('messages')
      .select('conversation_id')
      .eq('smtp_message_id', smtpInReplyTo)
      .maybeSingle();
    if (data) return data.conversation_id;
  }

  // 2. References chain
  if (smtpReferences && smtpReferences.length > 0) {
    for (const ref of smtpReferences) {
      const { data } = await db
        .from('messages')
        .select('conversation_id')
        .eq('smtp_message_id', ref)
        .maybeSingle();
      if (data) return data.conversation_id;
    }
  }

  // 3. Soft match: subject + from_address within 7 days (skip generic subjects)
  if (subject && channel === 'email') {
    const cleanSubject = subject.replace(/^(Re|Fwd|Odp|PD):\s*/gi, '').trim();
    if (cleanSubject && !GENERIC_SUBJECTS.has(cleanSubject.toLowerCase())) {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await db
        .from('conversations')
        .select('id')
        .eq('from_address', normalizeAddress(fromAddress, 'email'))
        .gte('last_message_at', sevenDaysAgo)
        .ilike('subject', `%${cleanSubject}%`)
        .order('last_message_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) return data.id;
    }
  }

  // 4. SMS: match by address pair within 3-day idle window
  if (channel === 'sms') {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await db
      .from('conversations')
      .select('id')
      .eq('channel', 'sms')
      .eq('from_address', normalizeAddress(fromAddress, 'sms'))
      .gte('last_message_at', threeDaysAgo)
      .order('last_message_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data.id;
  }

  return null; // New thread needed
}

// ── Save inbound message ──────────────────────────────────────

export async function saveInboundMessage(payload: InboundWebhookPayload): Promise<{
  conversationId: string;
  messageId: string;
  isNew: boolean;
} | null> {
  const db = createSupabaseServiceRole();
  const d = payload.data;

  const fromAddress = normalizeAddress(d.from, 'email');
  const toAddress = d.to?.[0] ? normalizeAddress(d.to[0], 'email') : 'unknown';
  const headers = d.headers || {};

  // Resolve thread
  const existingThreadId = await resolveThread(
    'email',
    d.message_id,
    headers['in-reply-to'] || undefined,
    headers['references']?.split(/\s+/) || undefined,
    fromAddress,
    d.subject
  );

  // Resolve mailbox
  const mailboxId = await resolveMailbox(toAddress);

  // Resolve user
  const spfPass = headers['authentication-results']?.includes('spf=pass') ?? undefined;
  const dkimPass = headers['authentication-results']?.includes('dkim=pass') ?? undefined;
  const userResult = await resolveUser(
    fromAddress,
    d.reply_to,
    d.cc,
    spfPass,
    dkimPass
  );

  let conversationId = existingThreadId;
  let isNew = false;

  if (!conversationId) {
    // Create new conversation
    const { data: conv, error } = await db
      .from('conversations')
      .insert({
        mailbox_id: mailboxId,
        channel: 'email',
        subject: d.subject || null,
        from_address: fromAddress,
        from_name: d.from.includes('<') ? d.from.split('<')[0].trim().replace(/"/g, '') : null,
        to_address: toAddress,
        user_id: userResult.userId,
        user_link_verified: userResult.verified,
        user_link_method: userResult.method,
        status: 'open',
      })
      .select('id')
      .single();

    if (error || !conv) return null;
    conversationId = conv.id;
    isNew = true;
  } else {
    // Update existing conversation
    await db
      .from('conversations')
      .update({
        last_message_at: new Date().toISOString(),
        status: 'open', // Re-open on new inbound
        ...(userResult.userId && !isNew ? {} : {}), // Don't overwrite user_id on existing threads
      })
      .eq('id', conversationId);
  }

  // Insert message (ON CONFLICT DO NOTHING for dedup)
  const { data: msg, error: msgError } = await db
    .from('messages')
    .insert({
      conversation_id: conversationId,
      channel: 'email',
      direction: 'inbound',
      from_address: fromAddress,
      to_address: toAddress,
      subject: d.subject || null,
      provider_message_id: d.email_id,
      provider_metadata: { headers, spf_pass: spfPass, dkim_pass: dkimPass },
      smtp_message_id: d.message_id || null,
      smtp_in_reply_to: headers['in-reply-to'] || null,
      smtp_references: headers['references']?.split(/\s+/).filter(Boolean) || [],
      cc: d.cc || [],
      bcc: d.bcc || [],
      has_attachments: (d.attachments?.length || 0) > 0,
      processing_status: 'pending',
    })
    .select('id')
    .single();

  if (msgError) {
    // Likely duplicate (ON CONFLICT)
    if (msgError.code === '23505') return null;
    console.error('Save message error:', msgError);
    return null;
  }

  return { conversationId: conversationId!, messageId: msg.id, isNew };
}

// ── Fetch full email from Resend API ──────────────────────────

export async function fetchFullEmail(resendEmailId: string): Promise<{
  html: string | null;
  text: string | null;
  headers: Record<string, string>;
} | null> {
  try {
    const res = await fetch(`https://api.resend.com/emails/${resendEmailId}`, {
      headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      html: data.html || null,
      text: data.text || null,
      headers: data.headers || {},
    };
  } catch {
    return null;
  }
}

// ── Process attachments → Bunny Storage ───────────────────────

export async function processAttachments(
  resendEmailId: string,
  conversationId: string,
  messageId: string
): Promise<{ filename: string; content_type: string; size: number; bunny_path: string }[]> {
  // Fetch attachment list from Resend
  try {
    const res = await fetch(`https://api.resend.com/emails/${resendEmailId}/attachments`, {
      headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
    });
    if (!res.ok) return [];
    const attachments = await res.json();
    if (!Array.isArray(attachments) || attachments.length === 0) return [];

    const results = [];
    for (const att of attachments) {
      if (!att.download_url) continue;

      // Download content
      const dlRes = await fetch(att.download_url);
      if (!dlRes.ok) continue;
      const buffer = Buffer.from(await dlRes.arrayBuffer());

      // Upload to Bunny (private path)
      const bunnyPath = `email-attachments/${conversationId}/${messageId}/${att.filename}`;
      await uploadFile(bunnyPath, buffer);

      results.push({
        filename: att.filename,
        content_type: att.content_type || 'application/octet-stream',
        size: buffer.length,
        bunny_path: bunnyPath,
      });
    }
    return results;
  } catch {
    return [];
  }
}

// ── Signed URL for attachment access ──────────────────────────

export function getSignedAttachmentUrl(bunnyPath: string): string {
  // Bunny Token Auth or simple CDN URL
  // For now: return CDN URL (Bunny Token Auth can be added when security zone is configured)
  return getCdnUrl(bunnyPath);
}

// ── Rate limit check ──────────────────────────────────────────

export async function checkRateLimit(
  toAddress: string,
  type: 'autoresponder' | 'magic_link',
  cooldownMinutes: number
): Promise<boolean> {
  const db = createSupabaseServiceRole();
  const since = new Date(Date.now() - cooldownMinutes * 60 * 1000).toISOString();

  const { count } = await db
    .from('auto_reply_log')
    .select('id', { count: 'exact', head: true })
    .eq('to_address', toAddress)
    .eq('reply_type', type)
    .gte('sent_at', since);

  return (count || 0) > 0; // true = rate-limited
}

export async function logAutoReply(
  toAddress: string,
  type: 'autoresponder' | 'magic_link',
  autoresponderId?: string
) {
  const db = createSupabaseServiceRole();
  await db.from('auto_reply_log').insert({
    to_address: toAddress,
    reply_type: type,
    autoresponder_id: autoresponderId || null,
  });
}
