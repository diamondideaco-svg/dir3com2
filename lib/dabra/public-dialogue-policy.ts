import type { AgentContext } from './agent-contract';

/** A separate accounting scope. It never renews or replaces the historical pilot. */
export const PUBLIC_DIALOGUE_POLICY = Object.freeze({
  id: 'dabra-public-monthly-v1', currency: 'USD', timeZone: 'Asia/Riyadh',
  monthlyCostMicros: 25_000_000, accountMonthlyCostMicros: 250_000,
  accountMonthlyRequests: 100, accountDailyRequests: 10,
} as const);

/** The canonical context supplies identity; eligibility never changes the actor's role. */
export function publicDialogueActor(context: AgentContext): string | null {
  if (context.taskAuthorityFailure || !context.isTaskAuthorityCurrent) return null;
  const a=context.taskAuthority;
  if (!a || a.kind==='guest' || !/^[a-zA-Z0-9_-]{1,128}$/.test(a.actorId)) return null;
  if (a.kind==='customer') return context.role==='customer' && a.ownerId===a.actorId ? a.actorId : null;
  if (a.kind==='partner') return context.role==='partner' ? a.actorId : null;
  return context.role===a.role && ['staff','admin','ceo'].includes(context.role) ? a.actorId : null;
}

/** Diagnostic/test parity only; the database, never this function, chooses reservation windows. */
export function publicDialogueCalendar(nowMs: number) {
  if (!Number.isSafeInteger(nowMs) || nowMs<0 || nowMs>8_000_000_000_000_000) throw new Error('DIALOGUE_CLOCK_INVALID');
  const shifted=new Date(nowMs+10_800_000);
  const year=shifted.getUTCFullYear(),month=shifted.getUTCMonth();
  return Object.freeze({
    dayStartMs:Math.floor((nowMs+10_800_000)/86_400_000)*86_400_000-10_800_000,
    monthStartMs:Date.UTC(year,month,1)-10_800_000,
    monthEndMs:Date.UTC(year,month+1,1)-10_800_000,
  });
}

export type PublicDialogueUsage = Readonly<{
  monthlyCostMicros:number; accountMonthlyCostMicros:number;
  accountMonthlyRequests:number; accountDailyRequests:number;
}>;
/** Conservative holds count failures/unknowns. This helper neither reserves nor releases anything. */
export function publicDialogueBudgetAllows(usage:PublicDialogueUsage,costMicros:number) {
  return Object.values(usage).every(n=>Number.isSafeInteger(n)&&n>=0)
    && Number.isSafeInteger(costMicros)&&costMicros>0
    && costMicros<=PUBLIC_DIALOGUE_POLICY.accountMonthlyCostMicros
    && usage.monthlyCostMicros+costMicros<=PUBLIC_DIALOGUE_POLICY.monthlyCostMicros
    && usage.accountMonthlyCostMicros+costMicros<=PUBLIC_DIALOGUE_POLICY.accountMonthlyCostMicros
    && usage.accountMonthlyRequests<PUBLIC_DIALOGUE_POLICY.accountMonthlyRequests
    && usage.accountDailyRequests<PUBLIC_DIALOGUE_POLICY.accountDailyRequests;
}
