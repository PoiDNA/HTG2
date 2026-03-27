import { getStripe } from './stripe';

// ============================================================
// Payout configuration per session type
// ============================================================

// All amounts in grosz (1 PLN = 100 grosz)
export const SESSION_PAYOUT_CONFIG: Record<string, {
  totalAmount: number;
  platformAmount: number;
  assistantAmount: number;
}> = {
  // 1:1 Natalia — 1200 PLN stays 100% on platform
  natalia_solo: {
    totalAmount: 120000,
    platformAmount: 120000,
    assistantAmount: 0,
  },
  // Natalia + Agata — 1600 PLN: 1000 platform + 600 assistant
  natalia_agata: {
    totalAmount: 160000,
    platformAmount: 100000,
    assistantAmount: 60000,
  },
  // Natalia + Justyna — 1600 PLN: 1000 platform + 600 assistant
  natalia_justyna: {
    totalAmount: 160000,
    platformAmount: 100000,
    assistantAmount: 60000,
  },
};

// ============================================================
// Create Connected Account for assistant
// ============================================================

export async function createConnectedAccount(email: string, name: string) {
  const stripe = getStripe();

  const account = await stripe.accounts.create({
    type: 'express',
    country: 'PL',
    email,
    capabilities: {
      transfers: { requested: true },
    },
    business_type: 'individual',
    individual: {
      email,
      first_name: name.split(' ')[0],
      last_name: name.split(' ').slice(1).join(' ') || name,
    },
    metadata: {
      platform: 'htg',
      role: 'assistant',
    },
  });

  return account;
}

// ============================================================
// Generate onboarding link for assistant
// ============================================================

export async function createOnboardingLink(
  accountId: string,
  returnUrl: string,
  refreshUrl: string,
) {
  const stripe = getStripe();

  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: 'account_onboarding',
  });

  return link;
}

// ============================================================
// Check if connected account is fully onboarded
// ============================================================

export async function checkAccountStatus(accountId: string) {
  const stripe = getStripe();
  const account = await stripe.accounts.retrieve(accountId);

  return {
    id: account.id,
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    detailsSubmitted: account.details_submitted,
    requiresAction: (account.requirements?.currently_due?.length ?? 0) > 0,
  };
}

// ============================================================
// Transfer funds to connected account
// ============================================================

export async function transferToAssistant(params: {
  amount: number; // in grosz
  connectedAccountId: string;
  transferGroup: string; // booking ID for grouping
  description: string;
  idempotencyKey: string;
}) {
  const stripe = getStripe();

  const transfer = await stripe.transfers.create(
    {
      amount: params.amount,
      currency: 'pln',
      destination: params.connectedAccountId,
      transfer_group: params.transferGroup,
      description: params.description,
      metadata: {
        platform: 'htg',
        transfer_group: params.transferGroup,
      },
    },
    {
      idempotencyKey: params.idempotencyKey,
    },
  );

  return transfer;
}

// ============================================================
// Get dashboard login link for connected account
// ============================================================

export async function createDashboardLink(accountId: string) {
  const stripe = getStripe();
  const link = await stripe.accounts.createLoginLink(accountId);
  return link;
}

// ============================================================
// List transfers for a connected account
// ============================================================

export async function listTransfers(connectedAccountId: string, limit = 20) {
  const stripe = getStripe();
  const transfers = await stripe.transfers.list({
    destination: connectedAccountId,
    limit,
  });
  return transfers.data;
}
