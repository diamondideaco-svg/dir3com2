import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { resolveDabraSessionUser, unresolvedDabraIdentity } from '@/lib/dabra/session-user-resolution';
import {
  createPersisted,
  persistenceContextForIdentity,
  readPersisted,
  storageKey,
  validatePersistedMessages,
} from '@/lib/dabra/travel-commerce-state';

import { ConversationSession } from '../lib/dabra/conversation-session';

const root = process.cwd();
const provider = fs.readFileSync(path.join(root, 'components', 'dabra', 'DabraConversationProvider.tsx'), 'utf8');
const component = fs.readFileSync(path.join(root, 'components', 'dabra', 'DabraChatCommerce.tsx'), 'utf8');
const route = fs.readFileSync(path.join(root, 'app', 'api', 'dabra', 'session-identity', 'route.ts'), 'utf8');
const anonymousSessionId = '12345678-1234-1234-1234-123456789abc';

test('getUser validation error is unresolved rather than anonymous', async () => {
  const error = new Error('validation failed');
  const result = await resolveDabraSessionUser(async () => ({ data: { user: null }, error }));
  assert.deepEqual(result, { identityState: 'unresolved_or_error', user: null, error });
});

test('confirmed missing session remains a legitimate anonymous identity', async () => {
  const error = Object.assign(new Error('Auth session missing!'), { name: 'AuthSessionMissingError' });
  const result = await resolveDabraSessionUser(async () => ({ data: { user: null }, error }));
  assert.deepEqual(result, { identityState: 'anonymous_confirmed', user: null });
});

test('unexpected identity resolver failure is unresolved rather than anonymous', async () => {
  const result = await resolveDabraSessionUser(async () => { throw new Error('offline'); });
  assert.equal(result.identityState, 'unresolved_or_error');
  assert.match(route, /unresolvedDabraIdentity\(\), \{ status: 503 \}/);
});

test('unresolved identity cannot select anonymous persistence', () => {
  assert.equal(persistenceContextForIdentity(unresolvedDabraIdentity(), anonymousSessionId), null);
});

test('unresolved or malformed identity cannot select user persistence', () => {
  assert.equal(persistenceContextForIdentity({ identityState: 'unresolved_or_error', authenticated: true, userId: 'user-a' }, ''), null);
  assert.equal(persistenceContextForIdentity({ authenticated: true, userId: 'user-a' }, ''), null);
});

test('user transition detaches transcript cart and favorites before identity fetch', () => {
  const start = provider.indexOf('const resolveIdentity = () => {');
  const clear = provider.indexOf('session.invalidate(boundary)', start);
  const request = provider.indexOf("fetch('/api/dabra/session-identity'", start);
  assert.ok(start >= 0 && clear > start && clear < request);
  assert.match(provider, /clearPreviousContext\(\)/);
  assert.match(component, /DabraChatCommerceSession key=\{state.generation\}/);
  assert.match(component, /const \[cart, setCart\] = useState<CartItem\[\]>\(\[\]\)/);
  assert.match(component, /const \[favorites, setFavorites\] = useState<Array<string \| number>>\(\[\]\)/);
  const session = new ConversationSession();
  session.resolve(session.invalidate('customer-public'), {ownerId:'user:a',storage:'local'});
  session.setMessages([{id:'a',role:'user',text:'private'}]);
  session.invalidate('customer-public');
  assert.deepEqual(session.getSnapshot().messages, []);
  assert.equal(session.getSnapshot().persistence, null);
});

test('authenticated to anonymous transition uses the same immediate detach boundary', () => {
  assert.match(provider, /onAuthStateChange\(event =>/);
  assert.match(provider, /if \(event !== 'INITIAL_SESSION'\) resolveIdentity\(\)/);
  assert.match(provider, /identityState === 'anonymous_confirmed'/);
  const session = new ConversationSession();
  session.resolve(session.invalidate('customer-public'), {ownerId:'user:a',storage:'local'});
  session.setDraft('private draft');
  const generation = session.invalidate('customer-public');
  assert.equal(session.getSnapshot().ready, false);
  session.resolve(generation, {ownerId:'anonymous:synthetic',storage:'session'});
  assert.equal(session.getSnapshot().draft, '');
  assert.equal(session.getSnapshot().persistence?.ownerId, 'anonymous:synthetic');
});

test('same authenticated user restores only its own valid state', () => {
  const context = persistenceContextForIdentity({ identityState: 'authenticated', authenticated: true, userId: 'user-a' }, '');
  assert.deepEqual(context, { ownerId: 'user:user-a', storage: 'local' });
  const messages = [{ id: 'm1', role: 'user' as const, text: 'private-a' }];
  const raw = JSON.stringify(createPersisted(messages, context!.ownerId, 1000));
  assert.deepEqual(readPersisted(raw, context!.ownerId, validatePersistedMessages, 1001), messages);
  assert.equal(readPersisted(raw, 'user:user-b', validatePersistedMessages, 1001), null);
});

test('confirmed anonymous restores only its session-scoped state', () => {
  const context = persistenceContextForIdentity({ identityState: 'anonymous_confirmed', authenticated: false }, anonymousSessionId);
  assert.deepEqual(context, { ownerId: `anonymous:${anonymousSessionId}`, storage: 'session' });
  assert.notEqual(storageKey(context!.ownerId, 'context'), storageKey('user:user-a', 'context'));
});

test('stale identity responses cannot restore a previous user after a newer transition', () => {
  const session = new ConversationSession();
  const older = session.invalidate('customer-public');
  const current = session.invalidate('customer-public');
  session.resolve(current, {ownerId:'user:b',storage:'local'});
  session.resolve(older, {ownerId:'user:a',storage:'local'});
  assert.equal(session.getSnapshot().persistence?.ownerId, 'user:b');
});

test('chat controls stay disabled until validated identity resolution completes', () => {
  assert.match(provider, /AbortSignal\.timeout\(8_000\)/);
  assert.match(component, /const job = conversation.begin\(\)/);
  assert.match(component, /if \(!job\) return/);
  assert.match(component, /disabled=\{!identityResolved \|\| \(!input\.trim\(\) && !continuityDraft && !attachments\.length\) \|\| chatInFlight\}/);
  assert.match(component, /placeholder=\{identityResolved \? t\.placeholder : t\.securePlaceholder\}/);
  const session = new ConversationSession();
  session.resolve(session.invalidate('customer-public'), null);
  assert.equal(session.begin(), null);
});

test('initial Supabase session notification cannot detach a newly entered turn', () => {
  assert.match(provider, /onAuthStateChange\(event =>/);
  assert.match(provider, /if \(event !== 'INITIAL_SESSION'\) resolveIdentity\(\)/);
});
