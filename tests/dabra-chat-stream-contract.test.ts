import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/ai2/chat/route';
import {
  consumeDabraChatResponse,
  createDabraAssistantTextResponse,
  DABRA_SAFE_CHAT_ERROR,
  DABRA_SAFE_EMPTY_ANSWER,
  DABRA_CHAT_STREAM_CONTRACT_HEADER,
  DABRA_CHAT_STREAM_CONTRACT_VERSION,
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
  assert.match(component, /catch \{[\s\S]*text: DABRA_SAFE_CHAT_ERROR/);
  assert(!DABRA_SAFE_CHAT_ERROR.includes('internal'));
});

test('only final visible assistant text reaches speech and transcript persistence', () => {
  assert.match(component, /const answer = await consumeDabraChatResponse/);
  assert.match(component, /new SpeechSynthesisUtterance\(normalizeDabraSpeechText\(answer, 'ar-SA'\)\)/);
  assert.match(component, /item\.id === assistantId \? \{ \.\.\.item, text: visibleAnswer \}/);
  assert.doesNotMatch(component, /text:\s*normalizeDabraSpeechText/);
  assert.match(component, /createPersisted\(messages\.slice\(-20\)/);
  assert.doesNotMatch(component, /createPersisted\([^\n]*(response|payload|raw)/);
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
