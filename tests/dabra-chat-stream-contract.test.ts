import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/ai2/chat/route';
import { ContinuityContext } from '@/lib/dabra/continuity-context';
import { ConversationSession } from '@/lib/dabra/conversation-session';
import { createPersisted, readPersisted, validatePersistedMessages } from '@/lib/dabra/travel-commerce-state';
import {
  consumeDabraChatResponse,
  createDabraAssistantTextResponse,
  DABRA_SAFE_CHAT_ERROR,
  DABRA_SAFE_EMPTY_ANSWER,
  DABRA_CHAT_STREAM_CONTRACT_HEADER,
  DABRA_CHAT_STREAM_CONTRACT_VERSION,
  DABRA_CHAT_ANSWER_BYTES_HEADER,
} from '@/lib/dabra/chat-response-contract';

const root = process.cwd();
const component = fs.readFileSync(path.join(root, 'components', 'dabra', 'DabraChatCommerce.tsx'), 'utf8');

function chatRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/ai2/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function multipartChatRequest(files: File[]) {
  const form = new FormData();
  form.set('message', 'راجع المرفق');
  form.set('history', '[]');
  form.set('stream', 'true');
  for (const file of files) form.append('attachment', file, file.name);
  return new NextRequest('http://localhost/api/ai2/chat', { method: 'POST', body: form });
}

test('stream=true returns assistant text only with the explicit safe headers', async () => {
  const response = await POST(chatRequest({ message: 'مرحبا', stream: true }));
  const text = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /^text\/plain;\s*charset=utf-8$/i);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get(DABRA_CHAT_STREAM_CONTRACT_HEADER), DABRA_CHAT_STREAM_CONTRACT_VERSION);
  assert.equal(Number(response.headers.get(DABRA_CHAT_ANSWER_BYTES_HEADER)),new TextEncoder().encode(text).byteLength);
  assert(text.trim().length > 0);
  assert.doesNotMatch(text, /^\s*[{[]/);
  for (const internalField of ['providerErrorCategory', 'groundingStatus', 'fallbackAttempts', 'promptVersion']) {
    assert(!text.includes(internalField));
  }
});

test('non-stream requests preserve the existing JSON response contract', async () => {
  const response = await POST(chatRequest({ message: 'مرحبا' }));
  const payload = await response.json() as { answer?: unknown };

  assert.match(response.headers.get('content-type') ?? '', /^application\/json/i);
  assert.equal(typeof payload.answer, 'string');
});

test('invalid stream negotiation is rejected without returning internal metadata', async () => {
  const response = await POST(chatRequest({ message: 'مرحبا', stream: 'true' }));
  const raw = await response.text();

  assert.equal(response.status, 400);
  assert.match(response.headers.get('content-type') ?? '', /^application\/json/i);
  assert.deepEqual(JSON.parse(raw), { error: 'Invalid stream mode.' });
  assert(!raw.includes('provider'));
  assert(!raw.includes('groundingStatus'));
});

test('client JSON fallback extracts only the approved answer field', async () => {
  const visible: string[] = [];
  const answer = await consumeDabraChatResponse(new Response(JSON.stringify({
    answer: 'الجواب الظاهر فقط',
    provider: 'internal-provider',
    providerErrorCategory: 'secret-debug-state',
  }), { headers: { 'content-type': 'application/json' } }), (text) => visible.push(text));

  assert.equal(answer, 'الجواب الظاهر فقط');
  assert.deepEqual(visible, ['الجواب الظاهر فقط']);
  assert(!visible.join('').includes('internal-provider'));
  assert(!visible.join('').includes('secret-debug-state'));
});

test('malformed JSON fallback never exposes the raw payload', async () => {
  const raw = '{"provider":"internal","answer":';
  const visible: string[] = [];
  const answer = await consumeDabraChatResponse(new Response(raw, {
    headers: { 'content-type': 'application/json' },
  }), (text) => visible.push(text));

  assert.equal(answer, DABRA_SAFE_EMPTY_ANSWER);
  assert.deepEqual(visible, [DABRA_SAFE_EMPTY_ANSWER]);
  assert(!visible.join('').includes(raw));
  assert(!visible.join('').includes('provider'));
});

test('route-created stream contains answer only and no internal metadata', async () => {
  const response = createDabraAssistantTextResponse({
    answer: 'النص الآمن',
    provider: 'hidden-provider',
    groundingStatus: 'hidden-status',
  });
  const rawText = await response.clone().text();
  assert.equal(rawText, 'النص الآمن');

  assert(!rawText.includes('hidden-provider'));
  assert(!rawText.includes('hidden-status'));
});

test('untagged prefixed text cannot reach render, persistence, or speech sinks', async () => {
  const raw = 'data: {"answer":"ok","providerErrorCategory":"secret"}';
  const visible: string[] = [];
  const answer = await consumeDabraChatResponse(new Response(raw, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  }), (text) => visible.push(text));

  assert.equal(answer, DABRA_SAFE_EMPTY_ANSWER);
  assert.deepEqual(visible, [DABRA_SAFE_EMPTY_ANSWER]);
  assert(!visible.join('').includes('providerErrorCategory'));
  assert(!visible.join('').includes('secret'));
});

test('failed API request follows the safe user-facing error path', async () => {
  await assert.rejects(
    consumeDabraChatResponse(new Response('internal failure details', {
      status: 503,
      headers: { 'content-type': 'text/plain' },
    }), () => assert.fail('failed response must not render its body')),
  );
  assert.match(component, /catch \{[\s\S]*text: DABRA_LOCALE_ERROR\[language\]/);
  assert(!DABRA_SAFE_CHAT_ERROR.includes('internal'));
});

test('only final visible assistant text reaches transcript persistence and no unapproved speech sink exists', () => {
  assert.match(component, /await consumeDabraChatResponse/);
  assert.doesNotMatch(component, /speechSynthesis|SpeechSynthesisUtterance|normalizeDabraSpeechText/);
  assert.match(component, /item\.id === assistantId \? \{ \.\.\.item, text: visibleAnswer \}/);
  assert.doesNotMatch(component, /text:\s*normalizeDabraSpeechText/);
  assert.match(component, /createPersisted\(conversation.cachedMessages\(messages\)/);
  assert.doesNotMatch(component, /createPersisted\([^\n]*(response|payload|raw)/);
});

test('cache retains bounded completed independent text, excluding leased derivations and pending transport', async () => {
  const context = new ContinuityContext();
  context.tag('seed', 'derived-answer');
  context.beginAnswer('pending');
  const messages = Array.from({ length: 25 }, (_, i) => ({ id: `user-${i}`, role: 'user' as const, text: `Independent ${i}` }));
  const answer = await consumeDabraChatResponse(new Response(JSON.stringify({ answer: 'Visible final answer', providerErrorCategory: 'private-debug' }), { headers: { 'content-type': 'application/json' } }), () => {});
  const all = [...messages,
    { id: 'seed', role: 'user' as const, text: 'Private resumed trip' },
    { id: 'derived-answer', role: 'assistant' as const, text: 'Derived destination' },
    { id: 'pending', role: 'assistant' as const, text: 'Partial stream' },
    { id: 'final', role: 'assistant' as const, text: answer, raw: 'private-debug' }];
  const envelope = JSON.stringify(createPersisted(context.cachedMessages(all), 'user:A', 100));
  const restored = readPersisted(envelope, 'user:A', validatePersistedMessages, 101)!;
  assert.equal(restored.length, 20);
  assert.equal(restored[0].id, 'user-6');
  assert.deepEqual(restored.at(-1), { id: 'final', role: 'assistant', text: 'Visible final answer' });
  for (const excluded of ['Private resumed', 'Derived destination', 'Partial stream', 'private-debug']) assert.equal(envelope.includes(excluded), false);
  assert.equal(readPersisted(envelope, 'user:B', validatePersistedMessages, 101), null);
  context.finishAnswer('pending');
  assert.ok(context.cachedMessages(all).some(message=>message.id==='pending'));
});

test('multipart chat validates and deduplicates attachment bytes without storing or forwarding metadata', async () => {
  const jpeg = new Uint8Array(20);
  jpeg.set([0xff, 0xd8, 0xff], 0);
  jpeg.set([0xff, 0xd9], 18);
  const file = new File([jpeg], 'private-name.jpg', { type: 'image/jpeg' });
  const response = await POST(multipartChatRequest([file, file]));
  const answer = await response.text();
  assert.equal(response.status, 200);
  assert(answer.length > 0);
  assert(!answer.includes('private-name'));
  const route = fs.readFileSync(path.join(root, 'app/api/ai2/chat/route.ts'), 'utf8');
  assert.match(route, /validateAndNormalizeDocumentFile/);
  assert.match(route, /Set<string>/);
  assert.match(route, /modeValue === 'chat' \|\| modeValue === 'travel-plan'/);
  assert.doesNotMatch(route, /storage\.from|\.upload\(/);
});

test('malformed, executable, oversized-count and unsupported attachments fail safely', async () => {
  const executable = new File([new Uint8Array([0x4d, 0x5a, 0, 0])], 'photo.jpg', { type: 'image/jpeg' });
  const response = await POST(multipartChatRequest([executable]));
  assert.equal(response.status, 400);
  assert.equal(await response.text(), DABRA_SAFE_CHAT_ERROR);
  const tooMany = await POST(multipartChatRequest(Array.from({ length: 4 }, (_, index) => new File([new Uint8Array([1])], `${index}.png`, { type: 'image/png' }))));
  assert.equal(tooMany.status, 400);
});

import { runDabraBoundaryCase } from './fixtures/run-dabra-boundary';
test('shared actual persistence excludes private content', () => {
  runDabraBoundaryCase('shared actual persistence excludes private content');
});

test('HTTP200 empty or malformed delivery signals uncertainty without treating the visible fallback as success', async () => {
  const bad=[Response.json({}),Response.json({answer:'   '}),new Response('{invalid',{headers:{'Content-Type':'application/json'}}),
    new Response('',{headers:{'Content-Type':'text/plain','X-DABRA-Response-Contract':'assistant-text-v1'}}),new Response('untrusted',{headers:{'Content-Type':'text/html'}})];
  for(const response of bad){let uncertain=0;const answer=await consumeDabraChatResponse(response,()=>{},'safe fallback',()=>{uncertain++;});assert.equal(answer,'safe fallback');assert.equal(uncertain,1);}
  let uncertain=0;assert.equal(await consumeDabraChatResponse(Response.json({answer:'SYNTHETIC valid'}),()=>{},'safe fallback',()=>{uncertain++;}),'SYNTHETIC valid');assert.equal(uncertain,0);
});

test('invalid HTTP200 delivery preserves selected files and request UUID through the existing submission catch', async () => {
  assert.match(component, /DABRA_LOCALE_ERROR\[language\], \(\) => \{ throw new Error\('DABRA_RESPONSE_UNCERTAIN'\)/);
  const invalidResponses = [
    Response.json({}), Response.json({ answer: '   ' }),
    new Response('{invalid', { headers: { 'Content-Type': 'application/json' } }),
    new Response('', { headers: { 'Content-Type': 'text/plain', 'X-DABRA-Response-Contract': 'assistant-text-v1' } }),
    new Response('untrusted', { headers: { 'Content-Type': 'text/html' } }),
    new Response('SYNTHETIC missing length', { headers: { 'Content-Type': 'text/plain', 'X-DABRA-Response-Contract': 'assistant-text-v1' } }),
    new Response('{invalid', { headers: { 'Content-Type': 'text/plain', 'X-DABRA-Response-Contract': 'assistant-text-v1', 'X-DABRA-Answer-Bytes': '8' } }),
  ];
  for (const response of invalidResponses) {
    const session = new ConversationSession();
    session.resolve(session.invalidate('customer-public'), { ownerId: 'user:synthetic', storage: 'local' });
    const file = new File(['SYNTHETIC'], 'synthetic.txt', { type: 'text/plain' });
    let attachments = [{ id: 'synthetic-selection', file, status: 'uploading' }];
    const requestKey = () => JSON.stringify(['form', 'SYNTHETIC request', 'SAR', 'en', null, attachments.map(item => item.id)]);
    const body = new FormData(); body.append('attachment', file);
    const job = session.begin(); assert.ok(job);
    const original = session.transport(job, requestKey(), body);
    let invalidCallbacks = 0; let caught = 0; let cleared = false;
    try {
      await consumeDabraChatResponse(response, () => assert.fail('invalid text must not enter the success callback'), 'safe fallback', () => {
        invalidCallbacks++;
        throw new Error('DABRA_RESPONSE_UNCERTAIN');
      });
      attachments = []; cleared = true;
    } catch (error) {
      caught++;
      assert.equal((error as Error).message, 'DABRA_RESPONSE_UNCERTAIN');
      session.fail(job, 'safe error');
      attachments = attachments.map(item => ({ ...item, status: 'error' }));
    } finally {
      session.finish(job);
    }
    assert.equal(invalidCallbacks, 1); assert.equal(caught, 1); assert.equal(cleared, false);
    assert.equal(attachments[0].id, 'synthetic-selection');
    assert.strictEqual(attachments[0].file, file);
    assert.equal(attachments[0].status, 'error');
    assert.equal(session.getSnapshot().pending, false);
    // Only a later explicit user submission begins a new job. Its transport
    // keeps the exact original body and request UUID; nothing redispatches here.
    const retry = session.begin(); assert.ok(retry); assert.notEqual(retry.id, job.id);
    const retried = session.transport(retry, requestKey(), new FormData());
    assert.equal(retried.id, original.id); assert.strictEqual(retried.body, body);
    assert.strictEqual((retried.body as FormData).get('attachment'), file);
    session.finish(retry);
  }
});

for (const answer of ['SYNTHETIC complete answer', 'إجابة اصطناعية كاملة 🌍']) test('byte-bound stream completion for '+answer, async () => {
  const full=createDabraAssistantTextResponse({answer});const bytes=new TextEncoder().encode(answer);
  assert.equal(Number(full.headers.get(DABRA_CHAT_ANSWER_BYTES_HEADER)),bytes.byteLength);
  assert.equal(await consumeDabraChatResponse(full,()=>{},'safe',()=>assert.fail('complete answer')),answer);
  const session=new ConversationSession();session.resolve(session.invalidate('customer-public'),{ownerId:'user:synthetic',storage:'local'});
  const job=session.begin();assert.ok(job);const original=session.transport(job,'same-input','SYNTHETIC body');
  const short=new Response(bytes.slice(0,bytes.length-3),{headers:createDabraAssistantTextResponse({answer}).headers});
  let invalid=0;
  await assert.rejects(consumeDabraChatResponse(short,()=>{},'safe',()=>{invalid++;throw new Error('SYNTHETIC incomplete');}),/incomplete/);
  session.fail(job,'incomplete');session.finish(job);assert.equal(invalid,1);
  const retry=session.begin();assert.ok(retry);assert.deepEqual(session.transport(retry,'same-input','new body'),original);session.finish(retry);
});

test('stream byte counts reject invalid or excessive lengths and extra bytes without consuming retry identity',async()=>{
 const answer='إجابة SYNTHETIC 🌍',bytes=new TextEncoder().encode(answer);
 for(const length of ['0','-1','NaN','Infinity','256001','1e3',String(bytes.length-1)]){
  const headers=createDabraAssistantTextResponse({answer}).headers;headers.set(DABRA_CHAT_ANSWER_BYTES_HEADER,length);
  let invalid=0;await assert.rejects(consumeDabraChatResponse(new Response(bytes,{headers}),()=>{},'safe',()=>{invalid++;throw Error('SYNTHETIC invalid length');}),/invalid length/);assert.equal(invalid,1);
 }
 const headers=createDabraAssistantTextResponse({answer}).headers;
 const split=new Response(new ReadableStream<Uint8Array>({start(controller){for(const byte of bytes)controller.enqueue(new Uint8Array([byte]));controller.close();}}),{headers});
 assert.equal(await consumeDabraChatResponse(split,()=>{},'safe',()=>assert.fail('valid multibyte split')),answer);
});

test('overlong non-ending stream cancels before decoding or rendering excess bytes without awaiting cancellation',async()=>{
 const session=new ConversationSession();session.resolve(session.invalidate('customer-public'),{ownerId:'user:synthetic',storage:'local'});
 const job=session.begin();assert.ok(job);const original=session.transport(job,'same-input','SYNTHETIC body');
 let cancelled=0,invalid=0;const visible:string[]=[];
 const headers=createDabraAssistantTextResponse({answer:'safe'}).headers;
 const stream=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new TextEncoder().encode('sa'));controller.enqueue(new TextEncoder().encode('EXCESS MUST NOT DISPLAY'));},cancel(){cancelled++;return new Promise(()=>{});}});
 let timeout:ReturnType<typeof setTimeout>|undefined;
 try {
  await assert.rejects(Promise.race([
   consumeDabraChatResponse(new Response(stream,{headers}),text=>visible.push(text),'fallback',()=>{invalid++;throw Error('SYNTHETIC overrun');}),
   new Promise<never>((_,reject)=>{timeout=setTimeout(()=>reject(Error('waited for cancellation')),300);}),
  ]),/SYNTHETIC overrun/);
 }finally{if(timeout)clearTimeout(timeout);session.fail(job,'overrun');session.finish(job);}
 assert.equal(cancelled,1);assert.equal(invalid,1);assert.deepEqual(visible,['sa']);
 const retry=session.begin();assert.ok(retry);assert.deepEqual(session.transport(retry,'same-input','new body'),original);session.finish(retry);
});
