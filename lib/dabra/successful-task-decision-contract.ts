import 'server-only';
import type { SuccessfulTaskCoreDecisions } from './successful-task-core-decisions';

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const ref = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/.test(v);
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));

/** Explicit decision data, never defaults. These values are not an admission
 * receipt: Core must revalidate their original documents inside each mutation.
 */
export type SuccessfulTaskExecutionTerms = Readonly<{
  actorId: string; role: string; revision: string;
  spendingVersion: 1 | 2 | 3; modelTier: 'economy' | 'strong';
  answerRetentionMs: number; consentVersion: string; consentSha256: string; consentGeneration: number;
  deletionPolicy: string; purgeWithinMs: number; backupPolicy: string;
  grantId: string; dailySuccesses: number; monthlySuccesses: number;
  accountMonthlyCostMicros: number; monthlyCostMicros: number; attemptCostMicros: number;
  inputTokenCeiling: number; outputTokenCeiling: number; leaseMs: number;
}>;

export function interpretSuccessfulTaskDecisions(bundle: SuccessfulTaskCoreDecisions): SuccessfulTaskExecutionTerms | null {
  try {
    const documents = Object.fromEntries(['retention', 'consent', 'deletion', 'audience', 'spending'].map(kind => {
      const decision = bundle.decisions[kind];
      return [kind, record(decision) && record(decision.document) ? decision.document : null];
    }));
    const { retention: r, consent: c, deletion: d, audience: a, spending: s } = documents;
    if (!r || !c || !d || !a || !s) return null;
    if (!exact(r, ['schema', 'answerRetentionMs']) || r.schema !== 'dabra-answer-retention-v1' || !positive(r.answerRetentionMs) || r.answerRetentionMs > Number.MAX_SAFE_INTEGER - Date.now()) return null;
    if (!exact(c, ['schema', 'actorId', 'revision', 'noticeVersion', 'noticeSha256', 'grantedAtMs', 'generation'])
      || c.schema !== 'dabra-answer-consent-v1' || c.actorId !== bundle.actorId || c.revision !== bundle.revision
      || !ref(c.noticeVersion) || c.noticeVersion === 'task187-v1'
      || typeof c.noticeSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(c.noticeSha256)
      || !positive(c.grantedAtMs) || c.grantedAtMs > Date.now()
      || typeof c.generation !== 'number' || !Number.isSafeInteger(c.generation) || c.generation < 0) return null;
    const receipt = bundle.decisions.consent;
    if (!record(receipt) || receipt.approvedAtMs !== c.grantedAtMs || receipt.approvedBy !== bundle.actorId) return null;
    if (!exact(d, ['schema', 'policyReference', 'purgeWithinMs', 'backupPolicyReference'])
      || d.schema !== 'dabra-answer-deletion-v1' || !ref(d.policyReference) || !positive(d.purgeWithinMs) || !ref(d.backupPolicyReference)) return null;
    if (!exact(a, ['schema', 'actorId', 'role', 'revision']) || a.schema !== 'dabra-task-audience-v1'
      || a.actorId !== bundle.actorId || a.role !== bundle.role || a.revision !== bundle.revision) return null;
    const numbers = ['dailySuccesses', 'monthlySuccesses', 'accountMonthlyCostMicros', 'monthlyCostMicros', 'attemptCostMicros', 'inputTokenCeiling', 'outputTokenCeiling', 'leaseMs'];
    const spending = bundle.decisions.spending;
    const v2 = s.schema === 'dabra-task-spending-v2';
    const v3 = s.schema === 'dabra-task-spending-v3';
    const tiered = v2 || v3;
    if (!exact(s, ['schema', 'currency', 'timeZone', 'grantId', 'maxAttempts', ...numbers,
      ...(tiered ? ['modelTier'] : []), ...(v3 ? ['grantBindings'] : [])])
      || (!tiered && s.schema !== 'dabra-task-spending-v1') || (tiered && s.modelTier !== 'economy' && s.modelTier !== 'strong')
      || s.currency !== 'USD' || s.timeZone !== 'Asia/Riyadh' || s.maxAttempts !== 1
      || !record(spending) || s.grantId !== spending.fundingGrantId || typeof s.grantId !== 'string'
      || !numbers.every(key => positive(s[key]))) return null;
    if (v3) {
      if (!Array.isArray(s.grantBindings) || s.grantBindings.length < 1 || s.grantBindings.length > 7) return null;
      let previous = '', anchor = false;
      for (const binding of s.grantBindings) {
        if (!record(binding) || !exact(binding, ['grantId', 'proofSha256'])
          || typeof binding.grantId !== 'string'
          || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(binding.grantId)
          || typeof binding.proofSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(binding.proofSha256)
          || (previous !== '' && previous >= binding.grantId)) return null;
        if (binding.grantId === s.grantId && binding.proofSha256 === spending.fundingProofSha256) anchor = true;
        previous = binding.grantId;
      }
      if (!anchor) return null;
    }
    const n = s as Record<string, number>;
    // Existing execution capability bounds, not selected live quotas or defaults.
    if (n.dailySuccesses > 10 || n.monthlySuccesses > 50 || n.accountMonthlyCostMicros > 500000 || n.monthlyCostMicros > 25000000
      || n.dailySuccesses > n.monthlySuccesses || n.attemptCostMicros > n.accountMonthlyCostMicros
      || n.accountMonthlyCostMicros > n.monthlyCostMicros || n.attemptCostMicros > 250000
      || n.inputTokenCeiling > 4096 || n.outputTokenCeiling > 1024 || n.leaseMs > 12000) return null;
    return Object.freeze({ actorId: bundle.actorId, role: bundle.role, revision: bundle.revision,
      spendingVersion: v3 ? 3 : v2 ? 2 : 1, modelTier: tiered ? s.modelTier as 'economy' | 'strong' : 'economy',
      answerRetentionMs: r.answerRetentionMs, consentVersion: c.noticeVersion, consentSha256: c.noticeSha256,
      consentGeneration: c.generation, deletionPolicy: d.policyReference, purgeWithinMs: d.purgeWithinMs,
      backupPolicy: d.backupPolicyReference, grantId: s.grantId,
      dailySuccesses: n.dailySuccesses, monthlySuccesses: n.monthlySuccesses,
      accountMonthlyCostMicros: n.accountMonthlyCostMicros, monthlyCostMicros: n.monthlyCostMicros,
      attemptCostMicros: n.attemptCostMicros, inputTokenCeiling: n.inputTokenCeiling,
      outputTokenCeiling: n.outputTokenCeiling, leaseMs: n.leaseMs });
  } catch { return null; }
}
