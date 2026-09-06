import { execFileSync } from 'node:child_process';
import { randomBytes, createHmac } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { customerDocumentActor, validateCustomerUpload, persistCustomerDocument, listCustomerDocuments, ownedCustomerDocument, CUSTOMER_DOCUMENT_BUCKET } from '../lib/customer/document-upload';

// Actual local Auth + PostgREST + Storage + PostgreSQL. No remote URL accepted.
const prefix='v6-docs-'+randomBytes(4).toString('hex');
const out=mkdtempSync(join(tmpdir(),'v6-customer-documents-'));
const password=randomBytes(24).toString('hex'),secret=randomBytes(32).toString('hex');
const run=(args:string[],input?:string)=>execFileSync('docker',args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:30000}).trim();
const sql=(query:string)=>run(['exec','-i',prefix+'-db','psql','-U','postgres','-v','ON_ERROR_STOP=1','-Atq'],query);
const token=(role:string)=>{const a=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');const b=Buffer.from(JSON.stringify({role,iss:'supabase',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+14400})).toString('base64url');return a+'.'+b+'.'+createHmac('sha256',secret).update(a+'.'+b).digest('base64url');};
const anon=token('anon'),service=token('service_role');
const created:string[]=[];
const report:Record<string,unknown>={environment:'DISPOSABLE_LOCAL_ONLY',productionWrites:0};
function start(name:string,image:string,env:Record<string,string>,port?:string) {
  const file=join(out,name+'.env');writeFileSync(file,Object.entries(env).map(([k,v])=>k+'='+v).join('\n'),{mode:0o600});
  const args=['run','-d','--name',prefix+'-'+name,'--network',prefix,'--env-file',file];
  if(port)args.push('-p','127.0.0.1:'+port);
  run([...args,image]);created.push(prefix+'-'+name);
}
async function wait(url:string) {
  for(let i=0;i<30;i++){try{const r=await fetch(url,{signal:AbortSignal.timeout(1500)});if(r.status<500)return;}catch{}await new Promise(r=>setTimeout(r,1000));}
  throw new Error('LOCAL_SERVICE_START_TIMEOUT '+new URL(url).port);
}
const proxy=createServer(async(req,res)=>{
  const path=req.url || '/';const match=path.match(/^\/(auth|rest|storage)\/v1(.*)$/);
  if(!match){res.writeHead(404).end();return;}
  const port=match[1]==='auth'?19032:match[1]==='rest'?19031:19033;
  try {
    const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));
    const headers:Record<string,string>={};for(const[k,v]of Object.entries(req.headers))if(typeof v==='string'&&!['host','content-length','connection','transfer-encoding'].includes(k))headers[k]=v;
    const upstream=await fetch('http://127.0.0.1:'+port+(match[2]||'/'),{method:req.method,headers,body:['GET','HEAD'].includes(req.method||'GET')?undefined:Buffer.concat(chunks),redirect:'manual',signal:AbortSignal.timeout(15000)});
    const output:Record<string,string>={};upstream.headers.forEach((v,k)=>{if(!['content-encoding','content-length','transfer-encoding','connection'].includes(k))output[k]=v;});
    res.writeHead(upstream.status,output);res.end(Buffer.from(await upstream.arrayBuffer()));
  }catch{res.writeHead(503).end();}
});
async function main(){
  run(['network','create',prefix]);
  start('db','postgres:17-alpine',{POSTGRES_PASSWORD:password},'19034:5432');
  for(let i=0;i<30;i++){try{sql('SELECT 1');break;}catch{if(i===29)throw new Error('LOCAL_DB_START_TIMEOUT');await new Promise(r=>setTimeout(r,500));}}
  sql("CREATE SCHEMA auth; CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions; CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS; GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;");
  start('auth','public.ecr.aws/supabase/gotrue:v2.195.0',{
    GOTRUE_DB_DATABASE_URL:'postgres://postgres:'+password+'@'+prefix+'-db:5432/postgres?search_path=auth',
    GOTRUE_DB_DRIVER:'postgres',GOTRUE_API_HOST:'0.0.0.0',GOTRUE_API_PORT:'9999',API_EXTERNAL_URL:'http://127.0.0.1:19030/auth/v1',
    GOTRUE_SITE_URL:'http://localhost:3017',GOTRUE_JWT_SECRET:secret,GOTRUE_JWT_AUD:'authenticated',GOTRUE_JWT_DEFAULT_GROUP_NAME:'authenticated',
    GOTRUE_EXTERNAL_EMAIL_ENABLED:'true',GOTRUE_MAILER_AUTOCONFIRM:'true',GOTRUE_EXTERNAL_PHONE_ENABLED:'false',GOTRUE_DISABLE_SIGNUP:'false',
  },'19032:9999');await wait('http://127.0.0.1:19032/health');
  const capture=JSON.parse(readFileSync('docs/production-schema-capture-2026-09-06.json','utf8'));
  for(const role of capture.roles.properties) {
    assert.match(role.name,/^[a-z_]+$/);
    if(sql("SELECT count(*) FROM pg_roles WHERE rolname='"+role.name+"'")==='0') sql('CREATE ROLE "'+role.name+'" NOLOGIN '+(role.bypassrls?'BYPASSRLS':'NOBYPASSRLS'));
  }
  for(const f of capture.functions.filter((f:{schema:string})=>f.schema==='auth'))sql(f.definition);
  sql(readFileSync('supabase/migrations/20260903215959_production_schema_baseline.sql','utf8'));
  start('rest','public.ecr.aws/supabase/postgrest:v16.1',{
    PGRST_DB_URI:'postgres://postgres:'+password+'@'+prefix+'-db:5432/postgres',PGRST_DB_SCHEMAS:'public',
    PGRST_DB_ANON_ROLE:'anon',PGRST_JWT_SECRET:secret,PGRST_DB_EXTRA_SEARCH_PATH:'public,extensions',
  },'19031:3000');await wait('http://127.0.0.1:19031/');
  start('storage','public.ecr.aws/supabase/storage-api:v1.70.7',{
    ANON_KEY:anon,SERVICE_KEY:service,AUTH_JWT_SECRET:secret,POSTGREST_URL:'http://'+prefix+'-rest:3000',
    DATABASE_URL:'postgres://postgres:'+password+'@'+prefix+'-db:5432/postgres',
    STORAGE_BACKEND:'file',FILE_STORAGE_BACKEND_PATH:'/var/lib/storage',FILE_SIZE_LIMIT:'4194304',
    TENANT_ID:'v6-local',REGION:'local',GLOBAL_S3_BUCKET:'v6-local',ENABLE_IMAGE_TRANSFORMATION:'false',
  },'19033:5000');await wait('http://127.0.0.1:19033/status');
  // Plain PostgreSQL lacks the managed platform's Storage API role grants.
  // Reconstruct them ONLY in this newly-created local container; RLS remains
  // authoritative, and the application migration must not widen these grants.
  sql('GRANT USAGE ON SCHEMA storage TO anon,authenticated,service_role; GRANT ALL ON ALL TABLES IN SCHEMA storage TO anon,authenticated,service_role; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA storage TO anon,authenticated,service_role;');
  const migration=readFileSync('supabase/migrations/20260906183519_customer_private_document_upload.sql','utf8');
  // Fail closed and transaction rollback before any application change.
  assert.throws(()=>sql("BEGIN; INSERT INTO storage.buckets(id,name,public) VALUES('customer-documents','customer-documents',true);\n"+migration),error=>String((error as {stderr?:string}).stderr).includes('CUSTOMER_DOCUMENT_BUCKET_CONFLICT'));
  assert.equal(sql("SELECT count(*) FROM storage.buckets WHERE id='customer-documents'"),'0');
  assert.equal(sql("SELECT count(*) FROM information_schema.columns WHERE table_name='verification_documents' AND column_name='upload_sha256'"),'0');
  sql('ALTER TABLE public.verification_documents ADD COLUMN upload_sha256 integer');
  assert.throws(()=>sql(migration),error=>String((error as {stderr?:string}).stderr).includes('CUSTOMER_DOCUMENT_UPLOAD_COLUMN_CONFLICT'));
  sql('ALTER TABLE public.verification_documents DROP COLUMN upload_sha256');
  sql(migration);sql(migration);sql("NOTIFY pgrst,'reload schema';");
  report.incompatibleBucketAndColumn='FAIL_CLOSED_ROLLBACK_PASS';
  report.postgresql=sql('SHOW server_version');report.migrationReplay='PASS';
  await new Promise<void>(resolve=>proxy.listen(19030,'127.0.0.1',resolve));
  const client=()=>createClient('http://127.0.0.1:19030',anon,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const writer=createClient('http://127.0.0.1:19030',service,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init)=>{
    const response=await fetch(input,init);
    if(!response.ok){
      const payload=await response.clone().json().catch(()=>({}));
      report.storageFailure={status:response.status,error:payload.error,code:payload.code,
        message:String(payload.message||'').replace(/eyJ[^\s]+/g,'[REDACTED]').replace(/postgres(?:ql)?:\/\/[^\s]+/g,'[REDACTED]').slice(0,240)};
    }
    return response;
  }}});
  const a=client(),b=client();
  const signup=async(c:ReturnType<typeof client>,email:string)=>{const r=await c.auth.signUp({email,password,options:{data:{full_name:'Isolated Customer'}}});assert.equal(r.error,null);assert.ok(r.data.user);return r.data.user.id;};
  const aid=await signup(a,'a@example.invalid'),bid=await signup(b,'b@example.invalid');
  assert.equal(await customerDocumentActor(a),aid);assert.equal(await customerDocumentActor(b),bid);
  const form=new FormData();form.set('file',new File(['%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF'],'passport.pdf',{type:'application/pdf'}));form.set('documentType','passport');form.set('uploadId',crypto.randomUUID());
  const upload=await validateCustomerUpload(form);
  await new Promise(r=>setTimeout(r,500));
  const first=await persistCustomerDocument(a,writer,aid,upload);assert.equal(first.replay,false);
  assert.equal((await persistCustomerDocument(a,writer,aid,upload)).replay,true);
  assert.equal((await listCustomerDocuments(a,aid)).length,1);assert.equal((await listCustomerDocuments(b,bid)).length,0);
  assert.equal(await ownedCustomerDocument(b,bid,first.id),null);
  const object=aid+'/'+upload.id+'.pdf';
  assert.equal(sql("SELECT count(*) FROM storage.objects WHERE bucket_id='customer-documents'"),'1');
  assert.equal(sql("SELECT count(*) FROM public.verification_documents WHERE storage_bucket='customer-documents'"),'1');
  const signed=await a.storage.from(CUSTOMER_DOCUMENT_BUCKET).createSignedUrl(object,60);assert.equal(signed.error,null);assert.ok(signed.data?.signedUrl);
  assert.equal((await fetch(signed.data.signedUrl)).status,200);
  const download=await a.storage.from(CUSTOMER_DOCUMENT_BUCKET).download(object);assert.equal(download.error,null);
  assert.ok((await b.storage.from(CUSTOMER_DOCUMENT_BUCKET).createSignedUrl(object,60)).error);
  assert.ok((await b.storage.from(CUSTOMER_DOCUMENT_BUCKET).download(object)).error);
  assert.ok((await client().storage.from(CUSTOMER_DOCUMENT_BUCKET).download(object)).error);
  assert.ok((await a.storage.from(CUSTOMER_DOCUMENT_BUCKET).upload(aid+'/direct.pdf',new Blob(['bad']))).error);
  assert.ok((await a.storage.from(CUSTOMER_DOCUMENT_BUCKET).update(object,new Blob(['bad']))).error);
  assert.ok((await b.storage.from(CUSTOMER_DOCUMENT_BUCKET).update(object,new Blob(['bad']))).error);
  await b.storage.from(CUSTOMER_DOCUMENT_BUCKET).remove([object]);
  assert.equal(sql("SELECT count(*) FROM storage.objects WHERE bucket_id='customer-documents'"),'1');
  const forged=await b.from('verification_documents').insert({document_type:'passport',owner_type:'customer',owner_id:aid,file_url:object,storage_bucket:CUSTOMER_DOCUMENT_BUCKET,upload_sha256:upload.digest});assert.ok(forged.error);
  const deleted=await b.from('verification_documents').delete().eq('id',upload.id).select('id');assert.deepEqual(deleted.data,[]);
  const updated=await b.from('verification_documents').update({verification_status:'Approved'}).eq('id',upload.id).select('id');assert.deepEqual(updated.data,[]);
  assert.deepEqual((await a.from('verification_documents').update({verification_status:'Approved'}).eq('id',upload.id).select('id')).data,[]);
  assert.deepEqual((await a.from('verification_documents').delete().eq('id',upload.id).select('id')).data,[]);
  assert.equal((await ownedCustomerDocument(a,aid,upload.id))?.verification_status,'Pending');
  await a.auth.signOut();const fresh=client();assert.equal((await fresh.auth.signInWithPassword({email:'a@example.invalid',password})).error,null);
  assert.equal((await listCustomerDocuments(fresh,await customerDocumentActor(fresh))).length,1);
  report.upload='PASS';report.persistence='PASS';report.relogin='PASS';report.ownerViewDownload='PASS';report.crossCustomer='PASS';report.anonymous='PASS';report.directStorageWrites='DENIED';report.idempotency='PASS';
  // Private local config enables the same-origin browser checks. Never printed.
  writeFileSync(join(out,'local-runtime.json'),JSON.stringify({url:'http://127.0.0.1:19030',anon,service,password,aid,bid}),{mode:0o600});
  if(process.argv.includes('--keep-for-browser')){
    report.status='LOCAL_BACKEND_PASS_BROWSER_PENDING';
    writeFileSync(join(out,'receipt.json'),JSON.stringify(report,null,2));console.log('LOCAL_EVIDENCE='+out);
    await new Promise<void>(resolve=>{process.once('SIGINT',resolve);process.once('SIGTERM',resolve);});
  }else report.status='PASS';
}
main().catch(error=>{report.status='FAIL';report.error=error instanceof Error?error.name+': '+error.message.slice(0,350):'Unknown error';console.error(JSON.stringify({status:'FAIL',error:report.error}));process.exitCode=1;}).finally(()=>{
  proxy.close();
  for(const name of created.reverse())try{run(['stop',name]);}catch{}
  report.resourcesStopped=true;
  writeFileSync(join(out,'receipt.json'),JSON.stringify(report,null,2));
  console.log('LOCAL_EVIDENCE='+out);
});
