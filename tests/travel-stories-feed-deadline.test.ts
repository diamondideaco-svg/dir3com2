import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setImmediate } from 'node:timers';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { cloneResponse } from 'next/dist/server/lib/clone-response';
import ts from 'typescript';
import * as sources from '../lib/content/arabic-travel-sources';
import type { getTravelStoriesFeed } from '../lib/content/travel-stories-feed';

type Feed = Awaited<ReturnType<typeof getTravelStoriesFeed>>;
type FetchInit = RequestInit & { next?: { revalidate?: number } };
type Fetcher = (url: string, init: FetchInit) => Promise<Response>;
const enabled = sources.arabicTravelSources.filter(source => source.enabled);
const eligible = enabled.filter(source => {
  const url = new URL(source.url);
  return url.protocol === 'https:' && sources.approvedTravelMediaHosts.has(url.hostname);
});
const first = eligible[0], second = eligible[1];
if (!first || !second) throw new Error('Two real eligible source entries are required');
const thumbnail = 'https://www.visitsaudi.com/task217-local-only.png';
const html = '<meta property="og:title" content="Synthetic official story"><meta property="og:image" content="' + thumbnail + '">';
const unavailable = () => new Response(null, { status: 503 });
const image = () => new Response(null, { headers: { 'Content-Type': 'image/png' } });
async function flush() {
  for (let i = 0; i < 8; i++) await Promise.resolve();
  await new Promise<void>(resolve => setImmediate(resolve));
}
function clock() {
  let now = 0, sequence = 0;
  const timers = new Map<number, { at: number; run: () => void }>();
  return {
    setTimeout(run: () => void, wait: number) { const id = ++sequence; timers.set(id, { at: now + wait, run }); return id; },
    clearTimeout(id: number) { timers.delete(id); },
    pending() { return timers.size; },
    async advance(ms: number) {
      const end = now + ms;
      for (;;) {
        const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        now = next[1].at; timers.delete(next[0]); next[1].run(); await flush();
      }
      now = end; await flush();
    },
  };
}
function deferred<T>() {
  let complete: ((value: T) => void) | undefined;
  const promise = new Promise<T>(resolve => { complete = resolve; });
  return { promise, resolve(value: T) { if (!complete) throw new Error('Missing resolver'); complete(value); } };
}
function hang(signal: AbortSignal | null | undefined) {
  return new Promise<Response>((_resolve, reject) => {
    const abort = () => reject(new DOMException('Synthetic abort', 'AbortError'));
    if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
  });
}
function heldBody(signal?: AbortSignal | null) {
  let writer: ReadableStreamDefaultController<Uint8Array> | undefined;
  const abort = () => writer?.error(new DOMException('Synthetic body abort', 'AbortError'));
  const response = new Response(new ReadableStream<Uint8Array>({
    start(controller) { writer = controller; signal?.addEventListener('abort', abort, { once: true }); },
    cancel() { signal?.removeEventListener('abort', abort); },
  }));
  return { response, release(value: string) {
    signal?.removeEventListener('abort', abort);
    if (!writer) throw new Error('Missing stream writer');
    writer.enqueue(new TextEncoder().encode(value)); writer.close();
  } };
}
const compiled = ts.transpileModule(readFileSync('lib/content/travel-stories-feed.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function fixture(handler: Fetcher) {
  const time = clock(), calls: { url: string; init: FetchInit }[] = [];
  const exports: { getTravelStoriesFeed?: typeof getTravelStoriesFeed } = {};
  runInNewContext(compiled, {
    exports, require(id: string) { if (id === './arabic-travel-sources') return sources; throw new Error('Unexpected module: ' + id); },
    fetch(url: string, init: FetchInit) { calls.push({ url, init }); return handler(url, init); },
    URL, TextDecoder, AbortController, WritableStream, setTimeout: time.setTimeout, clearTimeout: time.clearTimeout,
  }, { filename: 'actual-travel-stories-feed.ts' });
  const read = exports.getTravelStoriesFeed;
  if (!read) throw new Error('Actual feed export missing');
  return { time, calls, read };
}
function observe(promise: Promise<Feed>) {
  const state: { settled: boolean; value?: Feed; error?: unknown } = { settled: false };
  void promise.then(value => { state.value = value; state.settled = true; }, error => { state.error = error; state.settled = true; });
  return state;
}
function result(state: ReturnType<typeof observe>) {
  assert.equal(state.settled, true, 'feed must settle within the source budget');
  assert.equal(state.error, undefined);
  if (!state.value) throw new Error('Feed result missing');
  return state.value;
}
const ids = (feed: Feed) => Array.from(feed.items, item => item.id);

test('travel feed: header wait ends within eight seconds and aborts the actual request', async () => {
  const f = fixture(async (url, init) => url === first.url ? hang(init.signal) : unavailable());
  const state = observe(f.read()); await flush();
  await f.time.advance(7999); assert.equal(state.settled, false);
  await f.time.advance(1);
  assert.deepEqual(ids(result(state)), []);
  assert.equal(f.calls.find(call => call.url === first.url)?.init.signal?.aborted, true);
  assert.equal(f.time.pending(), 0);
});

test('travel feed: body wait after successful headers uses the same bounded cancellation', async () => {
  const f = fixture(async (url, init) => url === first.url ? heldBody(init.signal).response : unavailable());
  const state = observe(f.read()); await flush(); await f.time.advance(8000);
  assert.deepEqual(ids(result(state)), []);
  assert.equal(f.calls.find(call => call.url === first.url)?.init.signal?.aborted, true);
  assert.equal(f.calls.some(call => call.url === thumbnail), false);
  assert.equal(f.time.pending(), 0);
});

test('travel feed: thumbnail header wait is bounded and aborted', async () => {
  const f = fixture(async (url, init) => url === first.url ? new Response(html) : url === thumbnail ? hang(init.signal) : unavailable());
  const state = observe(f.read()); await flush();
  assert.equal(f.calls.some(call => call.url === thumbnail), true);
  await f.time.advance(8000);
  assert.deepEqual(ids(result(state)), []);
  assert.equal(f.calls.find(call => call.url === thumbnail)?.init.signal?.aborted, true);
  assert.equal(f.time.pending(), 0);
});

test('travel feed: eight seconds cover headers plus body plus thumbnail, without restarting the budget', async () => {
  const headers = deferred<Response>();
  let body: ReturnType<typeof heldBody> | undefined;
  const f = fixture(async (url, init) => {
    if (url === first.url) { body = heldBody(init.signal); return headers.promise; }
    return url === thumbnail ? hang(init.signal) : unavailable();
  });
  const state = observe(f.read()); await flush(); await f.time.advance(3000);
  if (!body) throw new Error('Missing body fixture');
  headers.resolve(body.response); await flush(); await f.time.advance(3000);
  body.release(html); await flush();
  assert.equal(f.calls.some(call => call.url === thumbnail), true);
  await f.time.advance(1999); assert.equal(state.settled, false);
  await f.time.advance(1);
  assert.deepEqual(ids(result(state)), []); assert.equal(f.time.pending(), 0);
});

test('travel feed: one stalled source does not discard a successful concurrent source', async () => {
  const f = fixture(async (url, init) => url === first.url ? hang(init.signal)
    : url === second.url ? new Response(html) : url === thumbnail ? image() : unavailable());
  const state = observe(f.read()); await flush();
  for (const source of eligible) assert.equal(f.calls.some(call => call.url === source.url), true);
  await f.time.advance(8000);
  const feed = result(state);
  assert.deepEqual(ids(feed), ['official-' + second.id]);
  assert.equal(feed.sourceCount, enabled.length); assert.equal(feed.refreshSeconds, 86400);
  assert.equal(f.time.pending(), 0);
});

test('travel feed: an abort-ignoring late header cannot keep the feed waiting or start a thumbnail later', async () => {
  const headers = deferred<Response>();
  let lateBodyCancelled = false;
  const f = fixture(async url => url === first.url ? headers.promise : unavailable());
  const state = observe(f.read()); await flush(); await f.time.advance(8000);
  assert.deepEqual(ids(result(state)), []);
  headers.resolve(new Response(new ReadableStream({ cancel() { lateBodyCancelled = true; } })));
  await flush();
  assert.equal(lateBodyCancelled, true);
  assert.equal(f.calls.some(call => call.url === thumbnail), false); assert.equal(f.time.pending(), 0);
});

test('travel feed: an abort-ignoring late body cannot start another request or populate stale stories', async () => {
  const body = heldBody();
  let late = true;
  const f = fixture(async url => url === first.url && late ? body.response : url === thumbnail ? image() : unavailable());
  const state = observe(f.read()); await flush(); await f.time.advance(8000);
  assert.deepEqual(ids(result(state)), []);
  body.release(html); await flush(); late = false;
  assert.equal(f.calls.some(call => call.url === thumbnail), false);
  assert.deepEqual(ids(await f.read()), []); assert.equal(f.time.pending(), 0);
});

test('travel feed: successful output and per-request revalidation retain the existing contract', async () => {
  let cancelled = 0;
  let validatedImage: Response | undefined;
  const f = fixture(async url => {
    if (url === first.url) return new Response(html);
    if (url !== thumbnail) return unavailable();
    validatedImage = new Response(new ReadableStream({
      start(controller) { controller.enqueue(Uint8Array.of(1)); controller.close(); },
      cancel() { cancelled++; },
    }), { headers: { 'Content-Type': 'image/png' } });
    return validatedImage;
  });
  const feed = await f.read(); await flush();
  assert.deepEqual(JSON.parse(JSON.stringify(feed)), {
    items: [{ id: 'official-' + first.id, service: 'drive', type: 'video', title: 'Synthetic official story',
      thumbnail, mediaUrl: first.url, duration: 0, destination: first.country, featured: true, sortOrder: enabled.indexOf(first),
      published: true, source: first.name, sourceType: first.type, country: first.countryCode, cityOrRegion: first.country,
      publishedOrEventDate: null, image: thumbnail, videoUrl: null, destinationUrl: first.url }],
    refreshSeconds: 86400, sourceCount: enabled.length,
  });
  for (const call of f.calls) {
    assert.equal(call.init.next?.revalidate, 86400);
    assert.equal(call.init.cache, undefined);
  }
  const documentCall = f.calls.find(call => call.url === first.url);
  const imageCall = f.calls.find(call => call.url === thumbnail);
  assert.equal(new Headers(documentCall?.init.headers).get('accept'), 'text/html,application/xhtml+xml');
  assert.equal(new Headers(imageCall?.init.headers).get('accept'), 'image/avif,image/webp,image/jpeg,image/png');
  assert.equal(imageCall?.init.method, 'GET');
  assert.equal(documentCall?.init.signal?.aborted, false, 'a completed source must not abort a cache-fill clone');
  assert.equal(validatedImage?.bodyUsed, true, 'validated thumbnail must finish consuming its body');
  assert.equal(cancelled, 0, 'a completed thumbnail must not cancel the parallel cache fill');
  assert.equal(f.time.pending(), 0);
});

test('travel feed: all failing refreshes preserve the last verified stories, including timeouts', async () => {
  let good = true;
  const f = fixture(async (url, init) => good
    ? url === first.url ? new Response(html) : url === thumbnail ? image() : unavailable()
    : hang(init.signal));
  const old = await f.read(); good = false;
  const state = observe(f.read()); await flush(); await f.time.advance(8000);
  assert.deepEqual(JSON.parse(JSON.stringify(result(state))), JSON.parse(JSON.stringify(old)));
  assert.equal(f.time.pending(), 0);
});

test('travel feed: initial total failure stays empty and clears timers without invented content', async () => {
  let cancelled = 0;
  const f = fixture(async () => new Response(new ReadableStream({ cancel() { cancelled++; } }), { status: 503 }));
  const feed = await f.read(); await flush();
  assert.deepEqual(ids(feed), []); assert.equal(feed.sourceCount, enabled.length);
  assert.equal(cancelled, eligible.length); assert.equal(f.time.pending(), 0);
});

for (const unsafe of ['not a URL', 'http://www.visitsaudi.com/image.png', 'https://outside.invalid/image.png',
  'https://www.visitsaudi.com.outside.invalid/image.png', 'javascript:alert(1)']) {
  test('travel feed: unapproved thumbnail URL is never fetched: ' + unsafe, async () => {
    const f = fixture(async url => url === first.url
      ? new Response('<meta property="og:image" content="' + unsafe + '">') : unavailable());
    assert.deepEqual(ids(await f.read()), []);
    assert.equal(f.calls.every(call => eligible.some(source => source.url === call.url)), true);
    assert.equal(f.time.pending(), 0);
  });
}

test('travel feed: the real source allowlist and disabled-source gate remain enforced', async () => {
  const f = fixture(async () => unavailable()); await f.read();
  assert.deepEqual(f.calls.map(call => call.url).sort(), eligible.map(source => source.url).sort());
  assert.equal(f.time.pending(), 0);
});

test('travel feed: thumbnail validation cancels rejected media without waiting for its body', async () => {
  let cancelled = 0;
  const f = fixture(async url => url === first.url ? new Response(html) : url === thumbnail
    ? new Response(new ReadableStream({ cancel() { cancelled++; return new Promise<void>(() => {}); } }),
      { headers: { 'Content-Type': 'text/html' } }) : unavailable());
  const state = observe(f.read()); await flush();
  assert.deepEqual(ids(result(state)), []);
  assert.equal(cancelled, 1); assert.equal(f.time.pending(), 0);
});


test('travel feed: cache clone and consumer body complete before the shared deadline is cleared', async () => {
  let body: ReturnType<typeof heldBody> | undefined;
  let cacheOutcome = 'pending';
  const f = fixture(async (url, init) => {
    if (url === first.url) return new Response(html);
    if (url !== thumbnail) return unavailable();
    body = heldBody(init.signal);
    const [cacheCopy, consumerCopy] = cloneResponse(new Response(body.response.body, { headers: { 'Content-Type': 'image/png' } }));
    void cacheCopy.arrayBuffer().then(() => { cacheOutcome = 'complete'; }, () => { cacheOutcome = 'aborted'; });
    return consumerCopy;
  });
  const state = observe(f.read()); await flush();
  assert.equal(state.settled, false, 'thumbnail headers alone must not release the source deadline while cache I/O remains');
  await f.time.advance(7999); assert.equal(state.settled, false); assert.equal(cacheOutcome, 'pending');
  if (!body) throw new Error('Missing cache body');
  body.release('synthetic-image-bytes'); await flush();
  assert.deepEqual(ids(result(state)), ['official-' + first.id]);
  assert.equal(cacheOutcome, 'complete');
  assert.equal(f.calls.find(call => call.url === thumbnail)?.init.signal?.aborted, false);
  assert.equal(f.time.pending(), 0);
});

test('travel feed: cache clone body stalled beyond the budget is aborted with its consumer', async () => {
  let cacheOutcome = 'pending';
  const f = fixture(async (url, init) => {
    if (url === first.url) return new Response(html);
    if (url !== thumbnail) return unavailable();
    const body = heldBody(init.signal);
    const [cacheCopy, consumerCopy] = cloneResponse(new Response(body.response.body, { headers: { 'Content-Type': 'image/png' } }));
    void cacheCopy.arrayBuffer().then(() => { cacheOutcome = 'complete'; }, () => { cacheOutcome = 'aborted'; });
    return consumerCopy;
  });
  const state = observe(f.read()); await flush(); await f.time.advance(8000);
  assert.deepEqual(ids(result(state)), []);
  assert.equal(cacheOutcome, 'aborted');
  assert.equal(f.calls.find(call => call.url === thumbnail)?.init.signal?.aborted, true);
  assert.equal(f.time.pending(), 0);
});
