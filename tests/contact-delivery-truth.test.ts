import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { POST } from '../app/api/contact/route';

const submit = (body: unknown) => POST(new NextRequest('http://localhost/api/contact', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}));

test('valid contact cannot acknowledge delivery without durable storage or transport', async () => {
  const response = await submit({name:'QA', email:'qa@example.invalid',subject:'service',message:'Isolated message',phone:''});
  assert.equal(response.status,503);
  assert.equal(response.headers.get('cache-control'),'no-store');
  const body = await response.json();
  assert.equal(body.code,'CONTACT_DELIVERY_UNAVAILABLE');
  assert.equal(body.message,undefined);
  assert.match(body.error,/لم تُرسل/);
});

test('contact still rejects incomplete submissions',async()=>{
  assert.equal((await submit({name:'QA'})).status,400);
});

test('contact still rejects malformed email',async()=>{
  assert.equal((await submit({name:'QA', email:'invalid',subject:'service',message:'QA'})).status,400);
});
