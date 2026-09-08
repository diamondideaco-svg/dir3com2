import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { customerDocumentActor, validateCustomerUpload, persistCustomerDocument, safeCustomerDocumentPath, readCustomerUploadForm, CUSTOMER_DOCUMENT_LIMIT } from '../lib/customer/document-upload';
const actor = '11111111-1111-4111-8111-111111111111';
const pdf = '%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF';
function form(file = new File([pdf],'passport.pdf',{type:'application/pdf'})) {
  const f = new FormData(); f.set('file',file); f.set('documentType','passport'); f.set('uploadId',randomUUID()); return f;
}
test('customer upload reuses validated PDF contract with generated immutable path and fingerprint',async () => {
  const upload = await validateCustomerUpload(form());
  assert.equal(upload.signature.extension,'pdf'); assert.match(upload.digest,/^[a-f0-9]{64}$/);
  assert.equal(safeCustomerDocumentPath(actor,{id:upload.id,file_url:actor+'/'+upload.id+'.pdf',storage_bucket:'customer-documents'}).extension,'pdf');
  for (const file_url of ['../secret.pdf','https://example.com/a.pdf','22222222-2222-4222-8222-222222222222/'+upload.id+'.pdf']) assert.throws(() => safeCustomerDocumentPath(actor,{id:upload.id,file_url,storage_bucket:'customer-documents'}));
});
test('empty, malformed, oversize, script, extension/MIME mismatch and active PDF are rejected',async () => {
  const cases = [
    new File([],'empty.pdf',{type:'application/pdf'}),new File(['not pdf'],'bad.pdf',{type:'application/pdf'}),
    new File([new Uint8Array(CUSTOMER_DOCUMENT_LIMIT+1)],'large.pdf',{type:'application/pdf'}),
    new File([pdf],'malware.exe',{type:'application/pdf'}),new File([pdf],'not.png',{type:'image/png'}),
    new File([pdf],'wrong.png',{type:'application/pdf'}),new File([pdf],'../passport.pdf',{type:'application/pdf'}),
    new File([pdf.replace('Catalog','Catalog /JavaScript')],'active.pdf',{type:'application/pdf'}),
  ];
  for (const file of cases) await assert.rejects(validateCustomerUpload(form(file)));
  const forged = form(); forged.set('ownerId',actor); await assert.rejects(validateCustomerUpload(forged));
  const duplicate = form(); duplicate.append('documentType','visa'); await assert.rejects(validateCustomerUpload(duplicate));
  const dates = form(); dates.set('expiryDate','2026-02-31'); await assert.rejects(validateCustomerUpload(dates));
});
test('multipart limit is enforced without trusting Content-Length',async () => {
  const request = new Request('http://localhost/upload',{method:'POST',body:form()});
  const parsed = await readCustomerUploadForm(request); assert.ok(parsed.get('file') instanceof File);
  const huge = new Request('http://localhost/upload',{method:'POST',body:new Uint8Array(CUSTOMER_DOCUMENT_LIMIT+65537),headers:{'content-type':'multipart/form-data; boundary=test','content-length':'10'}});
  await assert.rejects(readCustomerUploadForm(huge),/DOCUMENT_TOO_LARGE/);
});
test('actor authority comes from canonical active profile, never metadata',async () => {
  for (const role of ['partner','staff','admin','customer']) {
    const fake = {auth:{getUser:async()=>({data:{user:{id:actor,user_metadata:{role:'customer'}}},error:null})},
      from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{id:actor,role,status:'active',deleted_at:null},error:null})})})})} as unknown as SupabaseClient;
    if(role==='customer') assert.equal(await customerDocumentActor(fake),actor);
    else await assert.rejects(customerDocumentActor(fake),/CUSTOMER_ACCESS_DENIED/);
  }
  const anon = {auth:{getUser:async()=>({data:{user:null},error:null})}} as unknown as SupabaseClient;
  await assert.rejects(customerDocumentActor(anon),/CUSTOMER_AUTH_REQUIRED/);
});
function fixture(options: { readError?: boolean; insertError?: boolean; cleanupError?: boolean; committedDespiteError?: boolean } = {}) {
  let row: Record<string,unknown> | null = null, uploads=0,removes=0,inserts=0;
  const db = {from:()=>({
    select:()=>{const q={eq:()=>q,maybeSingle:async()=>({data:row,error:options.readError?{code:'timeout'}:null})};return q;},
    insert:(value:Record<string,unknown>)=>{inserts++;return {select:()=>({single:async()=>{if(!options.insertError||options.committedDespiteError) row=value;return {data:options.insertError?null:{id:value.id},error:options.insertError?{code:'failure'}:null};}})};},
  })} as unknown as SupabaseClient;
  const storage={storage:{from:()=>({upload:async()=>{uploads++;return {error:null};},remove:async()=>{removes++;return {error:options.cleanupError?{code:'failure'}:null};}})}} as unknown as SupabaseClient;
  return {db,storage,counts:()=>({uploads,removes,inserts})};
}
test('success is persisted, duplicate same payload returns committed row without duplicate upload',async () => {
  const f=fixture(),u=await validateCustomerUpload(form());
  assert.deepEqual(await persistCustomerDocument(f.db,f.storage,actor,u),{id:u.id,replay:false});
  assert.deepEqual(await persistCustomerDocument(f.db,f.storage,actor,u),{id:u.id,replay:true});
  assert.deepEqual(f.counts(),{uploads:1,removes:0,inserts:1});
  await assert.rejects(persistCustomerDocument(f.db,f.storage,actor,{...u,digest:'f'.repeat(64)}),/DOCUMENT_UPLOAD_CONFLICT/);
});
test('read error causes zero writes, failed insert cleans object, uncertain committed insert is preserved',async () => {
  const u=await validateCustomerUpload(form()), read=fixture({readError:true});
  await assert.rejects(persistCustomerDocument(read.db,read.storage,actor,u),/DOCUMENT_READ_FAILED/);
  assert.deepEqual(read.counts(),{uploads:0,removes:0,inserts:0});
  const failed=fixture({insertError:true});
  await assert.rejects(persistCustomerDocument(failed.db,failed.storage,actor,u),/DOCUMENT_PERSIST_FAILED/);
  assert.equal(failed.counts().removes,1);
  const uncertain=fixture({insertError:true,committedDespiteError:true});
  assert.equal((await persistCustomerDocument(uncertain.db,uncertain.storage,actor,u)).replay,true);
  assert.equal(uncertain.counts().removes,0);
  const cleanup=fixture({insertError:true,cleanupError:true});
  await assert.rejects(persistCustomerDocument(cleanup.db,cleanup.storage,actor,u),/DOCUMENT_CLEANUP_PENDING/);
});
