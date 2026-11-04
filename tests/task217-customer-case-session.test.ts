import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { isValidElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { CustomerCaseSession } from '../lib/contact/customer-case-session';

const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
const caseId='33333333-3333-4333-8333-333333333333',now='2026-11-04T00:00:00Z';
const identity=(userId:string)=>({identityState:'authenticated',authenticated:true,userId});
const own=(marker='CASE-'+caseId)=>({kind:'ready',cases:[{reference:marker,status:'received',subject:'service',country:'EG',
 createdAt:now,updatedAt:now,events:[{status:'received',createdAt:now}]}],truncated:false,retrievedAt:now});
function deferred<T>() { let done!:(value:T)=>void;const promise=new Promise<T>(resolve=>{done=resolve;});return {promise,done}; }
const tick=()=>new Promise<void>(resolve=>setImmediate(resolve));

test('Case session discards a late A response during A to B; no token/storage/session transfer',async()=>{
 let current=a;const late=deferred<Response>();let n=0;
 const session=new CustomerCaseSession(async(url,options)=>{
  assert.equal(options?.credentials,'same-origin');assert.equal(options?.cache,'no-store');
  if(url==='/api/dabra/session-identity')return Response.json(identity(current));
  assert.equal(url,'/api/support/cases');if(++n===1)return late.promise;
  return Response.json({...own(),cases:[]});
 });
 const start=session.refreshIdentity();await tick();const generation=session.getSnapshot().generation;
 current=b;const switched=session.refreshIdentity({sameAccountRefresh:false,userId:b});
 assert.ok(session.getSnapshot().generation>generation);assert.equal(session.getSnapshot().cases,null);
 await switched;late.done(Response.json(own()));await start;
 assert.equal(session.getSnapshot().identity,'customer');assert.equal(session.getSnapshot().cases?.cases.length,0);
 session.clear();assert.equal(session.getSnapshot().cases,null);
});

test('Case session logout clears before waiting; failed identity and malformed RPC do not mean no cases',async()=>{
 let body:unknown=identity(a),bad=false;const session=new CustomerCaseSession(async url=>
  Response.json(url==='/api/dabra/session-identity'?body:bad?{...own(),privateEmail:'PRIVATE'}:own()));
 await session.refreshIdentity();assert.equal(session.getSnapshot().cases?.cases.length,1);
 body={identityState:'anonymous_confirmed',authenticated:false};
 const logout=session.refreshIdentity({sameAccountRefresh:false,userId:null});
 assert.equal(session.getSnapshot().cases,null);await logout;assert.equal(session.getSnapshot().identity,'authentication_required');
 body=identity(b);bad=true;await session.refreshIdentity();assert.equal(session.getSnapshot().cases,null);assert.equal(session.getSnapshot().error,true);
 body={identityState:'unresolved_or_error'};await session.refreshIdentity();assert.equal(session.getSnapshot().identity,'unavailable');
});

test('same-account SDK hint preserves form generation only after server verification; changed server identity clears',async()=>{
 let current=a,calls=0;const session=new CustomerCaseSession(async url=>{
  if(url==='/api/dabra/session-identity')return Response.json(identity(current));calls++;return Response.json(own());
 });
 await session.refreshIdentity();const previous=session.getSnapshot();
 await session.refreshIdentity({sameAccountRefresh:true,userId:a});assert.equal(session.getSnapshot(),previous);assert.equal(calls,1);
 current=b;await session.refreshIdentity({sameAccountRefresh:true,userId:a});
 assert.ok(session.getSnapshot().generation>previous.generation);assert.equal(calls,2);
});

type NodeProps={children?:unknown;onSubmit?:(e:{preventDefault:()=>void})=>Promise<void>;onChange?:(e:{target:{value:string}})=>void;value?:string;type?:string;required?:boolean};
function nodes(value:unknown):ReactElement<NodeProps>[] {
 if(Array.isArray(value))return value.flatMap(nodes);if(!isValidElement<NodeProps>(value))return [];
 return [value,...nodes(value.props.children)];
}
// Actual component/event handlers with controlled hook slots and external IO.
// This is executable semantic UI evidence, not browser/layout acceptance.
function formFixture(language:'ar'|'en') {
 const require=createRequire(import.meta.url),slots:unknown[]=[],refs:{current:unknown}[]=[];
 let stateIndex=0,refIndex=0,cleanup:()=>void=()=>{},saved=0;
 const requests:{url:string;options:RequestInit}[]=[],late=deferred<Response>();
 const empty=(props:{children?:unknown})=>props.children??null;
 const exports={} as {default:(props:unknown)=>ReactElement};
 runInNewContext(ts.transpileModule(readFileSync('components/public/ContactPublicPage.tsx','utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{
  exports,crypto:globalThis.crypto,AbortController,
  fetch:async(url:string,options:RequestInit)=>{requests.push({url,options});return late.promise;},
  require:(name:string)=>({
   react:{useState:(v:unknown)=>{const i=stateIndex++;if(!(i in slots))slots[i]=v;return [slots[i],(next:unknown)=>{slots[i]=typeof next==='function'?next(slots[i]):next;}];},
    useRef:(v:unknown)=>{const i=refIndex++;return refs[i]??(refs[i]={current:v});},
    useEffect:(effect:()=>()=>void)=>{cleanup=effect();}},
   '@/components/i18n/LanguageProvider':{useLanguage:()=>({language})},
   '@/components/design-system':{SectionContainer:empty,ContentContainer:empty},
   '@/components/ui/button':{Button:empty},'@/components/ui/card':{Card:empty,CardContent:empty,CardHeader:empty,CardTitle:empty},
   '@/components/public/PublicHero':{default:(p:{title:string})=>p.title},
  }[name]??require(name)),
 });
 const render=()=>{stateIndex=0;refIndex=0;return exports.default({customerCase:true,onSaved:()=>saved++});};
 const form=()=>{const found=nodes(render()).find(n=>n.type==='form');assert.ok(found?.props.onSubmit);return found.props.onSubmit;};
 return {render,form,slots,requests,late,cleanup:()=>cleanup(),saved:()=>saved};
}

for(const language of ['ar','en'] as const)test('actual Case form '+language+' uses owned endpoint, one pending submission and drops unmounted late response',async()=>{
 const f=formFixture(language),html=renderToStaticMarkup(f.render());assert.match(html,language==='ar'?/dir="rtl"/:/dir="ltr"/);
 f.slots[0]={name:'SYNTHETIC',email:'synthetic@example.invalid',phone:'',country:'EG',subject:'service',message:'PRIVATE'};
 const submit=f.form()!;const first=submit({preventDefault(){}});await submit({preventDefault(){}});
 assert.equal(f.requests.length,1);assert.equal(f.requests[0].url,'/api/support/cases');
 assert.equal(f.requests[0].options.credentials,'same-origin');assert.ok(f.requests[0].options.signal);
 f.cleanup();assert.equal(f.requests[0].options.signal?.aborted,true);
 f.late.done(Response.json({status:'received',reference:'CASE-'+caseId}));await first;assert.equal(f.saved(),0);
});
