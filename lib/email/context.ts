// ============================================================
// HTG Communication Hub — Customer Card (Context Layer)
// Single RPC call + PII guard for unverified accounts
// ============================================================

import { createSupabaseServiceRole } from '@/lib/supabase/service';
import type { CustomerCard } from './types';

/**
 * Build a Customer Card from the HTG database.
 * If the user is unverified (user_link_verified = false), returns only basic info
 * WITHOUT sensitive data (orders, bookings, entitlements) to prevent PII leaks.
 */
export async function getCustomerCard(
  fromAddress: string,
  userId?: string | null,
  isVerified?: boolean
): Promise<CustomerCard> {
  const db = createSupabaseServiceRole();

  const { data, error } = await db.rpc('get_customer_card', {
    p_address: fromAddress.toLowerCase(),
    p_user_id: userId || null,
  });

  if (error || !data) {
    return { userId: null, email: fromAddress, displayName: null, role: null, createdAt: null, isGuest: true };
  }

  const raw = data as Record<string, any>;

  // Base card (always returned)
  const card: CustomerCard = {
    userId: raw.userId || null,
    email: raw.email || fromAddress,
    displayName: raw.displayName || null,
    role: raw.role || null,
    createdAt: raw.createdAt || null,
    isGuest: raw.isGuest === true,
  };

  // PII guard: only populate sensitive fields when verified
  if (isVerified === true && !raw.isGuest) {
    card.recentOrders = raw.recentOrders || [];
    card.activeEntitlements = raw.activeEntitlements || [];
    card.upcomingBookings = raw.upcomingBookings || [];
    card.totalBookings = raw.totalBookings || 0;
    card.hasActiveSubscription = raw.hasActiveSubscription || false;
    card.recentThreads = raw.recentThreads || [];
  }

  return card;
}

/**
 * Format CustomerCard as a structured text block for AI prompts.
 * Only includes sensitive data if the card has them (i.e., verified user).
 */
export function formatCustomerCardForAI(card: CustomerCard): string {
  if (card.isGuest) {
    return `<karta_klienta>
Gość (brak konta HTG)
Email: ${card.email}
</karta_klienta>`;
  }

  const lines = [
    `Imię: ${card.displayName || 'Brak'}`,
    `Email: ${card.email}`,
    `Rola: ${card.role || 'użytkownik'}`,
    `Konto od: ${card.createdAt ? new Date(card.createdAt).toLocaleDateString('pl-PL') : 'Brak'}`,
  ];

  if (card.hasActiveSubscription !== undefined) {
    lines.push(`Aktywna subskrypcja: ${card.hasActiveSubscription ? 'TAK' : 'NIE'}`);
  }

  if (card.upcomingBookings && card.upcomingBookings.length > 0) {
    lines.push('Nadchodzące sesje:');
    for (const b of card.upcomingBookings.slice(0, 3)) {
      lines.push(`  - ${b.slot_date} ${b.start_time} (${b.session_type}) — ${b.status}`);
    }
  }

  if (card.recentOrders && card.recentOrders.length > 0) {
    lines.push('Ostatnie zamówienia:');
    for (const o of card.recentOrders.slice(0, 3)) {
      lines.push(`  - ${(o.amount / 100).toFixed(0)} PLN — ${o.status} (${new Date(o.created_at).toLocaleDateString('pl-PL')})`);
    }
  }

  if (card.activeEntitlements && card.activeEntitlements.length > 0) {
    lines.push('Aktywne uprawnienia:');
    for (const e of card.activeEntitlements.slice(0, 3)) {
      lines.push(`  - ${e.product_name} — ważne do ${new Date(e.valid_until).toLocaleDateString('pl-PL')}`);
    }
  }

  if (card.totalBookings !== undefined) {
    lines.push(`Łączna liczba rezerwacji: ${card.totalBookings}`);
  }

  if (card.recentThreads && card.recentThreads.length > 0) {
    lines.push('Poprzednie wątki:');
    for (const t of card.recentThreads.slice(0, 3)) {
      lines.push(`  - "${t.subject}" — ${t.status}`);
    }
  }

  return `<karta_klienta>\n${lines.join('\n')}\n</karta_klienta>`;
}
