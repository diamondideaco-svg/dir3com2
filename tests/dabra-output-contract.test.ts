import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { classifierPrompt } from '../lib/dabra/agent-planner';
import { FIRST_PROFILE_CASE_SET_SHA } from '../lib/dabra/agent-measurement';
import { AGENT_DIALOGUE_PROMPT } from '../lib/dabra/agent-platform-units';
import { canonicalOutputContract, requestOutputContract, profileOutputAccepted, OUTPUT_PARSER_SHA256S,
 CLASSIFIER_PROMPT_SHA256, LEGACY_FIRST_PROFILE_CASE_SET_SHA256, APPROVED_PROFILE_OUTPUT_ACCEPTANCES } from '../lib/dabra/agent-output-contract';
import { PLATFORM_UNITS_QUALIFICATION_CASES } from '../lib/dabra/agent-qualification-cases';
import { syntheticContractMeasurement, syntheticOutputAcceptances } from './fixtures/task217-output-qualification-synthetic';
import { prepareAgentProviderAttempt, PUBLIC_DIALOGUE_DAILY_LIMITS, type AgentDialoguePolicy } from '../lib/dabra/agent-dialogue';
import type { AgentCapabilityProfile } from '../lib/dabra/agent-capabilities';

const now=Date.now(),sha=(s:string)=>createHash('sha256').update(s).digest('hex');
function profile(id:'platform-units-v1'|'general-travel-v1'='platform-units-v1'):AgentCapabilityProfile {
 return {provider:'openai',measurement:{capability:'discover',language:'en',model:'SYNTHETIC',environment:'synthetic',
  ...syntheticContractMeasurement('discover','en',id),sourceSha:'b'.repeat(40),measuredAtMs:now-1,expiresAtMs:now+600000,
  latencyMs:1,inputTokenCeiling:4096,outputTokenCeiling:256,costCeilingUsd:0}};
}
test('closed canonical recipes preserve old caseSet/prompt and bind actual parser bytes',()=>{
 assert.equal(FIRST_PROFILE_CASE_SET_SHA,LEGACY_FIRST_PROFILE_CASE_SET_SHA256);assert.equal(sha(classifierPrompt),CLASSIFIER_PROMPT_SHA256);
 const agent=readFileSync('lib/dabra/agent-contract.ts','utf8').replace(/\r\n/g,'\n');
 const general=readFileSync('lib/dabra/agent-general-travel.ts','utf8').replace(/\r\n/g,'\n');
 const platform=readFileSync('lib/dabra/agent-platform-units.ts','utf8').replace(/\r\n/g,'\n');
 assert.equal(sha(agent.match(/export function parseAgentTool\([\s\S]*?\n}/)![0]),OUTPUT_PARSER_SHA256S['intent-tool-v1']);
 assert.equal(sha(general.slice(general.indexOf('export function parseGeneralTravelAdvice('))),OUTPUT_PARSER_SHA256S['general-travel-v1']);
 assert.equal(sha(platform.slice(platform.indexOf('export function composePublicAgentDialogue('))),OUTPUT_PARSER_SHA256S['platform-units-v1']);
 assert.equal(APPROVED_PROFILE_OUTPUT_ACCEPTANCES.length,0);
 for(const fixed of PLATFORM_UNITS_QUALIFICATION_CASES)assert.equal(requestOutputContract('discover',fixed.language,fixed.prompt,fixed.message)?.id,'platform-units-v1');
});
test('general acceptance cannot alias platform units; profile field/receipt/contract swaps fail closed',()=>{
 const general=profile('general-travel-v1'),units=canonicalOutputContract('platform-units-v1','en');
 assert.equal(profileOutputAccepted(general,units,syntheticOutputAcceptances([general],now),now),false);
 const p=profile(),accepted=syntheticOutputAcceptances([p],now);assert.equal(profileOutputAccepted(p,units,accepted,now),true);
 for(const changed of [
  {...p,provider:'gemini' as const},
  {...p,measurement:{...p.measurement,model:'other'}}, {...p,measurement:{...p.measurement,sourceSha:'c'.repeat(40)}},
  {...p,measurement:{...p.measurement,latencyMs:2}}, {...p,measurement:{...p.measurement,inputTokenCeiling:2048}},
  {...p,measurement:{...p.measurement,measuredAtMs:now-2}}, {...p,measurement:{...p.measurement,caseSetSha:'f'.repeat(64)}},
 ])assert.equal(profileOutputAccepted(changed,units,accepted,now),false);
 const r=accepted[0];for(const bad of [{...r,contractSha256:'f'.repeat(64)},
  {...r,receipt:{...r.receipt,reviewerSession:r.receipt.implementationSession}}, {...r,extra:'ignored-authority'},
  {...r,receipt:{...r.receipt,verdict:'FAIL'}}, {...r,reviewedAtMs:now+1}]) {
  assert.equal(profileOutputAccepted(p,units,[bad as typeof r],now),false);
 }
 assert.equal(profileOutputAccepted(p,units,[...accepted,...accepted],now),false);
});
test('unknown output binding blocks before quota reservation while valid synthetic qualification uses the real gate',async()=>{
 const p=profile();let claims=0;
 const policy:AgentDialoguePolicy={trial:true,environment:'synthetic',profiles:[p],freeProofs:[{provider:p.provider,model:p.measurement.model,
  environment:'synthetic',accountId:'SYNTHETIC',projectId:'SYNTHETIC',evidenceSha256:'c'.repeat(64),credentialSha256:'d'.repeat(64),
  verifiedAtMs:now-1,expiresAtMs:now+600000,quotaWindowStartMs:now-1,quotaWindowEndMs:now+600000,
  billingEnforcement:'provider-hard-free-only',paidFallback:false,remainingRequests:10,remainingInputTokens:40960,remainingOutputTokens:10240}],
  limits:{maxAttempts:1,maxElapsedMs:12000,maxInputTokens:4096,maxOutputTokens:1024,maxCostUsd:0},
  daily:PUBLIC_DIALOGUE_DAILY_LIMITS,admission:{reserve:async()=>{claims++;return 'admitted';}}};
 const context={role:'customer' as const,taskAuthority:{kind:'customer' as const,actorId:'SYNTHETIC',ownerId:'SYNTHETIC'},
  isTaskAuthorityCurrent:async()=>true,readRequests:async()=>({kind:'forbidden' as const})};
 const request={capability:'discover' as const,prompt:AGENT_DIALOGUE_PROMPT,message:JSON.stringify({language:'en',units:['SYNTHETIC question?']}),inputDigestValue:{}};
 assert.equal(await prepareAgentProviderAttempt(context,'en',policy,request,now+10000),null);assert.equal(claims,0);
 const accepted={...policy,outputAcceptances:syntheticOutputAcceptances([p],now)};
 assert.ok(await prepareAgentProviderAttempt(context,'en',accepted,request,now+10000));assert.equal(claims,1);
 assert.equal(requestOutputContract('discover','en','unknown',request.message),null);
 assert.equal(requestOutputContract('discover','en',AGENT_DIALOGUE_PROMPT,JSON.stringify({language:'en',units:['a'],authority:'approve'})),null);
});
