import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

for (const contact of [null, undefined, '', 'Named contact']) {
  test(`partner details renders nullable contact safely: ${String(contact)}`, async () => {
    const partner = { id: 'isolated', country: 'Egypt', city: 'Cairo', phone: 'test-only', commercial_registration: 'test-only', company_name: 'QA company', contact_person: contact };
    const exports: Record<string, (props: unknown) => Promise<unknown>> = {};
    const jsx = (type: unknown, props: unknown) => ({ type, props });
    const source = ts.transpileModule(readFileSync('app/admin/partners/[id]/page.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    runInNewContext(source, { exports, require(name: string) {
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name === 'next/link') return 'a';
      if (name === 'next/navigation') return { notFound() { throw Error('NOT_FOUND'); } };
      if (name === '@/lib/auth/admin') return {
        isCountryAllowed: () => true, scopeCountryQuery: (query: unknown) => query,
        requireScopedAdminPageDataAccess: async () => ({ scope: { mode: 'global' }, supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: partner, error: null }) }) }) }) } }),
      };
      if (name === '@/components/admin/AdminLocale') return { AdminText: 'localized', AdminStatusText: 'status' };
      if (name === '@/components/admin/PartnerForm' || name === '@/components/admin/PartnerActivation') return 'component';
      throw Error('Unexpected import ' + name);
    } });
    const rendered = JSON.stringify(await exports.default({ params: Promise.resolve({ id: partner.id }) }));
    assert.ok(rendered.includes('QA company'));
    assert.equal(rendered.includes('Partner profile data is incomplete'), !contact);
  });
}

test('both confirmation surfaces use native modal containment and explicit cancellation/restoration', () => {
  for (const file of ['components/admin/AdminLocale.tsx', 'components/products/ProductLifecycleControls.tsx']) {
    const source = readFileSync(file, 'utf8');
    assert.match(source, /<dialog ref=\{dialogRef\}/);
    assert.match(source, /dialog\.showModal\(\)/);
    assert.match(source, /onCancel=/);
    assert.match(source, /dialog\.close\(\)/);
    assert.match(source, /opener\.isConnected\) opener\.focus\(\)/);
    assert.doesNotMatch(source, /window\.confirm/);
  }
});
