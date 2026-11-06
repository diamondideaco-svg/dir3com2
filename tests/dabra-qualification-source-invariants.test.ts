import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { canonicalOutputContract } from '../lib/dabra/agent-output-contract';
import { PLATFORM_UNITS_QUALIFICATION_CASES, qualificationInputSha256 } from '../lib/dabra/agent-qualification-cases';
import { AGENT_PROVIDER_IDS } from '../lib/dabra/agent-capabilities';
import { APPROVED_DIALOGUE_STANDARD_PRICING } from '../lib/dabra/dialogue-pricing-approvals';
import { approvedPublicPricingContract } from '../lib/dabra/dialogue-pricing-refresh';

const output='supabase/migrations/20261104133500_task217_output_contract_acceptance.sql';
const bootstrap='supabase/migrations/20261104134000_task217_qualification_bootstrap.sql';
const customer='supabase/migrations/20261104130000_task217_customer_case_owner.sql';
const read=(path:string)=>readFileSync(path,'utf8').replace(/\r\n/g,'\n');
// Source invariants only. None of these assertions is PostgreSQL execution or
// proof that the functions install/behave correctly in a real database.
test('new local forward manifest is generated from the actual canonical contracts, inputs and approved pricing',()=>{
 const text=read(output),match=text.match(/\$manifest\$([\s\S]*?)\$manifest\$/);assert.ok(match);
 const manifest=JSON.parse(match[1]);
 assert.deepEqual(manifest.contracts,(['intent-tool-v1','general-travel-v1','platform-units-v1']as const).flatMap(id=>(['ar','en']as const).map(lang=>canonicalOutputContract(id,lang))));
 assert.deepEqual(manifest.cases,PLATFORM_UNITS_QUALIFICATION_CASES.map(c=>({caseId:c.caseId,stage:c.stage,language:c.language,inputSha256:qualificationInputSha256(c),
  contractSha256:canonicalOutputContract('platform-units-v1',c.language).digest,inputBytes:Buffer.byteLength(c.prompt+c.message,'utf8')+128})));
 assert.deepEqual(manifest.pricing,AGENT_PROVIDER_IDS.map(provider=>{
  const r=APPROVED_DIALOGUE_STANDARD_PRICING.find(r=>r.provider===provider&&approvedPublicPricingContract(provider,r.model,r.sha256));assert.ok(r);
  return {provider,model:r.model,pricingEvidenceSha256:r.sha256,...approvedPublicPricingContract(provider,r.model,r.sha256)};
 }));
});
test('ordinary reserve and grant guard bodies are retained under the narrow new qualification branch',()=>{
 const old=read('supabase/migrations/20261103205926_task217_durable_account_charge.sql'),next=read(bootstrap);
 const reserve=/CREATE OR REPLACE FUNCTION public\.reserve_dabra_dialogue_attempt\([\s\S]*?\nEND \$\$;/;
 const oldReserve=old.match(reserve)?.[0],newReserve=next.match(reserve)?.[0];assert.ok(oldReserve&&newReserve);
 const strip=newReserve.replace(/\n IF p_proof->>'mode'='bounded-account-qualification' THEN\n[\s\S]*?\n END IF;\n/,'');
 assert.equal(strip,oldReserve);
 const grant=/CREATE OR REPLACE FUNCTION private\.protect_dabra_dialogue_grant\(\)[\s\S]*?\nEND \$\$;/;
 const before=old.match(grant)?.[0],after=next.match(grant)?.[0];assert.ok(before&&after);
 assert.ok(after.endsWith(before.slice(before.indexOf(' PERFORM pg_advisory_xact_lock'))));
});
test('three new forwards have exact registry hashes, denied Production application and balanced dollar delimiters',()=>{
 const registry:Record<string,unknown>[]=JSON.parse(read('docs/post-cutover-migrations.json'));assert.ok(Array.isArray(registry));
 for(const path of [customer,output,bootstrap]){
  const bytes=readFileSync(path);const items:Record<string,unknown>[]=registry.filter(r=>r.path===path);assert.equal(items.length,1);assert.equal(items[0].production_apply_authorized,false);
  assert.equal(items[0].sha256,createHash('sha256').update(bytes).digest('hex'));const sql=bytes.toString('utf8');
  assert.doesNotMatch(sql,/END \$;/);const delimiters=sql.match(/\$(?:[a-z_][a-z0-9_]*)?\$/gi)??[];
  for(const tag of new Set(delimiters))assert.equal(delimiters.filter(t=>t===tag).length%2,0,tag);
 }
});
