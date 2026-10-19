import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import type { ReactElement } from 'react';
import ts from 'typescript';
import { ConversationSession } from '../lib/dabra/conversation-session';
import * as persistence from '../lib/dabra/travel-commerce-state';

// Executes the actual root provider/hooks with controlled auth/network hooks.
// Component lifecycle evidence, not browser/pixel or real authentication evidence.
function fixture() {
  const require = createRequire(import.meta.url);
  type Value = { session: ConversationSession; boundary: string };
  type Effect = { deps: unknown[]; cleanup?: () => void };
  const effects: Effect[] = [];
  const pending: Array<() => void> = [];
  let cursor = 0;
  let session: unknown;
  const currencyRef = { current: 'SAR' };
  let path = '/'; let language = 'ar'; let currency = 'SAR';
  let currentValue: Value;
  let auth: ((event: string, session: { user: { id: string } } | null) => void) | null = null;
  const cache = new Map<string, string>();
  const store = { getItem: (key: string) => cache.get(key) ?? null, setItem: (key: string, value: string) => { cache.set(key, value); }, removeItem: (key: string) => { cache.delete(key); } };
  type Identity = { identityState: string; authenticated: boolean; userId?: string };
  const requests: Array<{ signal: AbortSignal; reply: (identity: Identity) => void }> = [];
  const exports: { DabraConversationProvider?: (props: { children: null }) => ReactElement<{ value: Value }>; useDabraConversation?: () => { session: ConversationSession; state: ReturnType<ConversationSession['getSnapshot']> } } = {};
  const setCurrency = (value: string) => { currency = value; };
  runInNewContext(ts.transpileModule(fs.readFileSync('components/dabra/DabraConversationProvider.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, AbortController, AbortSignal, crypto, window: { localStorage: store, sessionStorage: store },
    fetch: (_url: string, init: { signal: AbortSignal }) => new Promise(resolve => requests.push({ signal: init.signal, reply: identity => resolve({ ok: true, json: async () => identity }) })),
    require(name: string) {
      if (name === 'react') return { ...require('react'),
        useState: (init: () => unknown) => { session ??= init(); return [session, () => {}]; },
        useRef: () => currencyRef,
        useContext: () => currentValue,
        useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
        useEffect: (effect: () => void | (() => void), deps: unknown[]) => {
          const index = cursor++; const previous = effects[index];
          if (!previous || deps.some((v, i) => !Object.is(v, previous.deps[i]))) pending.push(() => {
            previous?.cleanup?.(); const cleanup = effect(); effects[index] = { deps, cleanup: typeof cleanup === 'function' ? cleanup : undefined };
          });
        },
      };
      if (name === 'react/jsx-runtime') return require(name);
      if (name === 'next/navigation') return { usePathname: () => path };
      if (name.endsWith('/supabase/client')) return { supabase: { auth: { onAuthStateChange: (callback: (event: string, session: { user: { id: string } } | null) => void) => { auth = callback; return { data: { subscription: { unsubscribe: () => { auth = null; } } } }; } } } };
      if (name.endsWith('/conversation-session')) return { ConversationSession };
      if (name.endsWith('/travel-commerce-state')) return persistence;
      if (name.endsWith('/LanguageProvider')) return { useLanguage: () => ({ language }) };
      if (name.endsWith('/useDisplayCurrency')) return { useDisplayCurrency: () => ({ currency, setCurrency }) };
      throw new Error('Unmocked provider dependency: ' + name);
    },
  });
  assert.ok(exports.DabraConversationProvider); assert.ok(exports.useDabraConversation);
  const render = () => {
    cursor = 0; currentValue = exports.DabraConversationProvider!({ children: null }).props.value;
    return exports.useDabraConversation!();
  };
  const commit = () => { while (pending.length) pending.shift()!(); };
  const respond = async (identity: Identity = { identityState: 'authenticated', authenticated: true, userId: 'synthetic-a' }) => {
    const request = requests.at(-1); assert.ok(request); request.reply(identity); await new Promise<void>(resolve => setImmediate(resolve));
  };
  const changeAuth = (event: string, userId: string | null = 'synthetic-a') => { assert.ok(auth); auth(event, userId ? { user: { id: userId } } : null); };
  return { render, commit, respond, changeAuth, requests, cache, currency: () => currency,
    path: (value: string) => { path = value; }, language: (value: string) => { language = value; },
    unmount: () => { for (const effect of effects) effect.cleanup?.(); },
  };
}

test('actual provider identity transition clears memory/cache before issuing a new identity read', async () => {
  const f = fixture(); let view = f.render(); f.commit(); await f.respond(); view = f.render();
  assert.equal(view.state.ready, true);
  view.session.setMessages([{id:'private',role:'user',text:'A context'}]); view.session.setDraft('A draft');
  f.cache.set(persistence.storageKey('user:synthetic-a','context'), 'private');
  f.cache.set(persistence.storageKey('user:synthetic-a','cart'), 'private');
  const job = view.session.begin(); assert.ok(job);
  f.changeAuth('SIGNED_OUT');
  const cleared = f.render();
  assert.equal(cleared.state.ready, false); assert.equal(cleared.state.messages.length, 0); assert.equal(cleared.state.draft, '');
  assert.equal(job.signal.aborted, true);
  assert.equal(f.cache.has(persistence.storageKey('user:synthetic-a','context')), false);
  assert.equal(f.cache.has(persistence.storageKey('user:synthetic-a','cart')), false);
  await f.respond({identityState:'anonymous_confirmed',authenticated:false});
  assert.equal(f.render().state.persistence?.storage, 'session'); f.unmount();
});

test('INITIAL_SESSION preserves a typed turn and does not cause a second identity read', async () => {
  const f = fixture(); f.render(); f.commit(); await f.respond(); const view = f.render();
  view.session.setDraft('typed'); const count = f.requests.length;
  f.changeAuth('INITIAL_SESSION');
  assert.equal(f.requests.length, count); assert.equal(f.render().state.draft, 'typed'); f.unmount();
});

test('aborted older identity response cannot overwrite the newer authenticated account', async () => {
  const f = fixture(); f.render(); f.commit(); const old = f.requests[0];
  f.changeAuth('SIGNED_IN'); await f.respond({identityState:'authenticated',authenticated:true,userId:'synthetic-b'});
  old.reply({identityState:'authenticated',authenticated:true,userId:'synthetic-a'});
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(f.render().state.persistence?.ownerId, 'user:synthetic-b'); f.unmount();
});

test('same-realm route transition preserves pending chat without refetching identity', async () => {
  const f = fixture(); f.render(); f.commit(); await f.respond(); const view = f.render();
  view.session.setMessages([{id:'q',role:'user',text:'Cairo'}]); view.session.setDraft('unsent');
  const job = view.session.begin(); assert.ok(job); const reads = f.requests.length;
  f.path('/partners'); f.render(); f.commit();
  f.path('/dabra'); const full = f.render(); f.commit();
  assert.equal(f.requests.length, reads); assert.equal(full.state.pending, true);
  assert.equal(full.state.messages[0].text, 'Cairo'); assert.equal(full.state.draft, 'unsent');
  assert.equal(job.signal.aborted, false); f.unmount();
});

test('realm transition hides old messages before effects, then restores only a validated empty scope', async () => {
  const f = fixture(); f.render(); f.commit(); await f.respond(); const view = f.render();
  view.session.setMessages([{id:'private',role:'user',text:'private customer'}]);
  f.path('/partner-portal'); const beforeEffects = f.render();
  assert.equal(beforeEffects.state.ready, false); assert.equal(beforeEffects.state.messages.length, 0);
  f.commit(); await f.respond();
  assert.equal(f.render().state.ready, true); assert.equal(f.render().state.messages.length, 0);
  f.render().session.setMessages([{id:'provider-private',role:'user',text:'private partner'}]);
  f.path('/provider-portal'); assert.equal(f.render().state.messages.length, 0); f.commit(); await f.respond();
  assert.equal(f.render().state.messages.length, 0); f.unmount();
});

test('logout restores only the continuity-applied display currency before dropping private metadata', async () => {
  const f = fixture(); f.render(); f.commit(); await f.respond(); const view = f.render();
  view.session.setContinuityCurrency({before:'USD',applied:'SAR'});
  f.changeAuth('SIGNED_OUT');
  assert.equal(f.currency(), 'USD'); assert.equal(view.session.continuityCurrency, null); f.unmount();
});

test('locale transition cancels the pending answer while retaining completed text and draft', async () => {
  const f = fixture(); f.render(); f.commit(); await f.respond(); const view = f.render();
  view.session.setMessages([{id:'complete',role:'assistant',text:'completed Arabic answer'}]);
  view.session.setDraft('unsent Arabic draft');
  const job = view.session.begin(); assert.ok(job);
  const reads = f.requests.length;
  f.language('en'); f.render(); f.commit(); const after = f.render();
  assert.equal(job.signal.aborted, true); assert.equal(after.state.pending, false);
  assert.equal(after.state.messages[0].text, 'completed Arabic answer');
  assert.equal(after.state.draft, 'unsent Arabic draft'); assert.equal(f.requests.length, reads);
  f.unmount();
});

for (const nextOwner of ['synthetic-a', 'synthetic-b', null]) test('refresh is server-verified and preserves only the same account: ' + nextOwner, async () => {
  const f = fixture(); f.render(); f.commit(); await f.respond(); const view = f.render();
  view.session.setMessages([{id:'q',role:'user',text:'A text'}]); view.session.setDraft('A draft');
  const contextKey = persistence.storageKey('user:synthetic-a','context');
  const cartKey = persistence.storageKey('user:synthetic-a','cart');
  f.cache.set(contextKey,'A context'); f.cache.set(cartKey,'A cart');
  const job=view.session.begin(); assert.ok(job);
  f.changeAuth('TOKEN_REFRESHED');
  assert.equal(f.render().state.pending,true); assert.equal(job.signal.aborted,false);
  await f.respond(nextOwner ? {identityState:'authenticated',authenticated:true,userId:nextOwner} : {identityState:'unavailable',authenticated:false});
  const same=nextOwner==='synthetic-a'; const after=f.render();
  assert.equal(after.state.draft,same?'A draft':''); assert.equal(after.state.messages.length,same?1:0);
  assert.equal(after.state.pending,same); assert.equal(job.signal.aborted,!same);
  assert.equal(f.cache.has(contextKey),same); assert.equal(f.cache.has(cartKey),same);
  f.unmount();
});

test('changed SDK refresh identity clears immediately and stale validation cannot restore it', async () => {
  const f=fixture(); f.render(); f.commit(); await f.respond(); const view=f.render();
  view.session.setDraft('A private'); const job=view.session.begin(); assert.ok(job);
  f.changeAuth('TOKEN_REFRESHED'); const old=f.requests.at(-1); assert.ok(old);
  f.changeAuth('TOKEN_REFRESHED','synthetic-b');
  assert.equal(f.render().state.draft,''); assert.equal(job.signal.aborted,true);
  await f.respond({identityState:'authenticated',authenticated:true,userId:'synthetic-b'});
  old.reply({identityState:'authenticated',authenticated:true,userId:'synthetic-a'});
  await new Promise<void>(resolve=>setImmediate(resolve));
  assert.equal(f.render().state.persistence?.ownerId,'user:synthetic-b'); assert.equal(f.render().state.draft,''); f.unmount();
});
