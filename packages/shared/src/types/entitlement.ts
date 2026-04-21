export type EntitlementSource = "web_stripe" | "ios_iap" | "android_billing" | "grant";
export type EntitlementTier = "free" | "basic" | "premium" | "patron";

export interface Entitlement {
  userId: string;
  tier: EntitlementTier;
  source: EntitlementSource;
  activeUntil: string | null;
  renewsAt: string | null;
  isActive: boolean;
}

export function hasAccess(entitlement: Entitlement | null, requiredTier: EntitlementTier): boolean {
  if (requiredTier === "free") return true;
  if (!entitlement?.isActive) return false;
  const order: EntitlementTier[] = ["free", "basic", "premium", "patron"];
  return order.indexOf(entitlement.tier) >= order.indexOf(requiredTier);
}
