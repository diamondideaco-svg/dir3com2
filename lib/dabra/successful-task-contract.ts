/** Task237 development contract. This is not an activation or a retention consent. */
export const SUCCESSFUL_TASK_POLICY = Object.freeze({
  id: 'dabra-successful-task-development-v1', currency: 'USD', timeZone: 'Asia/Riyadh',
  accountDailySuccesses: 10, accountMonthlySuccesses: 50,
  accountMonthlyCostMicros: 500_000, monthlyCostMicros: 25_000_000,
  attemptCostMicros: 250_000, maxAttempts: 1,
  leaseMs: 12_000, replayRetentionMs: 86_400_000,
  retentionBasis: 'development-assumption-synthetic-only',
  runtimeEnabled: false,
} as const);

export type SuccessfulTaskState = 'pending' | 'succeeded' | 'failed' | 'unknown';
/** Server accounting input. Platform-wide usage must not enter the client allowance. */
export type SuccessfulTaskUsage = Readonly<{
  dailySucceeded: number; monthlySucceeded: number;
  dailyPending: number; monthlyPending: number;
  accountHeldCostMicros: number; totalHeldCostMicros: number;
}>;
export function successfulTaskAllowance(usage: SuccessfulTaskUsage) {
  if (![usage.dailySucceeded, usage.monthlySucceeded, usage.dailyPending, usage.monthlyPending, usage.accountHeldCostMicros, usage.totalHeldCostMicros]
    .every(n => Number.isSafeInteger(n) && n >= 0) || usage.dailySucceeded > usage.monthlySucceeded || usage.dailyPending > usage.monthlyPending) return null;
  const p = SUCCESSFUL_TASK_POLICY;
  return Object.freeze({
    dailyRemaining: Math.max(0, p.accountDailySuccesses - usage.dailySucceeded - usage.dailyPending),
    monthlyRemaining: Math.max(0, p.accountMonthlySuccesses - usage.monthlySucceeded - usage.monthlyPending),
    dailyPending: usage.dailyPending, monthlyPending: usage.monthlyPending,
    accountHeldCostMicros: usage.accountHeldCostMicros,
    costAvailable: usage.accountHeldCostMicros < p.accountMonthlyCostMicros && usage.totalHeldCostMicros < p.monthlyCostMicros,
  });
}
export type SuccessfulTaskAllowance = NonNullable<ReturnType<typeof successfulTaskAllowance>>;
/** The remaining task count is not a promise of sufficient funding for the next call. */
export function successfulTaskAllowanceText(value: SuccessfulTaskAllowance, locale: 'ar' | 'en') {
  return locale === 'ar'
    ? `المهام الناجحة المتاحة: ${value.dailyRemaining} اليوم، ${value.monthlyRemaining} هذا الشهر. قيد المعالجة: ${value.dailyPending} اليوم، ${value.monthlyPending} هذا الشهر. ${value.costAvailable ? 'تخضع كل محاولة للميزانية المتبقية.' : 'ميزانية الذكاء الاصطناعي غير متاحة حاليًا.'} تكلفة المحاولات الفاشلة تظل محسوبة. رحلاتك المحفوظة متاحة.`
    : `Successful tasks available: ${value.dailyRemaining} today, ${value.monthlyRemaining} this month. Pending: ${value.dailyPending} today, ${value.monthlyPending} this month. ${value.costAvailable ? 'Each attempt also requires available budget.' : 'AI budget is currently unavailable.'} Failed attempts still retain their cost. Saved trips remain available.`;
}

/** Header is display-only, never admission/identity authority. Reject malformed or oversized values. */
export function parseSuccessfulTaskAllowance(raw: string | null): SuccessfulTaskAllowance | null {
  if (!raw || raw.length > 1024) return null;
  try {
    const value = JSON.parse(raw);
    const numbers = ['dailyRemaining', 'monthlyRemaining', 'dailyPending', 'monthlyPending', 'accountHeldCostMicros'];
    if (!value || Object.keys(value).length !== 6 || typeof value.costAvailable !== 'boolean'
      || !numbers.every(key => Number.isSafeInteger(value[key]) && value[key] >= 0)
      || value.dailyRemaining > 10 || value.monthlyRemaining > 50 || value.dailyPending > 10 || value.monthlyPending > 50) return null;
    return value;
  } catch { return null; }
}
