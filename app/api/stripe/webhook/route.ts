import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { createSupabaseServiceRole } from '@/lib/supabase/service';
import { PRODUCT_SLUGS } from '@/lib/booking/constants';
import { sendOrderConfirmation, sendPaymentFailedNotification, sendGiftNotification } from '@/lib/email/resend';

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

      // Create order
      const { data: order } = await createSupabaseServiceRole()
        .from('orders')
        .insert({
          user_id: userId,
          stripe_checkout_session_id: session.id,
          stripe_payment_intent_id: session.payment_intent,
          stripe_invoice_id: session.invoice,
          status: 'paid',
          total_amount: session.amount_total || 0,
          currency: session.currency || 'pln',
        })
        .select('id')
        .single();

      // Retrieve line items to create entitlements
      const lineItems = await getStripe().checkout.sessions.listLineItems(session.id, { expand: ['data.price.product'] });

      if (order) {
        // ── Handle yearly subscription with selected months ────────────────
        const purchaseType = session.metadata?.purchase_type;
        const selectedMonthsRaw = session.metadata?.selected_months;
        if (purchaseType === 'yearly' && selectedMonthsRaw) {
          try {
            const selectedMonths: string[] = JSON.parse(selectedMonthsRaw);
            const validUntil = new Date();
            validUntil.setMonth(validUntil.getMonth() + 24); // 24-month access

            // Find yearly product
            const { data: yearlyProduct } = await createSupabaseServiceRole()
              .from('products')
              .select('id')
              .eq('slug', PRODUCT_SLUGS.YEARLY)
              .single();

            for (const monthLabel of selectedMonths) {
              // Find monthly_set for this month
              const { data: monthSet } = await createSupabaseServiceRole()
                .from('monthly_sets')
                .select('id')
                .eq('month_label', monthLabel)
                .maybeSingle();

              // Check if entitlement already exists
              const { data: existing } = await createSupabaseServiceRole()
                .from('entitlements')
                .select('id')
                .eq('user_id', userId)
                .eq('scope_month', monthLabel)
                .eq('type', 'yearly')
                .maybeSingle();

              if (!existing) {
                await createSupabaseServiceRole().from('entitlements').insert({
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

            // Create order items
            await createSupabaseServiceRole().from('order_items').insert({
              order_id: order.id,
              product_id: yearlyProduct?.id || null,
            });
          } catch (e) {
            console.error('Failed to process yearly subscription:', e);
          }
        }

        // Handle pre-session meeting add-on (paid eligibility grant)
        const preSessionStaffId = session.metadata?.pre_session_staff_id;
        if (preSessionStaffId) {
          await createSupabaseServiceRole()
            .from('pre_session_eligibility')
            .insert({
              user_id: userId,
              staff_member_id: preSessionStaffId,
              source_booking_id: session.metadata?.pre_session_source_booking_id || null,
              granted_by: null, // system-granted via payment
              is_active: true,
              meeting_booked: false,
              payment_type: 'paid',
              order_id: order.id,
            })
            .select()
            .single();
          // Note: unique index pre_eligibility_paid_order_unique handles webhook retries
        }

        for (const item of lineItems.data) {
          const product = item.price?.product as any;
          const productMetadata = product?.metadata || {};

          // Skip pre-session line items — eligibility already granted above
          if (productMetadata.type === 'pre_session') continue;

          // Determine entitlement type and validity
          const entitlementType = productMetadata.entitlement_type || 'purchase';
          const validMonths = parseInt(productMetadata.valid_months || '24', 10);
          const validUntil = new Date();
          validUntil.setMonth(validUntil.getMonth() + validMonths);

          const { data: newEntitlement } = await createSupabaseServiceRole().from('entitlements').insert({
            user_id: userId,
            product_id: productMetadata.product_id || null,
            session_id: productMetadata.session_id || null,
            type: entitlementType,
            stripe_subscription_id: session.subscription || null,
            valid_until: validUntil.toISOString(),
          }).select('id').single();

          // If this is a gift, create a session_gifts record
          const giftEmail = session.metadata?.gift_for_email;
          if (giftEmail && newEntitlement?.id) {
            // Check if recipient already has an account
            const { data: recipientProfile } = await createSupabaseServiceRole()
              .from('profiles')
              .select('id')
              .eq('email', giftEmail.toLowerCase())
              .maybeSingle();

            const { data: giftRecord } = await createSupabaseServiceRole().from('session_gifts').insert({
              entitlement_id: newEntitlement.id,
              purchased_by: userId,
              recipient_email: giftEmail.toLowerCase(),
              recipient_user_id: recipientProfile?.id ?? null,
              message: session.metadata?.gift_message || null,
              status: 'pending',
            }).select('claim_token').single();

            // Email recipient
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
          await createSupabaseServiceRole().from('order_items').insert({
            order_id: order.id,
            product_id: productMetadata.product_id || null,
            price_id: productMetadata.price_id || null,
          });
        }
      }

      // Log in audit
      await createSupabaseServiceRole().from('audit_logs').insert({
        user_id: userId,
        action: 'purchase_completed',
        entity_type: 'order',
        entity_id: order?.id,
        metadata: { stripe_session_id: session.id },
      });

      // Send order confirmation email
      try {
        const email = session.customer_details?.email || session.customer_email;
        const name = session.customer_details?.name || email?.split('@')[0] || 'Użytkownik';
        const productName = lineItems.data.map(i => i.description).join(', ') || 'Sesja HTG';
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

      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object;

      // Deactivate entitlements linked to this subscription
      await createSupabaseServiceRole()
        .from('entitlements')
        .update({ is_active: false })
        .eq('stripe_subscription_id', subscription.id);

      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      console.error('Payment failed for invoice:', invoice.id);

      // Send payment failed email
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
