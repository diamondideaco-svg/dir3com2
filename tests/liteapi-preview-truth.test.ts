import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveLiteApiPreviewProviderState } from '../lib/marketplace/real-preview-contract';

const notRequested = { Riyadh: 'not_requested', Cairo: 'not_requested' } as const;

test('missing LiteAPI credential is blocked with localized fail-closed details', () => {
  const state = resolveLiteApiPreviewProviderState(null, notRequested);
  assert.equal(state.access, 'blocked');
  assert.equal(state.accessState, 'credential_missing');
  assert.equal(state.blocker?.provider, 'liteapi');
  assert.equal(state.blocker?.code, 'credential_missing');
  assert.equal(state.blocker?.environment, 'unconfigured');
  assert.match(state.blocker?.currentStatus.ar ?? '', /غير مهيأ/);
  assert.match(state.blocker?.currentStatus.en ?? '', /not configured/i);
});

test('rejected LiteAPI credential maps UNAUTHORIZED_VENDOR_ACCESS to access_blocked without reporting authorized', () => {
  const state = resolveLiteApiPreviewProviderState('sandbox', { Riyadh: 'access_blocked', Cairo: 'access_blocked' });
  assert.equal(state.access, 'blocked');
  assert.equal(state.accessState, 'credential_rejected');
  assert.notEqual(state.access, 'authorized');
  assert.equal(state.blocker?.code, 'credential_rejected');
  assert.match(state.blocker?.providerResponse.ar ?? '', /UNAUTHORIZED_VENDOR_ACCESS/);
  assert.match(state.blocker?.providerResponse.en ?? '', /UNAUTHORIZED_VENDOR_ACCESS/);
  assert.match(state.blocker?.currentStatus.ar ?? '', /رفض LiteAPI/);
  assert.match(state.blocker?.currentStatus.en ?? '', /rejected/i);
  assert.match(state.blocker?.activationRequired.en ?? '', /credential.*entitlement/i);
});

test('successful LiteAPI responses are authoritative while truthful zero results remain authorized', () => {
  const results = resolveLiteApiPreviewProviderState('production', { Riyadh: 'ok', Cairo: 'no_results' });
  assert.equal(results.access, 'authorized');
  assert.equal(results.accessState, 'authorized');
  assert.equal(results.blocker, null);
});

test('configured credentials without a provider probe never imply authorized access', () => {
  const state = resolveLiteApiPreviewProviderState('sandbox', notRequested);
  assert.equal(state.access, 'blocked');
  assert.equal(state.accessState, 'access_unverified');
  assert.equal(state.blocker?.code, 'access_unverified');
  assert.notEqual(state.access, 'authorized');
});

test('temporary non-auth LiteAPI failure remains unavailable and never leaks credential values', () => {
  const state = resolveLiteApiPreviewProviderState('sandbox', { Riyadh: 'unavailable', Cairo: 'unavailable' });
  assert.equal(state.access, 'unavailable');
  assert.equal(state.accessState, 'temporarily_unavailable');
  assert.equal(state.blocker?.code, 'temporarily_unavailable');
  assert.match(state.blocker?.currentStatus.ar ?? '', /غير متاح/);
  assert.match(state.blocker?.currentStatus.en ?? '', /unavailable/i);
  assert.doesNotMatch(JSON.stringify(state), /sand_[A-Za-z0-9]|PublicKey=|Signature=/);
});
