import test from 'node:test';
import assert from 'node:assert/strict';
import { ConversationSession } from '../lib/dabra/conversation-session';

function ready(ownerId = 'user:synthetic-a', boundary = 'customer-public') {
  const session = new ConversationSession();
  session.resolve(session.invalidate(boundary), { ownerId, storage: 'local' });
  return session;
}
const user = (text: string) => ({ id: 'user-synthetic', role: 'user' as const, text });

test('two mounted views share messages and unsent text while navigation only unsubscribes', () => {
  const session = ready();
  let floating = 0; let fullPage = 0;
  const closeFloating = session.subscribe(() => floating++);
  session.setDraft('قارن الفنادق / compare hotels');
  session.setMessages([user('ثلاث ليال في القاهرة')]);
  closeFloating();
  const openFull = session.subscribe(() => fullPage++);
  assert.equal(session.getSnapshot().draft, 'قارن الفنادق / compare hotels');
  assert.equal(session.getSnapshot().messages[0].text, 'ثلاث ليال في القاهرة');
  session.setDraft('new unsent text');
  openFull();
  assert.equal(floating, 2); assert.equal(fullPage, 1);
  assert.equal(session.getSnapshot().draft, 'new unsent text');
});

test('one atomic submission wins even when both views invoke it in the same microtask batch', async () => {
  const session = ready();
  const results = await Promise.all([Promise.resolve().then(() => session.begin()), Promise.resolve().then(() => session.begin()), Promise.resolve().then(() => session.begin())]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(session.getSnapshot().pending, true);
});

test('pending transport survives view unmount and the next view receives its one final answer', async () => {
  const session = ready();
  const job = session.begin(); assert.ok(job);
  let calls = 0;
  let deliver!: (value: string) => void;
  const response = new Promise<string>(resolve => { calls++; deliver = resolve; });
  session.update(job, [user('Cairo'), { id: `assistant-${job.id}`, role: 'assistant', text: '' }]);
  const closeFloating = session.subscribe(() => {}); closeFloating();
  assert.equal(job.signal.aborted, false);
  assert.equal(session.begin(), null);
  const openFull = session.subscribe(() => {});
  deliver('Three nights');
  session.update(job, current => current.map(m => m.role === 'assistant' ? { ...m, text: 'Three nights' } : m));
  assert.equal(await response, 'Three nights'); session.finish(job); openFull();
  assert.equal(calls, 1); assert.equal(session.getSnapshot().messages.length, 2);
  assert.equal(session.getSnapshot().messages[1].text, 'Three nights');
  assert.equal(session.getSnapshot().pending, false);
});

test('shared hydration cannot overwrite typed/current conversation or a pending send', () => {
  const session = ready();
  session.hydrateMessages([user('legacy')]);
  session.hydrateMessages([user('stale cache')]);
  assert.equal(session.getSnapshot().messages[0].text, 'legacy');
  session.setMessages([]); const job = session.begin(); assert.ok(job);
  session.hydrateMessages([user('stale cache')]);
  assert.deepEqual(session.getSnapshot().messages, []);
});

test('new text typed while pending is not cleared by completion or transport error', () => {
  const session = ready(); const job = session.begin(); assert.ok(job);
  session.setDraft('edit made in other view');
  session.fail(job, 'network'); session.finish(job);
  assert.equal(session.getSnapshot().draft, 'edit made in other view');
  assert.equal(session.getSnapshot().error, 'network');
  assert.equal(session.getSnapshot().pending, false);
});

test('logout clears private messages, staged context, draft and pending authority immediately', () => {
  const session = ready(); const job = session.begin(); assert.ok(job);
  session.update(job, [user('private trip')]); session.setDraft('private draft');
  session.context.draft = 'private staged summary'; session.setContinuityDraft('private staged summary');
  session.markPrivate();
  session.invalidate('customer-public');
  assert.equal(job.signal.aborted, true);
  assert.equal(session.isCurrent(job), false);
  assert.deepEqual(session.getSnapshot().messages, []);
  assert.equal(session.getSnapshot().draft, '');
  assert.equal(session.getSnapshot().continuityDraft, null);
  assert.equal(session.context.lease, null);
  assert.equal(session.context.draft, null);
  assert.equal(session.privateConversation, false);
  assert.equal(session.getSnapshot().ready, false);
  assert.equal(session.begin(), null);
});

test('late identity result cannot rebind A after B began resolving', () => {
  const session = new ConversationSession();
  const a = session.invalidate('customer-public');
  const b = session.invalidate('customer-public');
  session.resolve(a, { ownerId: 'user:a', storage: 'local' });
  assert.equal(session.getSnapshot().persistence, null);
  session.resolve(b, { ownerId: 'user:b', storage: 'local' });
  assert.equal(session.getSnapshot().persistence?.ownerId, 'user:b');
});

test('late A response/error/finally cannot append to B or release B pending lock', () => {
  const session = ready('user:a'); const a = session.begin(); assert.ok(a);
  const generation = session.invalidate('customer-public');
  session.resolve(generation, { ownerId: 'user:b', storage: 'local' });
  const b = session.begin(); assert.ok(b);
  session.update(b, [user('B only')]);
  session.update(a, [user('A private late answer')]); session.fail(a, 'A error'); session.finish(a);
  assert.equal(session.getSnapshot().messages[0].text, 'B only');
  assert.equal(session.getSnapshot().error, null);
  assert.equal(session.getSnapshot().pending, true);
  session.finish(b); assert.equal(session.getSnapshot().pending, false);
});

test('role/realm boundary clears context even for the same authenticated user', () => {
  const session = ready('user:a'); session.setMessages([user('customer private')]);
  const generation = session.invalidate('partner');
  session.resolve(generation, { ownerId: 'user:a', storage: 'local' });
  assert.deepEqual(session.getSnapshot().messages, []);
  assert.equal(session.getSnapshot().boundary, 'partner');
});

test('failed/unresolved identity never grants a conversation send', () => {
  const session = new ConversationSession();
  session.resolve(session.invalidate('customer-public'), null);
  assert.equal(session.begin(), null);
  assert.equal(session.getSnapshot().pending, false);
});

test('cancellation aborts one transport, removes its partial answer and keeps typed content', () => {
  const session = ready(); const job = session.begin(); assert.ok(job);
  session.setDraft('keep my draft');
  session.update(job, [user('question'), { id: `assistant-${job.id}`, role: 'assistant', text: 'partial' }]);
  session.cancel();
  assert.equal(job.signal.aborted, true);
  assert.equal(session.getSnapshot().messages.length, 1);
  assert.equal(session.getSnapshot().draft, 'keep my draft');
  session.update(job, [user('late')]);
  assert.equal(session.getSnapshot().messages[0].text, 'question');
});

test('forgetting derived continuity context keeps independently typed messages and draft', () => {
  const session = ready(); session.setMessages([user('independent'), { id: 'derived', role: 'assistant', text: 'saved trip' }]);
  session.context.tag('derived'); session.context.draft = 'staged'; session.setDraft('typed');
  session.forgetContext();
  assert.deepEqual(session.getSnapshot().messages, [user('independent')]);
  assert.equal(session.getSnapshot().draft, 'typed');
  assert.equal(session.getSnapshot().continuityDraft, null);
});

test('different root instances never share conversation state or transport locks', () => {
  const a = ready(); const b = ready(); a.setMessages([user('A root')]);
  assert.deepEqual(b.getSnapshot().messages, []);
  assert.ok(a.begin()); assert.ok(b.begin());
});

test('stale view composer and message callbacks cannot publish after an identity switch', () => {
  const session = ready('user:a'); const a = session.getSnapshot().generation;
  session.resolve(session.invalidate('customer-public'), { ownerId: 'user:b', storage: 'local' });
  session.setDraft('B draft'); session.setMessages([user('B only')]);
  session.setDraftFor(a, 'A late voice transcript'); session.setMessagesFor(a, [user('A private')]);
  assert.equal(session.getSnapshot().draft, 'B draft');
  assert.equal(session.getSnapshot().messages[0].text, 'B only');
});

test('a submission reservation survives intentional new-trip context clearing and blocks another view', () => {
  const session = ready(); session.context.draft = 'old saved summary';
  const job = session.begin(); assert.ok(job);
  session.forgetContext(job);
  assert.equal(session.getSnapshot().pending, true); assert.equal(session.isCurrent(job), true);
  assert.equal(session.begin(), null); assert.equal(session.context.draft, null);
  session.finish(job); assert.equal(session.getSnapshot().pending, false);
});

test('both view transports reserve the shared lock before an asynchronous continuity gate', async () => {
  const fs = await import('node:fs');
  const full = fs.readFileSync('components/dabra/DabraChatCommerce.tsx','utf8');
  const floating = fs.readFileSync('components/layout/FloatingDibrah.tsx','utf8');
  const fullHandler = full.slice(full.indexOf('async function sendMessage('),full.indexOf('async function playApprovedVoice('));
  const floatingHandler = floating.slice(floating.indexOf('const sendDraft = useCallback(async () =>'),floating.indexOf('\n  return (',floating.indexOf('const sendDraft = useCallback(async () =>')));
  assert.ok(fullHandler.indexOf('conversation.begin()') >= 0 && fullHandler.indexOf('conversation.begin()') < fullHandler.indexOf('await ensureContinuityFresh'));
  assert.ok(floatingHandler.indexOf('conversation.begin()') >= 0 && floatingHandler.indexOf('conversation.begin()') < floatingHandler.indexOf("await fetch('/api/dabra/continuity'"));
});
