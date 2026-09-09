import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { isProductVersionConflict, productConflictMessage, productResultMessages } from '../lib/products/lifecycle-feedback';

test('five lifecycle success messages follow Arabic and English contracts', () => {
  assert.deepEqual(Object.keys(productResultMessages), ['created', 'updated', 'published', 'unpublished', 'archived']);
  for (const message of Object.values(productResultMessages)) {
    assert.match(message.ar, /[\u0600-\u06ff]/);
    assert.doesNotMatch(message.en, /[\u0600-\u06ff]/);
    assert.ok(message.en.length > 15);
  }
  const page = readFileSync(new URL('../app/admin/products/page.tsx', import.meta.url), 'utf8');
  assert.ok(page.includes('<AdminText {...resultMessage} />'));
  assert.ok(page.includes('Object.hasOwn(productResultMessages'));
});

test('conflict classifier does not mask authorization or internal failures', () => {
  assert.equal(isProductVersionConflict({ message: 'PRODUCT_VERSION_STALE' }), true);
  for (const error of [null, {}, { message: 'COUNTRY_SCOPE_FORBIDDEN' }, { message: 'PRODUCT_VERSION_REQUIRED' }, { message: 'SQL PRODUCT_VERSION_STALE detail' }]) assert.equal(isProductVersionConflict(error), false);
  assert.match(productConflictMessage.en, /not saved/);
});

function harness(error: { message: string } | null, denied = false) {
  const calls: Array<{ rpc: string; args: Record<string, unknown> }> = [];
  const refreshed: string[] = [];
  const client = {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'product-id', country: 'Egypt' }, error: null }) }) }) }),
    rpc: async (rpc: string, args: Record<string, unknown>) => { calls.push({ rpc, args }); return { error }; },
  };
  const source = readFileSync(new URL('../lib/actions/product-actions.ts', import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports: Record<string, (data: FormData) => Promise<unknown>> = {};
  vm.runInNewContext(output, { exports, require: (name: string) => {
    if (name === 'next/cache') return { revalidatePath: (p: string) => refreshed.push(p) };
    if (name === 'next/navigation') return { redirect: (p: string) => { throw new Error('REDIRECT:' + p); } };
    if (name === '@/lib/auth/admin') return {
      requireScopedAdminActionAccess: async () => { if (denied) throw new Error('DENIED'); return { supabase: client, scope: 'Egypt' }; },
      assertCountryAllowed: (_scope: string, country: string) => { if (country !== 'Egypt') throw new Error('COUNTRY_SCOPE_FORBIDDEN'); },
      // Authorization/query bounding is covered by ceo-identity-runtime; this harness isolates lifecycle feedback.
      scopeCountryQuery: <T,>(query: T, scope: string) => { assert.equal(scope, 'Egypt'); return query; },
    };
    if (name === '@/lib/supabase/server') return { createSupabaseServerClient: async () => client };
    if (name === '@/lib/products/lifecycle-feedback') return { isProductVersionConflict };
    if (name === '@/lib/security/validation') return {
      sanitizeText: (v: string, fallback: string) => v || fallback,
      sanitizeNumber: (v: unknown) => Number(v),
      sanitizeBoolean: (v: unknown) => Boolean(v),
    };
    throw new Error('Unexpected import ' + name);
  } });
  return { actions: exports, calls, refreshed };
}

function fields() {
  const data = new FormData();
  for (const [k, v] of Object.entries({ id: 'product-id', expectedVersion: '2', nameAr: 'اسم', nameEn: 'Unsaved input', country: 'Egypt' })) data.set(k, v);
  return data;
}

test('stale update returns conflict, keeps submitted version and does not revalidate or retry', async () => {
  const h = harness({ message: 'PRODUCT_VERSION_STALE' });
  const result = await h.actions.updateProductAction(fields());
  assert.equal(JSON.stringify(result), '{"conflict":true}');
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].args.p_expected_version, 2);
  assert.equal(h.calls[0].args.p_name_en, 'Unsaved input');
  assert.deepEqual(h.refreshed, []);
});

test('stale lifecycle controls return to a localized conflict instead of success', async () => {
  for (const name of ['publishProductAction', 'unpublishProductAction', 'archiveProductAction']) {
    const h = harness({ message: 'PRODUCT_VERSION_STALE' });
    await assert.rejects(h.actions[name](fields()), /REDIRECT:\/admin\/products\?conflict=version/);
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].args.p_expected_version, 2);
    assert.deepEqual(h.refreshed, []);
  }
});

test('success redirects stay canonical; unauthorized and other failures never become conflicts', async () => {
  const h = harness(null);
  await assert.rejects(h.actions.updateProductAction(fields()), /REDIRECT:\/admin\/products\?result=updated/);
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.refreshed, ['/admin/products', '/marketplace']);
  const denied = harness(null, true);
  await assert.rejects(denied.actions.updateProductAction(fields()), /DENIED/);
  assert.equal(denied.calls.length, 0);
  const failure = harness({ message: 'private SQL details' });
  await assert.rejects(failure.actions.updateProductAction(fields()), /^Error: PRODUCT_UPDATE_FAILED$/);
});

test('editor preserves unsaved inputs and disables resubmission until explicit review', () => {
  const editor = readFileSync(new URL('../components/products/ProductEditorForm.tsx', import.meta.url), 'utf8');
  assert.ok(editor.includes('event.preventDefault()'));
  assert.ok(editor.includes('disabled={pending || conflict}'));
  assert.ok(editor.includes('target="_blank" rel="noopener noreferrer"'));
  assert.ok(editor.includes('name="expectedVersion" value={product.lifecycle_version'));
  assert.doesNotMatch(editor, /\.reset\(|router\.refresh\(/);
});

test('partner requests own the active locale direction instead of inheriting the public body RTL', () => {
  const component = readFileSync(new URL('../components/portal/PartnerRequestsClient.tsx', import.meta.url), 'utf8');
  assert.ok(component.includes("const locale = ar ? 'ar' : 'en'"));
  assert.ok(component.includes("<main lang={locale} dir={ar ? 'rtl' : 'ltr'}"));
});
