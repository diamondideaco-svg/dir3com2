import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as catalog from '../lib/drive/catalog';
import * as search from '../lib/drive/search';
import * as context from '../lib/marketplace/search-context';

type Element = { type: unknown; props: Record<string, unknown> };
test('actual Drive form recovers from invalid dates when returning to the same URL search', () => {
  const values: unknown[] = []; let cursor = 0; let dependencies: unknown[] = [];
  const pushes: string[] = [];
  const react = {
    useState(initial: unknown) {
      const index = cursor++;
      if (!(index in values)) values[index] = typeof initial === 'function' ? initial() : initial;
      return [values[index], (next: unknown) => { values[index] = typeof next === 'function' ? next(values[index]) : next; }];
    },
    useEffect(_effect: unknown, deps: unknown[]) { dependencies = deps; },
  };
  const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
  const modules: Record<string, unknown> = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'next/image': 'image', 'next/link': 'link',
    'next/navigation': { useRouter: () => ({ push: (url: string) => pushes.push(url) }) },
    '@/components/i18n/LanguageProvider': { useLanguage: () => ({ language: 'en', direction: 'ltr' }) },
    '@/lib/drive/catalog': catalog, '@/lib/drive/search': search, './drive.module.css': { default: {} },
    '@/lib/marketplace/search-context': context,
    '@/components/public/MarketplaceNavigation': { default: () => null },
  };
  const exports: { default?: (props: { initialSearch: string }) => Element } = {};
  runInNewContext(ts.transpileModule(readFileSync('components/drive/DriveMarketplace.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, URLSearchParams, require(name: string) { assert.ok(name in modules, name); return modules[name]; } });
  const initialSearch = 'family=dir3-drive&searched=1&pickup=Cairo&pickupAt=2030-10-12T12:00&returnAt=2030-10-13T12:00&mode=chauffeur&passengers=2&luggage=1&currency=USD';
  function render() { cursor = 0; return exports.default!({ initialSearch }); }
  function all(node: unknown): Element[] {
    if (Array.isArray(node)) return node.flatMap(all);
    if (!node || typeof node !== 'object' || !('props' in node)) return [];
    const element = node as Element; return [element, ...all(element.props.children)];
  }
  function input(tree: Element, value: string) { return all(tree).find(node => node.type === 'input' && node.props.value === value)!; }
  function submit(tree: Element) { (all(tree).find(node => node.type === 'form')!.props.onSubmit as (event: { preventDefault(): void }) => void)({ preventDefault() {} }); }
  let tree = render(); const beforeRetry = dependencies[2];
  (input(tree, '2030-10-13T12:00').props.onChange as (e: unknown) => void)({ target: { value: '2030-10-11T12:00' } });
  tree = render(); submit(tree); tree = render();
  assert.ok(all(tree).some(node => node.props.role === 'alert'));
  assert.equal(pushes.length, 0);
  (input(tree, '2030-10-11T12:00').props.onChange as (e: unknown) => void)({ target: { value: '2030-10-13T12:00' } });
  tree = render(); submit(tree); tree = render();
  assert.equal(all(tree).some(node => node.props.role === 'alert'), false);
  assert.equal(dependencies[2], Number(beforeRetry) + 1, 'same search must trigger one reload');
  assert.equal(pushes.length, 1);
  assert.equal(new URL(pushes[0], 'https://local.invalid').searchParams.get('returnAt'), '2030-10-13T12:00');
  assert.equal(new URL(pushes[0], 'https://local.invalid').searchParams.get('language'), 'en');
});
