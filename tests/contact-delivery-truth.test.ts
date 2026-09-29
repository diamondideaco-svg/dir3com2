import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { handleContact, type SaveContact } from '../lib/contact/handler';
import { parseContact } from '../lib/contact/contract';
const input = {name:'QA',email:'qa@example.invalid',phone:'',subject:'service',message:'Isolated enquiry',country:'EG'};
const request = (body: unknown = input, headers: Record<string,string> = {}) => new Request('http://localhost/api/contact', {
  method:'POST',headers:{'content-type':'application/json','idempotency-key':randomUUID(),...headers},body:JSON.stringify(body),
});
const unavailable: SaveContact = async () => ({kind:'unavailable'});
test('persistence unavailable never acknowledges a message',async()=>{
  const r=await handleContact(request(),unavailable); assert.equal(r.status,503);
  assert.equal(r.headers.get('cache-control'),'no-store'); assert.equal((await r.json()).reference,undefined);
});
test('acknowledges committed receipt without claiming external delivery',async()=>{
  const reference=randomUUID(); const r=await handleContact(request(),async()=>({kind:'saved',reference,replay:false}));
  assert.equal(r.status,201); assert.deepEqual(await r.json(),{reference,status:'received',externalDelivery:false});
});
test('replay preserves reference and returns 200',async()=>{
  const reference=randomUUID(); const r=await handleContact(request(),async()=>({kind:'saved',reference,replay:true}));
  assert.equal(r.status,200); assert.equal((await r.json()).reference,reference);
});
test('input shape, country, email and lengths rejected before persistence',async()=>{
  for(const body of [null,[],{...input,country:'ALL'},{...input,email:'wrong'}, {...input,name:'x'.repeat(121)}, {...input,message:'x'.repeat(2001)}, {...input,subject:'admin'}]) {
    assert.equal((await handleContact(request(body),async()=>{throw Error('must not run');})).status,400);
  }
});
test('body size bounded, including no Content-Length',async()=>{
  assert.equal((await handleContact(request({...input,message:'x'.repeat(18000)}),unavailable)).status,413);
});
test('foreign origin and invalid idempotency key rejected',async()=>{
  assert.equal((await handleContact(request(input,{origin:'https://other.invalid'}),unavailable)).status,403);
  assert.equal((await handleContact(request(input,{'idempotency-key':'bad'}),unavailable)).status,400);
});
test('safe retry and conflict statuses',async()=>{
  const limited=await handleContact(request(),async()=>({kind:'limited'}));
  assert.equal(limited.status,429);assert.equal(limited.headers.get('retry-after'),'3600');
  assert.equal((await handleContact(request(),async()=>({kind:'conflict'}))).status,409);
  assert.equal((await handleContact(request(),async()=>{throw Error('private backend detail');})).status,503);
});
test('email normalization and no silent truncation',()=>{
  assert.equal(parseContact({...input,email:' QA@EXAMPLE.INVALID '})?.email,'qa@example.invalid');
  assert.equal(parseContact({...input,message:'x'.repeat(2001)}),null);
});
