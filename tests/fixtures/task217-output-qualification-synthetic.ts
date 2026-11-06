// TEST-ONLY qualification data. No receipt here is published or installed in the
// production registry. Runtime functions/tuple hashing/contract matching stay real.
import type { AgentCapabilityProfile } from '../../lib/dabra/agent-capabilities';
import type { AgentDialoguePolicy } from '../../lib/dabra/agent-dialogue';
import { canonicalOutputContract, type AgentOutputContractId, type ProfileOutputAcceptance } from '../../lib/dabra/agent-output-contract';
import { durableProfileSha256 } from '../../lib/dabra/dialogue-durable-authority';

export function syntheticContractMeasurement(capability: 'discover' | 'intent.classify', language: 'ar' | 'en',
 discover: AgentOutputContractId = 'platform-units-v1'): { caseSetSha: string; cases: number; passed: number } {
 const contract = canonicalOutputContract(capability === 'intent.classify' ? 'intent-tool-v1' : discover, language);
 return { caseSetSha: contract.caseSetSha, cases: contract.cases, passed: contract.cases };
}
export function syntheticOutputAcceptances(profiles: readonly AgentCapabilityProfile[], at = Date.now()): readonly ProfileOutputAcceptance[] {
 return profiles.flatMap(p => {
  const m = p.measurement;
  const contracts = (['intent-tool-v1','general-travel-v1','platform-units-v1'] as const)
   .map(id => canonicalOutputContract(id,m.language)).filter(c => c.capability === m.capability && c.caseSetSha === m.caseSetSha);
  return contracts.map(c => ({ schema: 'task217-profile-output-acceptance-v1' as const, profileSha256: durableProfileSha256(p),
   contractSha256: c.digest, sourceSha: m.sourceSha, provider: p.provider, model: m.model, environment: m.environment,
   capability: c.capability, language: m.language, caseSetSha: m.caseSetSha, reviewedAtMs: at,
   receipt: { implementationSession: '11111111-1111-4111-8111-111111111111', reviewerSession: '22222222-2222-4222-8222-222222222222',
    reference: 'https://github.com/diamondideaco-svg/dir3com2/issues/217#issuecomment-999999999',
    artifactSha256: 'e'.repeat(64), verdict: 'PASS' as const, authorship: 'none' as const } }));
 });
}
export function withSyntheticOutputAcceptances<P extends AgentDialoguePolicy>(policy: P, at = Date.now()): P {
 return { ...policy, outputAcceptances: syntheticOutputAcceptances(policy.profiles,at) };
}
