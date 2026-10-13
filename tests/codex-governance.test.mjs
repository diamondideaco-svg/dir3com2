import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { generateKeyPairSync, sign } from 'node:crypto';
import { runInNewContext } from 'node:vm';
const require = createRequire(import.meta.url);
const { validate, proof } = require('../.github/scripts/codex-governance.cjs');
const { hash } = require('../.github/scripts/codex-session-proof.cjs');
const keys = generateKeyPairSync('ed25519'); // Ephemeral synthetic authority, never persisted/enrolled.
const owner = '11111111-1111-4111-8111-111111111111', reviewer = '22222222-2222-4222-8222-222222222222', security = '33333333-3333-4333-8333-333333333333';
const sha = 'a'.repeat(40), base = 'b'.repeat(40), repo = 'fixture-owner/fixture-repo';
const now = Date.now();
const workflow = readFileSync('.github/workflows/codex-governance.yml','utf8').replace(/\r\n/g,'\n');
const source = workflow.split('          script: |\n')[1].split('\n').map(line => line.replace(/^ {12}/,'')).join('\n');
function signed(data, key = keys.privateKey) {
  const bytes = Buffer.from(JSON.stringify(data));
  return JSON.stringify({ keyId:'fixture-authority', payload:bytes.toString('base64'), signature:sign(null,bytes,key).toString('base64') });
}
function fixture() {
  const fields = { 'Governance version':'2',Task:'#91','Implementation owner':'Codex Desktop','Independent reviewer':'Codex Desktop','Implementation role':'implementer','Reviewer role':'independent reviewer','Implementation session':owner,'Reviewer session':reviewer,'Reviewer receipt':'101','Governance proof receipt':'100','Evidence scope':'governance-only',Branch:'codex/fixture','Target SHA':sha,'Base SHA':base,Worktree:'/fixture','Last verified result':'focused proof tests','Next action':'assigned non-author review','Verdict':'REVIEW' };
  const issueUrl = 'https://api.github.com/repos/'+repo+'/issues/91';
  const receipts = {};
  const reviews = [['functional',reviewer,101],['security-policy',security,102]].map(([scope,session,id]) => {
    const body = Object.entries({'Governance version':'2',Task:'#91',PR:'#92','Target SHA':sha,'Evidence scope':scope,'Implementation session':owner,'Reviewer session':session,'Reviewer role':'independent reviewer','Reviewer authorship':'none','Review verdict':'PASS'}).map(([k,v])=>'- '+k+': '+v).join('\n');
    receipts[String(id)] = {id,issue_url:issueUrl,body};
    return {scope,session,receipt:id,bodySha256:hash(body),role:'independent reviewer',authorship:'none',verdict:'PASS'};
  });
  const data = {version:2,repository:repo,task:'#91',pr:92,sha,baseSha:base,branch:'codex/fixture',scope:'governance-only',ownerSession:owner,authorSessions:[owner],issuedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+86400000).toISOString(),sessions:[owner,reviewer,security].map(id=>({id,verified:true,surface:'Codex Desktop',source:'independently observed fixture runtime',runtimeEvidenceHash:'c'.repeat(64)})),reviews};
  const input = {prBody:Object.entries(fields).map(([k,v])=>'- '+k+': '+v).join('\n'),issueBody:Object.entries(fields).map(([k,v])=>'## '+(k==='Target SHA'?'Current target SHA':k==='Verdict'?'Current verdict':k)+'\n'+v).join('\n')+'\n## Pull request\n#92',actualBranch:'codex/fixture',actualSha:sha,prNumber:92,taskTitle:'[Codex Task] fixture',taskIsPullRequest:false,repoOwner:'fixture-owner',repoName:'fixture-repo',proofReceipt:{id:100,issue_url:issueUrl,body:signed(data)},reviewReceipts:receipts,trustPolicy:{version:2,requiredScopes:['functional'],authorities:[{id:'fixture-authority',purpose:'session-review',repositories:[repo],publicKey:keys.publicKey.export({type:'spki',format:'pem'})}]},changedFiles:['.github/scripts/codex-governance.cjs'],now};
  return {input,data};
}
function changed(mutator) { const f=fixture(); mutator(f); f.input.proofReceipt.body=signed(f.data); return f.input; }
test('same-surface verified independent sessions and distinct policy review accepted',()=>{
  const result=validate(fixture().input); assert.deepEqual(result.failures,[]); assert.equal(result.decision,'REVIEW_PROVEN'); assert.equal(result.releaseAuthorized,false);
});
test('different app names do not reject genuinely proved sessions',()=>{
  const input=changed(({input,data})=>{ input.prBody=input.prBody.replace('Independent reviewer: Codex Desktop','Independent reviewer: Observed Copilot fixture'); input.issueBody=input.issueBody.replace('## Independent reviewer\nCodex Desktop','## Independent reviewer\nObserved Copilot fixture'); data.sessions[1].surface='Observed Copilot fixture'; });
  assert.deepEqual(validate(input).failures,[]);
});
const denials = [
 ['self-review', f=>{f.data.reviews[0].session=owner;}],
 ['case-insensitive same session', f=>{f.input.prBody=f.input.prBody.replace('Reviewer session: '+reviewer,'Reviewer session: '+owner.toUpperCase());}],
 ['renamed implementation participant', f=>{f.data.authorSessions.push(reviewer);}],
 ['unproved identity', f=>{f.data.sessions[1].verified=false;}],
 ['fabricated session', f=>{f.data.sessions[1].id='unverified';}],
 ['missing runtime provenance', f=>{delete f.data.sessions[1].runtimeEvidenceHash;}],
 ['misleading surface name', f=>{f.data.sessions[1].surface='VS Code Codex';}],
 ['duplicate session certificates', f=>{f.data.sessions.push(f.data.sessions[1]);}],
 ['missing authorship set', f=>{delete f.data.authorSessions;}],
 ['author receipt', f=>{f.data.reviews[0].authorship='implementation';}],
 ['wrong reviewer role', f=>{f.data.reviews[0].role='implementer';}],
 ['missing distinct security-policy review', f=>{f.data.reviews.pop();}],
 ['same reviewer for functional/security policy', f=>{f.data.reviews[1].session=reviewer;}],
 ['stale artifact', f=>{f.data.sha='d'.repeat(40);}],
 ['foreign Task', f=>{f.data.task='#93';}],
 ['foreign PR', f=>{f.data.pr=93;}],
 ['foreign repo', f=>{f.data.repository='other/repo';}],
 ['wrong branch', f=>{f.data.branch='other';}],
 ['wrong base', f=>{f.data.baseSha='d'.repeat(40);}],
 ['wrong scope', f=>{f.data.scope='product';}],
 ['edited receipt', f=>{f.input.reviewReceipts['101'].body+='\nchanged';}],
 ['missing receipt', f=>{delete f.input.reviewReceipts['101'];}],
 ['foreign receipt location', f=>{f.input.reviewReceipts['101'].issue_url+='9';}],
 ['foreign proof location', f=>{f.input.proofReceipt.issue_url+='9';}],
 ['wrong proof ID', f=>{f.input.proofReceipt.id=999;}],
 ['missing scope query', f=>{delete f.input.changedFiles;}],
 ['duplicate field', f=>{f.input.prBody+='\n- Reviewer session: '+reviewer;}],
 ['Task/PR mismatch', f=>{f.input.issueBody=f.input.issueBody.replace('## Branch\ncodex/fixture','## Branch\nwrong');}],
 ['PR used as Task', f=>{f.input.taskIsPullRequest=true;}],
 ['wrong head', f=>{f.input.actualSha='e'.repeat(40);}],
 ['invalid verdict', f=>{f.input.prBody=f.input.prBody.replace('Verdict: REVIEW','Verdict: APPROVE');}],
 ['expired proof', f=>{f.data.expiresAt=new Date(now-1).toISOString();}],
 ['future proof', f=>{f.data.issuedAt=new Date(now+1).toISOString();}],
 ['excessive lifetime', f=>{f.data.expiresAt=new Date(now+31*86400000).toISOString();}],
 ['revoked authority', f=>{f.input.trustPolicy.authorities[0].revoked=true;}],
 ['empty enrollment', f=>{f.input.trustPolicy.authorities=[];}],
 ['wrong authority repository', f=>{f.input.trustPolicy.authorities[0].repositories=['other/repo'];}],
 ['wrong authority purpose', f=>{f.input.trustPolicy.authorities[0].purpose='release';}],
 ['no functional policy', f=>{f.input.trustPolicy.requiredScopes=[];}],
];
for (const [name, mutate] of denials) test('fail closed: '+name,()=>assert.ok(validate(changed(mutate)).failures.length));
test('forged cryptographic signature rejected even with plausible identifiers',()=>{
  const f=fixture(); f.input.proofReceipt.body=signed(f.data,generateKeyPairSync('ed25519').privateKey); assert.ok(validate(f.input).failures.length);
});
test('canonical proof disallows duplicate JSON keys and whitespace ambiguities',()=>{
  const f=fixture(); f.input.proofReceipt.body=' '+f.input.proofReceipt.body; assert.ok(validate(f.input).failures.length);
  const bytes=Buffer.from(JSON.stringify(f.data).replace('"version":2','"version":1,"version":2'));
  f.input.proofReceipt.body=JSON.stringify({keyId:'fixture-authority',payload:bytes.toString('base64'),signature:sign(null,bytes,keys.privateKey).toString('base64')}); assert.ok(validate(f.input).failures.length);
});
test('edited receipt cannot be rebound without a new authority attestation',()=>{
  const f=fixture(); f.input.reviewReceipts['101'].body=f.input.reviewReceipts['101'].body.replace('Target SHA: '+sha,'Target SHA: '+'e'.repeat(40)); assert.ok(validate(f.input).failures.length);
});
test('signed unsupported release flag cannot authorize release',()=>{
  const input=changed(f=>{f.data.releaseAuthorized=true;}); assert.equal(validate(input).releaseAuthorized,false);
});
test('legacy archive is replayable but cannot approve current evidence',()=>{
  const input=fixture().input; input.prBody=input.prBody.replace('Governance version: 2','Governance version: 1'); assert.ok(validate(input).failures.length); assert.equal(validate({...input,mode:'historical'}).decision,'HISTORICAL_ONLY');
});
async function adapter(input, options={}) {
  const failures=[], queries=[], summaries=[];
  const pr={number:92,head:{ref:input.actualBranch,sha:input.actualSha},base:{sha:base},body:input.prBody};
  const issues={async get(){if(options.unavailable)throw Error('fixture unavailable'); return {data:{title:input.taskTitle,body:input.issueBody}};},async getComment({comment_id}){queries.push(comment_id); const comment=comment_id===100?input.proofReceipt:input.reviewReceipts[String(comment_id)]; if(!comment)throw Error('missing fixture receipt');return {data:comment};}};
  await runInNewContext(`(async()=>{${source}})()`,{require(name){if(name==='node:fs')return {readFileSync(path){assert.equal(path,'.github/policies/codex-governance-trust.json');return JSON.stringify(options.policy ?? input.trustPolicy);}};assert.equal(name,'./.github/scripts/codex-governance.cjs');return {validate,proof};},context:{payload:{pull_request:pr},repo:{owner:input.repoOwner,repo:input.repoName}},github:{rest:{issues,pulls:{async get(){return {data:options.current??pr};},listFiles(){}}},async paginate(){return input.changedFiles.map(filename=>({filename}));}},core:{setFailed(m){failures.push(m);},summary:{addRaw(s){summaries.push(s);return {async write(){}};}}}},{timeout:3000});
  return {failures,queries,summaries};
}
test('actual workflow adapter verifies scoped signed evidence',async()=>{const r=await adapter(fixture().input);assert.deepEqual(r.failures,[]);assert.deepEqual(r.queries,[100,101,102]);});
test('actual workflow adapter API errors fail closed',async()=>assert.ok((await adapter(fixture().input,{unavailable:true})).failures.length));
test('actual adapter rejects proof tampering',async()=>{const f=fixture();f.input.proofReceipt.body=f.input.proofReceipt.body.replace('fixture-authority','fake');assert.ok((await adapter(f.input)).failures.length);});
test('PR-provided keys and waiver cannot enroll an authority',async()=>{const f=fixture();f.input.prBody+='\n- Authority public key: '+keys.publicKey.export({type:'spki',format:'pem'})+'\n- Human waiver: APPROVED';assert.ok((await adapter(f.input,{policy:{...f.input.trustPolicy,authorities:[]}})).failures.length);});
test('workflow rejects stale event',async()=>{const f=fixture();assert.ok((await adapter(f.input,{current:{head:{sha:'e'.repeat(40),ref:f.input.actualBranch},base:{sha:base}}})).failures.length);});
test('workflow retains read-only permissions and immutable base checkout',()=>{
  const perms=workflow.split('permissions:\n')[1].split('\nconcurrency:')[0]; assert.doesNotMatch(perms,/write/);for(const p of ['contents: read','issues: read','pull-requests: read']) assert.ok(perms.includes(p));assert.ok(workflow.includes('ref: ${{ github.event.pull_request.base.sha }}'));assert.ok(workflow.includes('persist-credentials: false'));assert.ok(!workflow.includes('pull_request_target'));
  const policy=JSON.parse(readFileSync('.github/policies/codex-governance-trust.json','utf8'));assert.deepEqual(policy.authorities,[]);
});
for (const [label,value] of [['Task','#93'],['PR','#93'],['Target SHA','e'.repeat(40)],['Evidence scope','product'],['Reviewer authorship','implementation'],['Reviewer role','implementer']]) {
  test('authority-bound wrong receipt field still rejected: '+label,()=>{
    const input=changed(f=>{const r=f.input.reviewReceipts['101'];r.body=r.body.replace(new RegExp('^- '+label+':.*$','m'),'- '+label+': '+value);f.data.reviews[0].bodySha256=hash(r.body);});
    assert.ok(validate(input).failures.length);
  });
}
test('different display names cannot hide identical reviewer/owner session',()=>{
  const input=changed(f=>{f.input.prBody=f.input.prBody.replace('Independent reviewer: Codex Desktop','Independent reviewer: VS Code Codex').replace('Reviewer session: '+reviewer,'Reviewer session: '+owner);f.input.issueBody=f.input.issueBody.replace('## Independent reviewer\nCodex Desktop','## Independent reviewer\nVS Code Codex').replace('## Reviewer session\n'+reviewer,'## Reviewer session\n'+owner);f.data.reviews[0].session=owner;});
  assert.ok(validate(input).failures.length);
});
test('duplicate enrolled key IDs rejected rather than choosing first',()=>{const f=fixture();f.input.trustPolicy.authorities.push(f.input.trustPolicy.authorities[0]);assert.ok(validate(f.input).failures.length);});
test('unsigned envelope alteration and invalid encoding rejected',()=>{const f=fixture();const e=JSON.parse(f.input.proofReceipt.body);e.payload+='\n';f.input.proofReceipt.body=JSON.stringify(e);assert.ok(validate(f.input).failures.length);});
test('untrusted narrative is data and cannot execute code or authorize release',async()=>{const f=fixture();f.input.prBody+='\nNarrative: ${throw new Error("must not run")} $(exit 0)';const r=await adapter(f.input);assert.deepEqual(r.failures,[]);assert.equal(validate(f.input).releaseAuthorized,false);});
