import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { getPartnerRequestActionErrorMessage } from '../components/portal/partner-request-list-state';

// Execute the real UI handler, not a second implementation. No network or
// WhatsApp navigation is permitted by this isolated regression harness.
const source = readFileSync(new URL('../components/portal/PartnerRequestsClient.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('PartnerRequestsClient.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler = '';
function visit(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'startWhatsapp') handler = node.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(handler, 'Actual UI handler must exist');
const executable = ts.transpileModule(handler, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

async function exercise(mode: 'blocked' | 'opened' | 'throw' | 'lost' | 'refresh' | 'legacy' | 'cancel', ar = false) {
  const events: string[] = [];
  let urls: Record<string, string> = {};
  let unrecoverable: Record<string, boolean> = {};
  let error: string | null = null;
  let working: string | null = null;
  const url = 'https://wa.me/15555550100?text=ISOLATED_QA_DO_NOT_SEND';
  const context = {
    Error, String, JSON, ar, requests: [{ id: 'qa-request', handoff_started_at: null }],
    setWorkingId: (value: string | null) => { working = value; },
    setActionError: (value: string | null) => { error = value; },
    setHandoffUrls: (update: (current: typeof urls) => typeof urls) => { urls = update(urls); events.push('recoverable_link'); },
    setUnrecoverableHandoffs: (update: (current: typeof unrecoverable) => typeof unrecoverable) => { unrecoverable = update(unrecoverable); },
    fetch: async (path: string, init: RequestInit) => {
      assert.equal(path, '/api/partner-portal/requests');
      assert.equal(init.method, 'POST');
      assert.deepEqual(JSON.parse(String(init.body)), { requestId: 'qa-request' });
      events.push('record');
      if (mode === 'lost') throw new Error('NETWORK_RESPONSE_LOST');
      return { ok: mode !== 'legacy', json: async () => mode === 'legacy'
        ? { error: { code: 'REQUEST_HANDOFF_REPLAY_UNAVAILABLE' } } : { data: { url } } };
    },
    refreshRequests: async () => { events.push('refresh'); if (mode === 'refresh') throw new Error('REFRESH_FAILED'); },
    window: {
      confirm: (message: string) => { assert.ok(message.length > 0); return mode !== 'cancel'; },
      open: (target: string, name: string) => {
        assert.equal(target, ''); assert.equal(name, '_blank'); events.push('open');
        if (mode === 'throw') throw new Error('POPUP_FAILURE');
        if (mode === 'blocked') return null;
        return { opener: {}, location: { set href(value: string) { assert.equal(value, url); events.push('navigate'); } } };
      },
    },
  };
  const invoke = runInNewContext(`${executable}\nstartWhatsapp`, context);
  await invoke('qa-request');
  assert.equal(working, null, 'No stuck loading state');
  return { events, urls, unrecoverable, error };
}

for (const ar of [false, true]) {
  const locale = ar ? 'ar' : 'en';
  test(`${locale}: blocked popup retains link and reports recorded, not delivered`, async () => {
    const state = await exercise('blocked', ar);
    assert.deepEqual(state.events, ['record', 'recoverable_link', 'open', 'refresh']);
    assert.equal(state.error, 'popup_blocked');
    assert.ok(state.urls['qa-request']);
    assert.match(getPartnerRequestActionErrorMessage('popup_blocked', locale), ar ? /منع النافذة/ : /blocked the window/);
  });
  test(`${locale}: opening is navigation only, never an external send`, async () => {
    const state = await exercise('opened', ar);
    assert.deepEqual(state.events, ['record', 'recoverable_link', 'open', 'navigate', 'refresh']);
    assert.equal(state.error, null);
  });
  test(`${locale}: browser exception after record stays recoverable`, async () => {
    const state = await exercise('throw', ar);
    assert.equal(state.error, 'handoff_failed'); assert.ok(state.urls['qa-request']);
  });
  test(`${locale}: lost POST response does not open or claim completion`, async () => {
    const state = await exercise('lost', ar);
    assert.deepEqual(state.events, ['record', 'refresh']); assert.equal(state.error, 'handoff_failed');
  });
  test(`${locale}: refresh failure preserves authoritative manual link`, async () => {
    const state = await exercise('refresh', ar);
    assert.equal(state.error, 'refresh_failed'); assert.ok(state.urls['qa-request']);
  });
  test(`${locale}: legacy missing snapshot cannot invent a link`, async () => {
    const state = await exercise('legacy', ar);
    assert.equal(state.error, 'replay_unavailable'); assert.equal(state.unrecoverable['qa-request'], true);
    assert.deepEqual(state.urls, {}); assert.ok(!state.events.includes('open'));
  });
  test(`${locale}: declined confirmation performs no write or navigation`, async () => {
    assert.deepEqual((await exercise('cancel', ar)).events, []);
  });
}
