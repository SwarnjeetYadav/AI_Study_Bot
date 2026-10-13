import { UsageLedger, User } from '../models';
import { getPlan } from '../config/plans';
export function currentPeriodKey(date = new Date()) { return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}`; }
export async function reserveDocumentQuota(userId: string) {
  const user = await User.findById(userId); if (!user) throw new Error('USER_NOT_FOUND');
  if (user.subscriptionEndsAt && user.subscriptionEndsAt < new Date()) { user.planId = 'free'; user.subscriptionStatus = 'expired'; await user.save(); }
  const plan = getPlan(user.planId); const periodKey = currentPeriodKey();
  const ledger = await UsageLedger.findOneAndUpdate({ userId, periodKey, metric: 'documents' }, { $setOnInsert: { consumed: 0, reserved: 0 } }, { upsert: true, new: true });
  if (ledger.consumed + ledger.reserved >= plan.docsPerMonth) throw new Error('QUOTA_EXCEEDED');
  ledger.reserved += 1; await ledger.save();
  return { plan, periodKey };
}
export async function settleDocumentQuota(userId: string, periodKey: string, success: boolean) {
  const ledger = await UsageLedger.findOne({ userId, periodKey, metric: 'documents' }); if (!ledger) return;
  ledger.reserved = Math.max(0, ledger.reserved - 1); if (success) ledger.consumed += 1; await ledger.save();
}
export async function getUsage(userId: string) {
  const user = await User.findById(userId); if (!user) throw new Error('USER_NOT_FOUND');
  const plan = getPlan(user.planId); const ledger = await UsageLedger.findOne({ userId, periodKey: currentPeriodKey(), metric: 'documents' });
  return { user, plan, used: ledger?.consumed ?? 0, remaining: Math.max(0, plan.docsPerMonth - (ledger?.consumed ?? 0) - (ledger?.reserved ?? 0)) };
}
