/** Short-lived review choices only. This is never a financial intent, quote,
 * consent, wallet binding or permission to sign. Keep financial recovery keys. */
export type JoinSelection = { quantity: number; requireEarlySlot: boolean; paymentSource: 'ARC_USDC' | 'OTHER_USDC' };
export type JoinDraft = JoinSelection & { version: 1; campaignId: string; termsHash: string; savedAt: number };
const ttl = 30 * 60 * 1000;
const key = (campaignId: string) => 'groupdeal_join_review:v1:' + campaignId;
export const defaultJoinSelection: JoinSelection = { quantity: 1, requireEarlySlot: false, paymentSource: 'ARC_USDC' };
export function readJoinDraft(campaignId: string, storage?: Storage, now = Date.now()): JoinDraft | null {
  try {
    const raw = (storage ?? sessionStorage).getItem(key(campaignId));
    if (!raw || raw.length > 1024) return null;
    const value = JSON.parse(raw);
    if (!value || value.version !== 1 || value.campaignId !== campaignId ||
      Object.keys(value).some(k => !['version','campaignId','termsHash','savedAt','quantity','requireEarlySlot','paymentSource'].includes(k)) ||
      !/^0x[\da-f]{64}$/i.test(value.termsHash) || !Number.isSafeInteger(value.savedAt) || value.savedAt > now || now - value.savedAt > ttl ||
      !Number.isSafeInteger(value.quantity) || value.quantity < 1 || value.quantity > 1_000_000 || typeof value.requireEarlySlot !== 'boolean' ||
      !['ARC_USDC','OTHER_USDC'].includes(value.paymentSource)) return null;
    return value;
  } catch { return null; }
}
export function saveJoinDraft(campaignId: string, termsHash: string, selection: JoinSelection, storage?: Storage): boolean {
  const draft: JoinDraft = { version: 1, campaignId, termsHash, savedAt: Date.now(), quantity: selection.quantity,
    requireEarlySlot: selection.requireEarlySlot, paymentSource: selection.paymentSource };
  try {
    const target = storage ?? sessionStorage, raw = JSON.stringify(draft);
    // Reuse the strict reader without touching browser storage during validation.
    if (!readJoinDraft(campaignId, { getItem: () => raw } as unknown as Storage, draft.savedAt)) return false;
    target.setItem(key(campaignId), raw); return target.getItem(key(campaignId)) === raw;
  } catch { return false; }
}
export function clearJoinDraft(campaignId: string, storage?: Storage) {
  try { (storage ?? sessionStorage).removeItem(key(campaignId)); } catch { /* Review storage is optional. */ }
}
export function fitJoinSelection(selection: JoinSelection, campaign: { maxPerAccount: number; inventoryLimit: number; totalUnitsCommitted: number; earlyRebateEnabled: boolean }): JoinSelection {
  const remaining = campaign.inventoryLimit > 0 ? Math.max(0, campaign.inventoryLimit - campaign.totalUnitsCommitted) : campaign.maxPerAccount;
  const limit = Math.max(1, Math.min(campaign.maxPerAccount, remaining));
  return { quantity: Math.min(selection.quantity, limit), requireEarlySlot: campaign.earlyRebateEnabled && selection.requireEarlySlot,
    paymentSource: selection.paymentSource };
}
