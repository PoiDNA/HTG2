import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { fetchFullEmail, processAttachments } from '@/lib/email/hub';
import { getCustomerCard } from '@/lib/email/context';
import { analyzeMessage } from '@/lib/email/ai';
import type { Message } from '@/lib/email/types';

// GET /api/cron/process-messages — async processor (every 1 min via Vercel Cron)
// Claims up to 10 pending messages, processes them in parallel (max 3 AI concurrent)
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = createSupabaseServiceRole();

  // Claim pending messages (FOR UPDATE SKIP LOCKED + zombie reset)
  const { data: messages, error } = await db.rpc('claim_pending_messages', { p_limit: 10 });
  if (error || !messages || messages.length === 0) {
    return NextResponse.json({ processed: 0 });
  }

  // Pre-filter spam: check rate per from_address (>10/h → spam)
  const spamChecked = await Promise.all(
    (messages as Message[]).map(async (msg) => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count } = await db
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('from_address', msg.from_address)
        .gte('created_at', oneHourAgo);

      if ((count || 0) > 10) {
        await db.from('messages').update({ processing_status: 'spam' }).eq('id', msg.id);
        await db.from('conversations').update({ status: 'spam' }).eq('id', msg.conversation_id);
        return null; // Skip
      }
      return msg;
    })
  );

  const validMessages = spamChecked.filter(Boolean) as Message[];

  // Process with concurrency limiter (max 3 concurrent for AI throttling)
  const concurrency = 3;
  let processed = 0;
  let failed = 0;

  for (let i = 0; i < validMessages.length; i += concurrency) {
    const batch = validMessages.slice(i, i + concurrency);
    const results = await Promise.allSettled(batch.map(msg => processOneMessage(db, msg)));
    for (const r of results) {
      if (r.status === 'fulfilled') processed++;
      else failed++;
    }
  }

  return NextResponse.json({
    claimed: messages.length,
    spam: messages.length - validMessages.length,
    processed,
    failed,
  });
}

async function processOneMessage(db: ReturnType<typeof createSupabaseServiceRole>, msg: Message) {
  const stepsDone = (msg.provider_metadata as any)?.steps_done || {};

  try {
    // Step 1: Fetch full email body (idempotent: skip if already done)
    if (!stepsDone.body && msg.provider_message_id) {
      const full = await fetchFullEmail(msg.provider_message_id);
      if (full) {
        await db.from('messages').update({
          body_html: full.html,
          body_text: full.text,
          provider_metadata: {
            ...(msg.provider_metadata || {}),
            steps_done: { ...stepsDone, body: true },
          },
        }).eq('id', msg.id);

        msg.body_html = full.html;
        msg.body_text = full.text;
        stepsDone.body = true;
      }
    }

    // Step 2: Process attachments (idempotent: skip if already done)
    if (!stepsDone.attachments && msg.has_attachments && msg.provider_message_id) {
      const attachmentsMeta = await processAttachments(
        msg.provider_message_id,
        msg.conversation_id,
        msg.id
      );
      if (attachmentsMeta.length > 0) {
        await db.from('messages').update({
          attachments: attachmentsMeta,
          provider_metadata: {
            ...(msg.provider_metadata || {}),
            steps_done: { ...stepsDone, attachments: true },
          },
        }).eq('id', msg.id);
        stepsDone.attachments = true;
      }
    }

    // Step 3: Get conversation to check user verification
    const { data: conv } = await db
      .from('conversations')
      .select('user_id, user_link_verified')
      .eq('id', msg.conversation_id)
      .single();

    // Step 4: Build Customer Card (1 RPC call, PII guard)
    const customerCard = await getCustomerCard(
      msg.from_address,
      conv?.user_id,
      conv?.user_link_verified
    );

    // Step 5: AI analysis (with context)
    const analysis = await analyzeMessage(
      msg.subject,
      msg.body_text,
      customerCard,
      msg.channel
    );

    // Step 6: Update conversation with AI results
    if (analysis) {
      await db.from('conversations').update({
        ai_category: analysis.category,
        ai_sentiment: analysis.sentiment,
        ai_summary: analysis.summary,
        ai_suggested_reply: analysis.suggestedReply,
        priority: analysis.suggestedPriority,
      }).eq('id', msg.conversation_id);
    }

    // Mark done
    await db.from('messages').update({
      processing_status: 'done',
      locked_until: null,
      provider_metadata: {
        ...(msg.provider_metadata || {}),
        steps_done: { ...stepsDone, body: true, attachments: true, ai: true },
      },
    }).eq('id', msg.id);

  } catch (err) {
    console.error(`Process message ${msg.id} failed:`, err);
    const retryCount = (msg.retry_count || 0) + 1;
    await db.from('messages').update({
      processing_status: retryCount >= 3 ? 'failed' : 'pending', // Retry up to 3 times
      retry_count: retryCount,
      locked_until: null,
    }).eq('id', msg.id);
    throw err;
  }
}
