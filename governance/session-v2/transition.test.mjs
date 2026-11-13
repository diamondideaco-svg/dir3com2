import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import live from '../../.github/scripts/codex-governance.cjs';
import proposed from './codex-governance.cjs';
import { validate as validateFuture } from './codex-governance.mjs';
const stage='governance/session-v2/';
const manifest=JSON.parse(readFileSync(stage+'live-boundary-manifest.json','utf8'));
const git=(...args)=>execFileSync('git',['-c','safe.directory='+process.cwd().replaceAll('\\','/'),...args],{encoding:'utf8'});
const normal=s=>s.replace(/\r\n/g,'\n');
const sha='a'.repeat(40), owner='11111111-1111-4111-8111-111111111111', reviewer='22222222-2222-4222-8222-222222222222';
function fixture(){
  const fields={Task:'#901','Implementation owner':'Codex Desktop','Independent reviewer':'Codex - ChatGPT Work Mode','Implementation session':owner,'Reviewer session':reviewer,'Reviewer receipt':'90001',Branch:'codex/staged-fixture','Target SHA':sha,'Base SHA':manifest.base,Worktree:'synthetic isolated fixture','Last verified result':'synthetic preparation checks','Next action':'assigned exact-artifact human review',Verdict:'REVIEW'};
  const receipt={id:90001,issue_url:'https://api.github.com/repos/fixture-owner/fixture-repo/issues/901',body:Object.entries({'Independent reviewer':fields['Independent reviewer'],'Implementation session':owner,'Reviewer session':reviewer,'Target SHA':sha,'Reviewer role':'independent reviewer','Reviewer authorship':'none'}).map(([k,v])=>'- '+k+': '+v).join('\n')};
  return {prBody:Object.entries(fields).map(([k,v])=>'- '+k+': '+v).join('\n'),issueBody:Object.entries(fields).map(([k,v])=>'## '+(k==='Target SHA'?'Current target SHA':k==='Verdict'?'Current verdict':k)+'\n'+v).join('\n')+'\n## Pull request\n#902',actualBranch:fields.Branch,actualSha:sha,prNumber:902,taskTitle:'[Codex Task] synthetic transition fixture',taskIsPullRequest:false,repoOwner:'fixture-owner',repoName:'fixture-repo',reviewerReceipt:receipt};
}
test('nine live authority/caller/template files match immutable base; inactive material not imported',()=>{
  assert.equal(manifest.activation,false);
  for(const item of manifest.liveFiles){const blob=git('show',manifest.base+':'+item.path);assert.equal(createHash('sha256').update(blob).digest('hex'),item.gitBlobSha256);const actual=readFileSync(item.path,'utf8');assert.equal(normal(actual),normal(blob),item.path);assert.ok(!actual.includes('governance/session-v2/'));}
});
test('working/index preparation diff has only inactive stage paths',()=>{
  const changed=git('diff','--name-only',manifest.base).trim().split('\n').filter(Boolean);
  const fresh=git('ls-files','--others','--exclude-standard').trim().split('\n').filter(Boolean);
  assert.ok([...changed,...fresh].every(path=>path.startsWith(stage)));
  assert.ok(git('diff','--name-only',manifest.base,'--','.github','AGENTS.md','docs/CODEX_OPERATIONS.md','.agents','scripts','tests','app','lib','supabase').trim()==='');
});
test('proposed workflow and registry are not active/discovered GitHub configuration',()=>{
  assert.ok(!readFileSync('.github/workflows/codex-governance.yml','utf8').includes('BASE_TRUST_UNAVAILABLE'));
  assert.deepEqual(JSON.parse(readFileSync(stage+'trust-policy.json','utf8')).authorities,[]);
  assert.ok(stage.startsWith('governance/'));assert.ok(!stage.startsWith('.github/workflows/'));
});
test('actual v1 accepts eligible separate Work Mode metadata/receipt fixture, not a v2 certificate',()=>assert.deepEqual(live.validate(fixture()).failures,[]));
for(const [name,mutate] of [
  ['same session',v=>{v.prBody=v.prBody.replace(reviewer,owner);v.issueBody=v.issueBody.replace(reviewer,owner);v.reviewerReceipt.body=v.reviewerReceipt.body.replace(reviewer,owner);} ],
  ['author participation',v=>{v.reviewerReceipt.body=v.reviewerReceipt.body.replace('Reviewer authorship: none','Reviewer authorship: implementation');}],
  ['stale receipt SHA',v=>{v.reviewerReceipt.body=v.reviewerReceipt.body.replace(sha,'b'.repeat(40));}],
  ['foreign Task receipt',v=>{v.reviewerReceipt.issue_url+='9';}],
  ['missing review',v=>{delete v.reviewerReceipt;}],
  ['arbitrary display identity',v=>{v.prBody=v.prBody.replace('Codex - ChatGPT Work Mode','Copilot Chat');v.issueBody=v.issueBody.replace('Codex - ChatGPT Work Mode','Copilot Chat');}],
  ['same actual Desktop surface without policy amendment',v=>{v.prBody=v.prBody.replace('Codex - ChatGPT Work Mode','Codex Desktop');v.issueBody=v.issueBody.replace('Codex - ChatGPT Work Mode','Codex Desktop');}],
])test('unchanged live gate still rejects '+name,()=>{const f=fixture();mutate(f);assert.ok(live.validate(f).failures.length);});
test('inactive v2 cannot approve this legacy/no-trust artifact',()=>{const r=validateFuture(fixture());assert.ok(r.failures.length);assert.notEqual(r.releaseAuthorized,true);assert.ok(proposed.validate(fixture()).failures.length);});
async function liveAdapter(input){
  const workflow=normal(readFileSync('.github/workflows/codex-governance.yml','utf8'));
  const source=workflow.split('          script: |\n')[1].split('\n').map(s=>s.replace(/^ {12}/,'')).join('\n');
  const failures=[],queries=[];
  await runInNewContext(`(async()=>{${source}})()`,{require(path){assert.equal(path,'./.github/scripts/codex-governance.cjs');return live;},context:{payload:{pull_request:{number:input.prNumber,head:{ref:input.actualBranch,sha:input.actualSha},body:input.prBody}},repo:{owner:input.repoOwner,repo:input.repoName}},github:{rest:{issues:{async get(){return {data:{title:input.taskTitle,body:input.issueBody}};},async getComment(q){queries.push(q.comment_id);if(!input.reviewerReceipt)throw Error('missing fixture');return {data:input.reviewerReceipt};}}}},core:{setFailed(s){failures.push(s);},summary:{addRaw(){return {async write(){}};}}}},{timeout:1000});
  return {failures,queries};
}
test('real unchanged live workflow verifies current fetched receipt contract',async()=>{const r=await liveAdapter(fixture());assert.deepEqual(r.failures,[]);assert.deepEqual(r.queries,[90001]);});
test('real unchanged workflow does not accept missing/current SHA receipt',async()=>{const f=fixture();f.reviewerReceipt.body=f.reviewerReceipt.body.replace(sha,'b'.repeat(40));assert.ok((await liveAdapter(f)).failures.length);});
async function proposedAdapter(missing=[],empty=false){
  const workflow=normal(readFileSync(stage+'proposed-workflow.yml','utf8'));
  const source=workflow.split('          script: |\n')[1].split('\n').map(s=>s.replace(/^ {12}/,'')).join('\n');
  const failures=[],reads=[];
  await runInNewContext(`(async()=>{${source}})()`,{require(name){assert.equal(name,'node:fs');return {existsSync(p){return !missing.includes(p);},readFileSync(p){reads.push(p);return JSON.stringify(empty?{version:2,authorities:[]}:{version:1,authorities:[]});}};},context:{payload:{pull_request:{number:902}},repo:{owner:'fixture-owner',repo:'fixture-repo'}},core:{setFailed(s){failures.push(s);},summary:{addRaw(){return {async write(){}};}}}},{timeout:1000});
  return {failures,reads};
}
test('proposed legacy-base transition still blocks missing trust, not current v1 preparation',async()=>{const r=await proposedAdapter(['.github/policies/codex-governance-trust.json']);assert.match(r.failures.join('\n'),/BASE_TRUST_UNAVAILABLE/);assert.deepEqual(r.reads,[]);assert.deepEqual(live.validate(fixture()).failures,[]);});
test('proposed empty/old trust registry remains failure, never preparation approval',async()=>{assert.match((await proposedAdapter([],true)).failures.join('\n'),/BASE_AUTHORITY_UNENROLLED/);assert.match((await proposedAdapter()).failures.join('\n'),/BASE_TRUST_INVALID/);});
