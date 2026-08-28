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

const root = process.cwd();
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
  const start = component.indexOf('async function resolveValidatedIdentity()');
  const fetchIndex = component.indexOf("fetch('/api/dabra/session-identity'", start);
  const detachCall = component.indexOf('detachSensitiveState()', start);
  assert(detachCall > start && detachCall < fetchIndex);
  for (const clear of ['setMessages([welcomeMessage(languageRef.current)])', 'setCart([])', 'setFavorites([])', 'setPersistenceContext(null)']) {
    assert.match(component.slice(component.indexOf('function detachSensitiveState()'), start), new RegExp(clear.replace(/[()[\]]/g, '\\$&')));
  }
});

test('authenticated to anonymous transition uses the same immediate detach boundary', () => {
  const callback = component.slice(component.indexOf('onAuthStateChange((event) => {'));
  assert(callback.indexOf('detachSensitiveState()') < callback.indexOf('window.setTimeout'));
  assert(callback.indexOf('identityRequestRef.current += 1') < callback.indexOf('window.setTimeout'));
  assert.match(component, /identityState === 'anonymous_confirmed'/);
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
  assert.match(component, /const requestId = \+\+identityRequestRef\.current/);
  assert.match(component, /requestId !== identityRequestRef\.current/g);
  assert.match(component, /identityRequestRef\.current \+= 1/);
});

test('chat controls stay disabled until validated identity resolution completes', () => {
  assert.match(component, /AbortSignal\.timeout\(8_000\)/);
  assert.match(component, /if \(!message \|\| chatInFlightRef\.current \|\| !identityResolved\) return/);
  assert.match(component, /disabled=\{!identityResolved \|\| \(!input\.trim\(\) && !attachments\.length\) \|\| chatInFlight\}/);
  assert.match(component, /placeholder=\{identityResolved \? t\.placeholder : t\.securePlaceholder\}/);
  assert.match(component, /securePlaceholder: 'Preparing your secure session\.\.\.'/);
});

test('initial Supabase session notification cannot detach a newly entered turn', () => {
  assert.match(component, /onAuthStateChange\(\(event\) =>/);
  assert.match(component, /if \(event === 'INITIAL_SESSION'\) return/);
});
