import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import type { ContinuitySnapshot } from '../lib/dabra/continuity-service';

// Only called by the existing owned upload-stack runner. Input contains local
// ephemeral credentials; stdout is a payload-free receipt, never diagnostics.
async function main() {
  let raw='';for await(const chunk of process.stdin)raw+=chunk;
  const cfg=JSON.parse(raw) as {url:string;anon:string;password:string;aid:string;bid:string;container:string};
  assert.equal(cfg.url,'http://127.0.0.1:19030');assert.match(cfg.container,/^v6-docs-[0-9a-f]{8}-db$/);
  for(const id of [cfg.aid,cfg.bid])assert.match(id,/^[0-9a-f-]{36}$/);
  const sql=(query:string)=>execFileSync('docker',['exec','-i',cfg.container,'sh','-c',
    'PGPASSWORD="$POSTGRES_PASSWORD" PGCONNECT_TIMEOUT=2 exec psql -h 127.0.0.1 -p 5432 -U postgres -d postgres -v ON_ERROR_STOP=1 -Atq'],
    {input:query,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:10000}).trim();
  // The parent created this database from scratch. Existing baseline auth.uid()
  // and profile policies are retained; no fixture bypass or claim injection.
  sql(readFileSync('supabase/drafts/task187-continuity.sql','utf8'));
  sql("UPDATE public.dabra_continuity_policy SET enabled=true; NOTIFY pgrst,'reload schema';");
  process.env.NEXT_PUBLIC_SUPABASE_URL=cfg.url;process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY=cfg.anon;
  delete process.env.SUPABASE_URL;delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.DABRA_CONTINUITY_ENABLED='true';process.env.DABRA_INTERNAL_AI_ENABLED='false';
  const originalFetch=globalThis.fetch;let externalAttempts=0;
  globalThis.fetch=async(input,init)=>{
    const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
    if(url.origin!==cfg.url){externalAttempts++;throw new Error('TASK187_EXTERNAL_IO_DENIED');}
    return originalFetch(input,init);
  };
  try {
    const {POST}=await import('../app/api/ai2/chat/route');
    const client=()=>createClient(cfg.url,cfg.anon,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
    const a=client(),b=client(),staff=client();
    const login=async(c:ReturnType<typeof client>,email:string,id:string)=>{
      const result=await c.auth.signInWithPassword({email,password:cfg.password});assert.equal(result.error,null);assert.equal(result.data.user?.id,id);assert.ok(result.data.session);return result.data.session.access_token;
    };
    const at=await login(a,'a@example.invalid',cfg.aid),bt=await login(b,'b@example.invalid',cfg.bid);
    const registered=await staff.auth.signUp({email:'task187-staff@example.invalid',password:cfg.password,options:{data:{role:'customer',full_name:'Synthetic staff'}}});
    assert.equal(registered.error,null);assert.ok(registered.data.user);
    const sid=registered.data.user.id;assert.match(sid,/^[0-9a-f-]{36}$/);
    // Genuine Auth owns users; explicitly seed only these local canonical rows.
    for(const [id,role,email] of [[cfg.aid,'customer','a@example.invalid'],[cfg.bid,'client','b@example.invalid'],[sid,'staff','task187-staff@example.invalid']]) {
      sql("INSERT INTO public.profiles(id,full_name,email,role,status,deleted_at) VALUES('"+id+"','Synthetic Task187','"+email+"','"+role+"','active',NULL) ON CONFLICT(id) DO UPDATE SET role=excluded.role,status='active',deleted_at=NULL;");
    }
    const st=await login(staff,'task187-staff@example.invalid',sid);
    const trip={id:randomUUID(),origin:'Cairo',destination:'Riyadh',startDate:null,endDate:null,adults:2,children:0,rooms:1,budget:null,currency:'SAR',families:['stay']};
    const read=async()=>{const r=await a.rpc('dabra_continuity_read');assert.equal(r.error,null);return r.data as ContinuitySnapshot;};
    // PostgREST schema reload is asynchronous; bounded readiness without skip.
    for(let i=0;i<20;i++){const r=await a.rpc('dabra_continuity_read');if(!r.error)break;if(i===19)throw new Error('TASK187_RPC_NOT_READY');await new Promise(r=>setTimeout(r,100));}
    const mutate=async(action:string,state:ContinuitySnapshot,payload:unknown={})=>{const r=await a.rpc('dabra_continuity_mutate',{p_action:action,p_revision:state.revision,p_generation:state.generation,p_mutation:randomUUID(),p_payload:payload});assert.equal(r.error,null);return r.data as ContinuitySnapshot;};
    let state=await mutate('save',await read(),{consent:true,preferences:null,trip});
    const envelope=()=>({revision:state.revision,generation:state.generation,trip});
    const cases:string[]=[];
    const call=async(name:string,value:unknown,token:string|undefined,status:number,multipart=false,locale='en')=>{
      const headers:Record<string,string>={};if(token)headers.authorization='Bearer '+token;
      let body:string|FormData;
      if(multipart){const f=new FormData();f.set('message','hotels');f.set('locale',locale);f.set('continuityTrip',typeof value==='string'?value:JSON.stringify(value));body=f;}
      else {headers['content-type']='application/json';body=JSON.stringify({message:'hotels',locale,continuityTrip:value});}
      const response=await POST(new NextRequest('http://127.0.0.1/api/ai2/chat',{method:'POST',headers,body}));
      assert.equal(response.status,status,name);assert.match(response.headers.get('cache-control')??'',/private, no-store/,name);
      const text=await response.text();if(status===200){assert.match(text,/destination=riyadh/i,name);assert.doesNotMatch(text,/destination=cairo/i,name);}else assert.doesNotMatch(text,/Riyadh|Cairo/,name);
      cases.push(name);
    };
    for(const multipart of [false,true]){
      const suffix=multipart?'multipart':'json';
      await call('valid-A-'+suffix,envelope(),at,200,multipart);
      await call('valid-A-Arabic-'+suffix,envelope(),at,200,multipart,'ar');
      await call('B-isolation-'+suffix,envelope(),bt,409,multipart);
      await call('staff-'+suffix,envelope(),st,409,multipart);
      await call('invalid-JWT-'+suffix,envelope(),'invalid',409,multipart);
      await call('missing-auth-'+suffix,envelope(),undefined,409,multipart);
      await call('revision-'+suffix,{...envelope(),revision:state.revision+1},at,409,multipart);
      await call('generation-'+suffix,{...envelope(),generation:state.generation+1},at,409,multipart);
      await call('trip-ID-'+suffix,{...envelope(),trip:{...trip,id:randomUUID()}},at,409,multipart);
      await call('owner-field-'+suffix,{...envelope(),ownerId:cfg.bid},at,400,multipart);
      await call('malformed-trip-'+suffix,{...envelope(),trip:{...trip,destination:'https://invalid.example'}},at,400,multipart);
      process.env.DABRA_CONTINUITY_ENABLED='false';await call('feature-OFF-'+suffix,envelope(),at,409,multipart);process.env.DABRA_CONTINUITY_ENABLED='true';
    }
    await call('malformed-multipart-JSON','{',at,400,true);
    const malformed=await POST(new NextRequest('http://127.0.0.1/api/ai2/chat',{method:'POST',headers:{'content-type':'application/json'},body:'{'}));assert.equal(malformed.status,400);assert.match(malformed.headers.get('cache-control')??'',/no-store/);cases.push('malformed-body-JSON');
    for(const action of ['expiry','delete_trip','revoke']){
      const old=envelope();
      if(action==='expiry')sql("UPDATE public.dabra_account_continuity SET trip_expires_at=now()-interval '1 second' WHERE owner_id='"+cfg.aid+"';");
      else state=await mutate(action,state);
      for(const multipart of [false,true])await call(action+'-'+(multipart?'multipart':'json'),old,at,409,multipart);
      state=await mutate('save',await read(),{consent:true,preferences:null,trip});
    }
    assert.equal(externalAttempts,0,'no external provider fetch attempted');
    console.log(JSON.stringify({status:'PASS',mode:'genuine-GoTrue-JWT-PostgREST-RPC-RLS-direct-handler',cases,count:cases.length,externalAttempts,limits:'No browser geometry or restart/purge/race retest; disposable CI execution only.'}));
  } finally {globalThis.fetch=originalFetch;}
}
main().catch(()=>{console.error('TASK187_GENUINE_CHAT_FAILED');process.exitCode=1;});

