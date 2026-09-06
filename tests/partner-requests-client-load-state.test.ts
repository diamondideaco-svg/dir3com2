import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createPartnerRequestListRetry,
  getPartnerRequestActionErrorMessage,
  getPartnerRequestListPresentation,
  loadPartnerRequestList,
  type PartnerRequestListPresentation,
  type PartnerRequestListRow,
  type PartnerRequestListState,
} from '../components/portal/partner-request-list-state';

type RequestRow = PartnerRequestListRow;

function requestRow(id: string): RequestRow {
  return {
    id,
    request_reference: `REQ-${id}`,
    request_type: 'drive',
    status: 'submitted',
    traveller_count: 1,
    created_at: '2026-09-05T00:00:00.000Z',
  };
}

const emptyClaims = [
  'There are no requests tied to your products right now.',
  'لا توجد طلبات مرتبطة بمنتجاتك حالياً.',
];

const whatsappClaims = [
  'WhatsApp handoff is not configured in this environment.',
  'تسليم واتساب غير مفعّل في هذه البيئة.',
];

function response(status: number, payload: unknown): typeof fetch {
  return (async () => new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })) as typeof fetch;
}

function visibleText(state: PartnerRequestListState<RequestRow>, language: 'ar' | 'en') {
  const presentation = getPartnerRequestListPresentation(state, language);
  return [
    presentation.loadError,
    presentation.retry,
    presentation.loading,
    presentation.empty,
    presentation.whatsappNotConfigured,
  ].filter(Boolean).join('\n');
}

function assertTruthfulFailure(state: PartnerRequestListState<RequestRow>) {
  assert.equal(state.status, 'failure');

  for (const language of ['ar', 'en'] as const) {
    const text = visibleText(state, language);
    assert.match(text, language === 'ar'
      ? /تعذر تحميل الطلبات حالياً\./
      : /Requests could not be loaded right now\./);
    assert.match(text, language === 'ar' ? /إعادة المحاولة/ : /Retry/);

    for (const claim of [...emptyClaims, ...whatsappClaims]) {
      assert.doesNotMatch(text, new RegExp(claim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
  }
}

test('initial 403 renders only truthful localized failure claims', async () => {
  const state = await loadPartnerRequestList(response(403, {
    error: { code: 'PORTAL_FORBIDDEN' },
  }));
  assertTruthfulFailure(state);
});

test('initial 500 renders only truthful localized failure claims', async () => {
  const state = await loadPartnerRequestList(response(500, {
    error: { code: 'REQUESTS_LOAD_FAILED' },
  }));
  assertTruthfulFailure(state);
});

test('network rejection renders only truthful localized failure claims', async () => {
  const state = await loadPartnerRequestList((async () => {
    throw new Error('network unavailable');
  }) as typeof fetch);
  assertTruthfulFailure(state);
});

test('successful empty load permits empty and known configuration claims', async () => {
  const state = await loadPartnerRequestList(response(200, {
    data: [],
    whatsappConfigured: false,
  }));

  assert.equal(state.status, 'success');
  for (const language of ['ar', 'en'] as const) {
    const presentation: PartnerRequestListPresentation<RequestRow> = getPartnerRequestListPresentation(state, language);
    assert.equal(presentation.loadError, null);
    assert.equal(presentation.requests.length, 0);
    assert.ok(presentation.empty);
    assert.ok(presentation.whatsappNotConfigured);
  }
});

test('successful non-empty load renders rows without unsupported claims', async () => {
  const row = requestRow('request-1');
  const state = await loadPartnerRequestList(response(200, {
    data: [row],
    whatsappConfigured: true,
  }));

  assert.equal(state.status, 'success');
  for (const language of ['ar', 'en'] as const) {
    const presentation: PartnerRequestListPresentation<RequestRow> = getPartnerRequestListPresentation(state, language);
    assert.deepEqual(presentation.requests, [row]);
    assert.equal(presentation.loadError, null);
    assert.equal(presentation.empty, null);
    assert.equal(presentation.whatsappNotConfigured, null);
  }
});

test('malformed request rows fail closed instead of reaching the renderer', async () => {
  for (const malformedRow of [null, {}, { ...requestRow('bad-timeline'), timeline: [{}] }]) {
    const state = await loadPartnerRequestList(response(200, {
      data: [malformedRow],
      whatsappConfigured: false,
    }));
    assertTruthfulFailure(state);
  }
});

test('action errors derive fresh Arabic and English copy from stable state', () => {
  for (const error of ['popup_blocked', 'refresh_failed', 'replay_unavailable', 'handoff_failed'] as const) {
    const ar = getPartnerRequestActionErrorMessage(error, 'ar');
    const en = getPartnerRequestActionErrorMessage(error, 'en');
    assert.notEqual(ar, en);
    assert.match(ar, /[\u0600-\u06ff]/);
    assert.match(en, /[A-Za-z]/);
  }
});

test('retry transitions from failure through loading to successful rows', async () => {
  let attempt = 0;
  const fetcher = (async () => {
    attempt += 1;
    if (attempt === 1) return new Response('{}', { status: 500 });
    return Response.json({
      data: [requestRow('request-2')],
      whatsappConfigured: true,
    });
  }) as typeof fetch;

  const failed = await loadPartnerRequestList(fetcher);
  assertTruthfulFailure(failed);

  const retry = createPartnerRequestListRetry<RequestRow>(4);
  assert.equal(retry.reloadVersion, 5);
  const loading = retry.requestList;
  for (const language of ['ar', 'en'] as const) {
    const presentation = getPartnerRequestListPresentation(loading, language);
    assert.ok(presentation.loading);
    assert.equal(presentation.loadError, null);
    assert.equal(presentation.empty, null);
    assert.equal(presentation.whatsappNotConfigured, null);
  }

  const succeeded = await loadPartnerRequestList(fetcher);
  assert.equal(succeeded.status, 'success');
  assert.equal(getPartnerRequestListPresentation(succeeded, 'en').requests.length, 1);
  assert.equal(getPartnerRequestListPresentation(succeeded, 'ar').loadError, null);
});
