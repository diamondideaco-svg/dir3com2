import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {cairoInstant} from '../lib/drive/search';
import {validDriveModelYear} from '../lib/drive/catalog';

function fixture({authenticated=true,allowed=true,rpcCode=null as string|null}={}){
 const calls:Record<string,unknown>[]=[];const paths:string[]=[];
 const modules:Record<string,unknown>={
  'next/cache':{revalidatePath:(path:string)=>paths.push(path)},
  '@/lib/supabase/server':{createSupabaseServerClient:async()=>({auth:{getUser:async()=>({data:{user:authenticated?{id:'synthetic-ops'}:null}})},rpc:async(name:string,args:Record<string,unknown>)=>{calls.push({name,...args});return{error:rpcCode?{code:rpcCode}:null};}})},
  '@/lib/auth/admin':{resolveVerifiedOperationalAccess:async()=>({scope:allowed?{mode:'country',countries:['EG']}:null}),isCountryAllowed:()=>allowed},
  '@/lib/drive/search':{cairoInstant},'@/lib/drive/catalog':{validDriveModelYear},
 };
 const exports:{reviewDriveRequest?:(previous:string,form:FormData)=>Promise<string>}={};
 class FixedDate extends Date { static now(){return Date.parse('2030-12-12T06:00:00Z');} }
 runInNewContext(ts.transpileModule(readFileSync('app/admin/operations/drive/actions.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:(name:string)=>{assert.ok(name in modules,name);return modules[name];},Date:FixedDate});
 const form=new FormData();for(const[k,v]of Object.entries({requestId:'00000000-0000-4000-8000-000000000260',version:'1',action:'confirm',vehicle:'Synthetic vehicle',vehicleYear:'2026',amount:'750',currency:'EGP',expires:'2030-12-11T12:00',note:'Synthetic private note'}))form.set(k,v);
 return{form,calls,paths,action:()=>exports.reviewDriveRequest!('',form)};
}
test('Expired Cairo deadline returns specific code without RPC or invalidation',async()=>{const f=fixture();assert.equal(await f.action(),'EXPIRED');assert.equal(f.form.get('amount'),'750');assert.deepEqual(f.calls,[]);assert.deepEqual(f.paths,[]);});
for(const [options,expected]of [[{authenticated:false},'UNAUTHORIZED'],[{allowed:false},'FORBIDDEN']] as const)test(`Authority remains first for expired deadline: ${expected}`,async()=>{const f=fixture(options);assert.equal(await f.action(),expected);assert.deepEqual(f.calls,[]);});
test('Corrected future Cairo deadline keeps canonical RPC fields and cache invalidation',async()=>{const f=fixture();f.form.set('expires','2030-12-13T12:00');assert.equal(await f.action(),'SAVED');assert.equal(f.calls.length,1);assert.equal(f.calls[0].p_expires,'2030-12-13T10:00:00.000Z');assert.equal(f.calls[0].p_amount,750);assert.equal(f.calls[0].p_version,1);assert.deepEqual(f.paths,['/admin/operations/drive','/my-requests/[reference]/drive']);});
for(const code of ['40001','42501','22023'])test(`Future quote preserves database rejection ${code}`,async()=>{const f=fixture({rpcCode:code});f.form.set('expires','2030-12-13T12:00');assert.equal(await f.action(),{'40001':'STALE','42501':'FORBIDDEN','22023':'INVALID'}[code]);assert.equal(f.calls.length,1);assert.deepEqual(f.paths,[]);});
test('Malformed deadline remains INVALID rather than EXPIRED',async()=>{const f=fixture();f.form.set('expires','not-a-date');assert.equal(await f.action(),'INVALID');assert.deepEqual(f.calls,[]);});
