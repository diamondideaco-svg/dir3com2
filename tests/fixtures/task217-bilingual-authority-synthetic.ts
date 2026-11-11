// Disposable/local evidence only. Never an operator approval or production plan.
import { createHash, randomUUID } from 'node:crypto';
import { AGENT_PROVIDER_IDS, type AgentProviderId } from '../../lib/dabra/agent-capabilities';
import { APPROVED_DIALOGUE_STANDARD_PRICING } from '../../lib/dabra/dialogue-pricing-approvals';
import { approvedPublicPricingContract } from '../../lib/dabra/dialogue-pricing-refresh';
import { qualificationRecipe, qualificationAuthorityBindingSha256, type QualificationAccountChargeProof } from '../../lib/dabra/dialogue-qualification';
import { qualificationInputSha256 } from '../../lib/dabra/agent-qualification-cases';
import { canonicalOutputContract } from '../../lib/dabra/agent-output-contract';
import { fundingSubject } from '../../lib/dabra/dialogue-funding';
import { BILINGUAL_QUALIFICATION_DAILY, bilingualQualificationBindingSha256, qualificationPlanFactsSha256, type BilingualQualificationAuthority } from '../../lib/dabra/qualification-authority';

export const bilingualSubject='SYNTHETIC-BILINGUAL';
export const bilingualSource='a'.repeat(40);
export const bilingualCredential='SYNTHETIC-BILINGUAL-NOT-A-SECRET';
export function syntheticBilingualAuthority(now=Date.now(), baseline: BilingualQualificationAuthority['baseline']={
  ledgerSha256:'b'.repeat(64), attempts:13,heldCostMicros:141870,
  providerAttempts:{openai:6,gemini:0,anthropic:7,xai:0,deepseek:0,qwen:0,mistral:0},
}, extras: Readonly<Record<AgentProviderId,number>>={openai:0,gemini:0,anthropic:0,xai:0,deepseek:0,qwen:0,mistral:0}, maxCostMicros=1000000) {
  const authorizationId=randomUUID(),authorizedAtMs=now-1,expiresAtMs=now+1800000;
  const recipe=qualificationRecipe('task217-platform-dialogue-measurement-v2');if(!recipe)throw Error('recipe');
  let proofs: QualificationAccountChargeProof[]=AGENT_PROVIDER_IDS.map(provider=>{
    const rate=APPROVED_DIALOGUE_STANDARD_PRICING.find(r=>r.provider===provider&&approvedPublicPricingContract(provider,r.model,r.sha256));
    if(!rate)throw Error('pricing');const price=approvedPublicPricingContract(provider,rate.model,rate.sha256);if(!price)throw Error('pricing');
    return {mode:'bounded-account-qualification',grantId:randomUUID(),provider,model:rate.model,environment:'provider-benchmark',
      accountId:'SYNTHETIC-account',projectId:'SYNTHETIC-project',credentialSha256:createHash('sha256').update(bilingualCredential).digest('hex'),
      evidenceSha256:'c'.repeat(64),currency:'USD',serviceTier:'standard',pricingEvidenceSha256:rate.sha256,
      accountTerms:{schema:'task217-account-charge-terms-v1',observedAtMs:now-2,evidenceSha256:'d'.repeat(64),validity:'until-contract-change',
        risks:{autoReload:'off',postpaid:'blocked',overdraft:'blocked',concurrentAccountUsage:'bounded'},
        fundingChargeProtection:{kind:'documented-manual-funding-only',evidenceSha256:'e'.repeat(64)},
        allInChargeBound:{schema:'all-in-account-charge-bound-v1',currency:'USD',coverage:'all-applicable-api-tax-fx-and-funding-charges',maxAdditionalMicros:extras[provider],evidenceSha256:'f'.repeat(64)}},
      limitedOperation:{schema:'task217-profile-qualification-authority-v2',authorizationId,taskId:'task217-text-pilot-2026-11-01',dataScope:'canonical-synthetic-measurement',
        authorizedAtMs,maxCostMicros,maxAttempts:baseline.attempts+56,contractSha256:price.digest,authoritySha256:'0'.repeat(64),bindingSha256:'0'.repeat(64),
        permit:{schema:'task217-platform-dialogue-measurement-v2',purpose:'profile-qualification',planId:randomUUID(),sourceSha:bilingualSource,
          caseSetSha:recipe.caseSetSha,subjectHash:fundingSubject(bilingualSubject),languages:['ar','en'],authorizedAtMs,expiresAtMs,
          inputTokenCeiling:4096,outputTokenCeiling:1024,cases:recipe.cases.map(c=>({caseId:c.caseId,requestId:randomUUID(),stage:c.stage,language:c.language,
            inputSha256:qualificationInputSha256(c),contractSha256:canonicalOutputContract('platform-dialogue-v2',c.language).digest}))}}};
  });
  let authority: BilingualQualificationAuthority={schema:'task217-bilingual-qualification-authority-v1',enabled:true,authorizationId,
    approvalEvidenceSha256:'1'.repeat(64),sourceSha:bilingualSource,subjectHash:fundingSubject(bilingualSubject),authorizedAtMs,expiresAtMs,baseline,
    maxAttempts:baseline.attempts+56,maxCostMicros,maxAttemptCostMicros:18432,dailyLimits:BILINGUAL_QUALIFICATION_DAILY,
    runTimeoutMs:120000,plans:proofs.map(p=>({provider:p.provider,grantId:p.grantId,planId:p.limitedOperation.permit.planId,factsSha256:qualificationPlanFactsSha256(p)})),bindingSha256:'0'.repeat(64)};
  authority={...authority,bindingSha256:bilingualQualificationBindingSha256(authority)};
  proofs=proofs.map(p=>{
    if(p.limitedOperation.schema!=='task217-profile-qualification-authority-v2')throw Error('schema');
    const bound: QualificationAccountChargeProof={...p,limitedOperation:{...p.limitedOperation,authoritySha256:authority.bindingSha256}};
    return {...bound,limitedOperation:{...bound.limitedOperation,bindingSha256:qualificationAuthorityBindingSha256(bound)}};
  });
  return {authority,proofs};
}

/** Rebind deliberately altered test plans; never operator evidence. */
export function rebindSyntheticBilingualAuthority(bundle: ReturnType<typeof syntheticBilingualAuthority>) {
  const authority={...bundle.authority,plans:bundle.proofs.map(p=>({provider:p.provider,grantId:p.grantId,
    planId:p.limitedOperation.permit.planId,factsSha256:qualificationPlanFactsSha256(p)}))};
  authority.bindingSha256=bilingualQualificationBindingSha256(authority);
  const proofs=bundle.proofs.map(p=>{
    if(p.limitedOperation.schema!=='task217-profile-qualification-authority-v2')throw Error('schema');
    const next:QualificationAccountChargeProof={...p,limitedOperation:{...p.limitedOperation,authoritySha256:authority.bindingSha256}};
    return {...next,limitedOperation:{...next.limitedOperation,bindingSha256:qualificationAuthorityBindingSha256(next)}};
  });
  return {authority,proofs};
}
