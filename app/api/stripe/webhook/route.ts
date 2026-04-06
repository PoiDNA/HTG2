import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { PRODUCT_SLUGS } from '@/lib/booking/constants';
import { sendOrderConfirmation, sendPaymentFailedNotification, sendGiftNotification } from '@/lib/email/resend';

// ── Pending checkout processor ──────────────────────────────────────────────

type CheckoutResult = 'completed' | 'skipped' | 'failed';

async function processPendingCheckout(
  db: ReturnType<typeof createSupabaseServiceRole>,
  checkoutId: string,
  userId: string,
  orderId: string,
  lineItems: any,
): Promise<CheckoutResult> {
  // 1. Claim: pending/failed -> processing (retry-friendly)
  const { data: checkout } = await db.from('pending_checkouts')
    .update({ status: 'processing', processing_started_at: new Date().toISOString() })
    .eq('id', checkoutId)
    .in('status', ['pending', 'failed'])
    .select()
    .maybeSingle();

  // Reclaim stuck 'processing' after 5 min timeout
  let claimed = checkout;
  if (!claimed) {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: stuck } = await db.from('pending_checkouts')
      .update({ status: 'processing', processing_started_at: new Date().toISOString() })
      .eq('id', checkoutId)
      .eq('status', 'processing')
      .lt('processing_started_at', fiveMinAgo)
      .select()
      .maybeSingle();
    if (!stuck) return 'skipped'; // Already completed or actively processing
    claimed = stuck;
  }

  try {
    const items = claimed.items as {
      sessions?: string[];
      months?: { monthly_set_id: string; month_label: string }[];
    };
    const validUntil = new Date();
    validUntil.setMonth(validUntil.getMonth() + 24);
    const now = new Date().toISOString();

    // 2. Batch fetch existing entitlements (full ownership check)
    const sessionIdsToCheck = items.sessions ?? [];
    const monthSetIdsToCheck = (items.months ?? []).map(m => m.monthly_set_id);

    // Direct session entitlements
    let existingSessionIds = new Set<string>();
    if (sessionIdsToCheck.length > 0) {
      const { data: ownedDirect } = await db.from('entitlements')
        .select('session_id').eq('user_id', userId).eq('type', 'session')
        .eq('is_active', true).gt('valid_until', now)
        .in('session_id', sessionIdsToCheck);
      existingSessionIds = new Set((ownedDirect || []).map(e => e.session_id));

      // Sessions owned via monthly/yearly
      const { data: ownedMonthEnts } = await db.from('entitlements')
        .select('monthly_set_id').eq('user_id', userId)
        .in('type', ['monthly', 'yearly']).eq('is_active', true).gt('valid_until', now)
        .not('monthly_set_id', 'is', null);
      const ownedMonthSetIds = (ownedMonthEnts || []).map(e => e.monthly_set_id);
      if (ownedMonthSetIds.length > 0) {
        const { data: setSessionRows } = await db.from('set_sessions')
          .select('session_id').in('set_id', ownedMonthSetIds);
        for (const r of setSessionRows || []) {
          existingSessionIds.add(r.session_id);
        }
      }
    }

    let existingMonthSetIds = new Set<string>();
    if (monthSetIdsToCheck.length > 0) {
      const { data: ownedMonths } = await db.from('entitlements')
        .select('monthly_set_id, scope_month').eq('user_id', userId)
        .in('type', ['monthly', 'yearly']).eq('is_active', true).gt('valid_until', now);
      existingMonthSetIds = new Set(
        (ownedMonths || []).map(e => e.monthly_set_id).filter(Boolean)
      );
      const existingScopes = new Set(
        (ownedMonths || []).map(e => e.scope_month).filter(Boolean)
      );
      // Also check by scope_month (legacy fallback)
      for (const m of items.months ?? []) {
        if (existingScopes.has(m.month_label)) existingMonthSetIds.add(m.monthly_set_id);
      }
    }

    // 3. Product IDs (batch)
    const [{ data: sessionProd }, { data: monthlyProd }] = await Promise.all([
      db.from('products').select('id').eq('slug', PRODUCT_SLUGS.SINGLE_SESSION).single(),
      db.from('products').select('id').eq('slug', PRODUCT_SLUGS.MONTHLY).single(),
    ]);

    // 4. Build new entitlements (skip existing)
    const newEntitlements: any[] = [];
    for (const sessionId of items.sessions ?? []) {
      if (existingSessionIds.has(sessionId)) continue;
      newEntitlements.push({
        user_id: userId, product_id: sessionProd?.id,
        session_id: sessionId, type: 'session',
        valid_until: validUntil.toISOString(), is_active: true, source: 'stripe',
      });
    }
    for (const month of items.months ?? []) {
      if (existingMonthSetIds.has(month.monthly_set_id)) continue;
      newEntitlements.push({
        user_id: userId, product_id: monthlyProd?.id,
        type: 'monthly', scope_month: month.month_label,
        monthly_set_id: month.monthly_set_id,
        valid_from: `${month.month_label}-01`,
        valid_until: validUntil.toISOString(), is_active: true, source: 'stripe',
      });
    }

    // 5. Batch insert entitlements
    if (newEntitlements.length > 0) {
      await db.from('entitlements').insert(newEntitlements);
    }

    // 6. Order items — deduplicated
    const { data: existingItems } = await db.from('order_items')
      .select('price_id').eq('order_id', orderId);
    const existingPriceIds = new Set((existingItems || []).map(i => i.price_id).filter(Boolean));
    const newOrderItems = lineItems.data
      .filter((item: any) => !existingPriceIds.has(item.price?.id))
      .map((item: any) => ({
        order_id: orderId,
        product_id: (item.price?.product as any)?.metadata?.product_id || null,
        price_id: item.price?.id || null,
      }));
    if (newOrderItems.length > 0) {
      await db.from('order_items').insert(newOrderItems);
    }

    // 7. Mark completed
    await db.from('pending_checkouts')
      .update({ status: 'completed', processed_at: new Date().toISOString() })
      .eq('id', checkoutId);

    return 'completed';
  } catch (err) {
    await db.from('pending_checkouts')
      .update({ status: 'failed' })
      .eq('id', checkoutId);
    console.error('Checkout processing failed:', checkoutId, err);
    return 'failed';
  }
}

// ── Main webhook handler ────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature')!;

  let event;
  try {
    event = getStripe().webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const userId = session.metadata?.supabase_user_id;

      if (!userId) break;

      const db = createSupabaseServiceRole();

      // ── Get or create order (retry-safe) ──
      let order: { id: string } | null = null;
      let isFirstInsert = false;

      const { data: newOrder, error: orderErr } = await db.from('orders').insert({
        user_id: userId,
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: session.payment_intent,
        stripe_invoice_id: session.invoice,
        status: 'paid',
        total_amount: session.amount_total || 0,
        currency: session.currency || 'pln',
      }).select('id').single();

      if (orderErr) {
        if (orderErr.code === '23505') {
          // Duplicate — order already exists (webhook retry)
          const { data: existing } = await db.from('orders')
            .select('id').eq('stripe_checkout_session_id', session.id).single();
          order = existing;
          isFirstInsert = false;
        } else {
          // Other DB error — throw to force 500 so Stripe retries
          throw orderErr;
        }
      } else {
        order = newOrder;
        isFirstInsert = true;
      }

      // Retrieve line items
      const lineItems = await getStripe().checkout.sessions.listLineItems(
        session.id, { expand: ['data.price.product'] }
      );

      let checkoutResult: CheckoutResult = 'skipped';

      if (order) {
        const checkoutId = session.metadata?.checkout_id;

        if (checkoutId) {
          // ── NEW: pending_checkouts flow ──
          checkoutResult = await processPendingCheckout(db, checkoutId, userId, order.id, lineItems);
        } else if (isFirstInsert) {
          // ── EXISTING: yearly, pre_session, generic (only on first insert) ──
          try {
            const purchaseType = session.metadata?.purchase_type;
            const selectedMonthsRaw = session.metadata?.selected_months;

            // Handle yearly subscription with selected months
            if (purchaseType === 'yearly' && selectedMonthsRaw) {
              const selectedMonths: string[] = JSON.parse(selectedMonthsRaw);
              const validUntil = new Date();
              validUntil.setMonth(validUntil.getMonth() + 24);

              const { data: yearlyProduct } = await db
                .from('products').select('id').eq('slug', PRODUCT_SLUGS.YEARLY).single();

              for (const monthLabel of selectedMonths) {
                const { data: monthSet } = await db
                  .from('monthly_sets').select('id').eq('month_label', monthLabel).maybeSingle();

                const { data: existing } = await db.from('entitlements')
                  .select('id').eq('user_id', userId).eq('scope_month', monthLabel)
                  .eq('type', 'yearly').maybeSingle();

                if (!existing) {
                  await db.from('entitlements').insert({
                    user_id: userId,
                    product_id: yearlyProduct?.id || null,
                    type: 'yearly',
                    scope_month: monthLabel,
                    monthly_set_id: monthSet?.id || null,
                    valid_from: `${monthLabel}-01`,
                    valid_until: validUntil.toISOString(),
                    is_active: true,
                    source: 'stripe',
                  });
                }
              }

              await db.from('order_items').insert({
                order_id: order.id,
                product_id: yearlyProduct?.id || null,
              });
            }

            // Handle pre-session meeting add-on
            const preSessionStaffId = session.metadata?.pre_session_staff_id;
            if (preSessionStaffId) {
              await db.from('pre_session_eligibility').insert({
                user_id: userId,
                staff_member_id: preSessionStaffId,
                source_booking_id: session.metadata?.pre_session_source_booking_id || null,
                granted_by: null,
                is_active: true,
                meeting_booked: false,
                payment_type: 'paid',
                order_id: order.id,
              }).select().single();
            }

            // Generic line items
            for (const item of lineItems.data) {
              const product = item.price?.product as any;
              const productMetadata = product?.metadata || {};

              if (productMetadata.type === 'pre_session') continue;

              const entitlementType = productMetadata.entitlement_type || 'purchase';
              const validMonths = parseInt(productMetadata.valid_months || '24', 10);
              const validUntil = new Date();
              validUntil.setMonth(validUntil.getMonth() + validMonths);

              const { data: newEntitlement } = await db.from('entitlements').insert({
                user_id: userId,
                product_id: productMetadata.product_id || null,
                session_id: productMetadata.session_id || null,
                type: entitlementType,
                stripe_subscription_id: session.subscription || null,
                valid_until: validUntil.toISOString(),
              }).select('id').single();

              // Gift handling
              const giftEmail = session.metadata?.gift_for_email;
              if (giftEmail && newEntitlement?.id) {
                const { data: recipientProfile } = await db
                  .from('profiles').select('id').eq('email', giftEmail.toLowerCase()).maybeSingle();

                const { data: giftRecord } = await db.from('session_gifts').insert({
                  entitlement_id: newEntitlement.id,
                  purchased_by: userId,
                  recipient_email: giftEmail.toLowerCase(),
                  recipient_user_id: recipientProfile?.id ?? null,
                  message: session.metadata?.gift_message || null,
                  status: 'pending',
                }).select('claim_token').single();

                if (giftRecord?.claim_token) {
                  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://htgcyou.com';
                  const claimUrl = `${baseUrl}/pl/konto/odbierz-prezent/${giftRecord.claim_token}`;
                  const senderName = session.customer_details?.name || session.customer_details?.email?.split('@')[0] || 'Nadawca';
                  const productNameForGift = lineItems.data.map((i: any) => i.description).join(', ') || 'Sesja HTG';
                  try {
                    await sendGiftNotification(giftEmail.toLowerCase(), {
                      recipientName: giftEmail.split('@')[0],
                      senderName,
                      productName: productNameForGift,
                      message: session.metadata?.gift_message || undefined,
                      claimUrl,
                    });
                  } catch (e) { console.error('Gift email failed:', e); }
                }
              }

              // Order items
              await db.from('order_items').insert({
                order_id: order.id,
                product_id: productMetadata.product_id || null,
                price_id: productMetadata.price_id || null,
              });
            }

            checkoutResult = 'completed';
          } catch (e) {
            console.error('Legacy checkout processing failed:', e);
            checkoutResult = 'failed';
          }
        }
        // else: isFirstInsert=false and no checkoutId → skipped (retry of legacy)
      }

      // Audit log + email — ONLY on first successful processing
      if (checkoutResult === 'completed') {
        await db.from('audit_logs').insert({
          user_id: userId,
          action: 'purchase_completed',
          entity_type: 'order',
          entity_id: order?.id,
          metadata: { stripe_session_id: session.id },
        });

        try {
          const email = session.customer_details?.email || session.customer_email;
          const name = session.customer_details?.name || email?.split('@')[0] || 'Użytkownik';
          const productName = lineItems.data.map((i: any) => i.description).join(', ') || 'Sesja HTG';
          if (email) {
            await sendOrderConfirmation(email, {
              name,
              productName,
              amount: session.amount_total || 0,
              currency: session.currency || 'pln',
            });
          }
        } catch (emailErr) {
          console.error('Failed to send order email:', emailErr);
        }
      }

      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object;

      await createSupabaseServiceRole()
        .from('entitlements')
        .update({ is_active: false })
        .eq('stripe_subscription_id', subscription.id);

      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      console.error('Payment failed for invoice:', invoice.id);

      try {
        const customerEmail = typeof invoice.customer_email === 'string' ? invoice.customer_email : null;
        if (customerEmail) {
          await sendPaymentFailedNotification(customerEmail, {
            name: typeof invoice.customer_name === 'string' ? invoice.customer_name : customerEmail.split('@')[0],
            productName: 'Subskrypcja HTG',
          });
        }
      } catch (emailErr) {
        console.error('Failed to send payment failed email:', emailErr);
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
