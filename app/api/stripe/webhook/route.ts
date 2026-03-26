import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { createClient } from '@supabase/supabase-js';
import { sendOrderConfirmation, sendPaymentFailedNotification } from '@/lib/email/resend';

// Use service role for webhook (no user context) — lazy init
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

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
      const { data: order } = await getSupabaseAdmin()
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

        for (const item of lineItems.data) {
          const product = item.price?.product as any;
          const productMetadata = product?.metadata || {};

          // Determine entitlement type and validity
          const entitlementType = productMetadata.entitlement_type || 'purchase';
          const validMonths = parseInt(productMetadata.valid_months || '24', 10);
          const validUntil = new Date();
          validUntil.setMonth(validUntil.getMonth() + validMonths);

          await getSupabaseAdmin().from('entitlements').insert({
            user_id: userId,
            product_id: productMetadata.product_id || null,
            session_id: productMetadata.session_id || null,
            type: entitlementType,
            stripe_subscription_id: session.subscription || null,
            valid_until: validUntil.toISOString(),
          });

          // Order items
          await getSupabaseAdmin().from('order_items').insert({
            order_id: order.id,
            product_id: productMetadata.product_id || null,
            price_id: productMetadata.price_id || null,
          });
        }
      }

      // Log in audit
      await getSupabaseAdmin().from('audit_logs').insert({
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
      await getSupabaseAdmin()
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
