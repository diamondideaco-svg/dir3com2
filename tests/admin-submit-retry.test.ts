import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

type Node = { type: unknown; props: Record<string, unknown> };
function nodes(value: unknown): Node[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== 'object' || !('props' in value)) return [];
  const node = value as Node;
  return [node, ...nodes(node.props.children)];
}

// Runs the actual component handlers while preserving hook state across renders.
// Native validation and server-action completion are controlled test boundaries.
function harness(path: string, actions: Record<string, unknown> = {}) {
  const slots: unknown[] = [];
  let index = 0;
  let pending = false;
  let effects: Array<() => void> = [];
  const exports: Record<string, (props: Record<string, unknown>) => unknown> = {};
  const dependencies: Record<string, unknown> = {
    react: {
      useState(initial: unknown) {
        const i = index++;
        if (!(i in slots)) slots[i] = initial;
        return [slots[i], (value: unknown) => { slots[i] = value; }];
      },
      useRef(initial: unknown) {
        const i = index++;
        if (!(i in slots)) slots[i] = { current: initial };
        return slots[i];
      },
      useId: () => 'test-dialog',
      useEffect(effect: () => void, deps: unknown[]) {
        const i = index++;
        const previous = slots[i] as unknown[] | undefined;
        if (!previous || deps.some((value, j) => value !== previous[j])) effects.push(effect);
        slots[i] = deps;
      },
    },
    'react-dom': { useFormStatus: () => ({ pending }) },
    'react/jsx-runtime': { jsx: (type: unknown, props: Node['props']) => ({ type, props }), jsxs: (type: unknown, props: Node['props']) => ({ type, props }) },
    'next/link': 'a', 'next/navigation': {},
    '@/components/i18n/LanguageProvider': { useLanguage: () => ({ language: 'en' }) },
    '@/lib/actions/product-actions': actions,
  };
  const source = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  runInNewContext(source, { exports, require(id: string) { assert.ok(id in dependencies, id); return dependencies[id]; } });
  return {
    render(name: string, props: Record<string, unknown>) {
      index = 0;
      const tree = nodes(exports[name](props));
      const queued = effects;
      effects = [];
      queued.forEach(effect => effect());
      return tree;
    },
    setPending(value: boolean) { pending = value; },
  };
}

function click(node: Node, form?: unknown) {
  let prevented = false;
  (node.props.onClick as (event: unknown) => void)({ currentTarget: { form }, preventDefault() { prevented = true; } });
  return prevented;
}
function button(tree: Node[], label?: string) {
  const result = tree.find(node => node.type === 'button' && (!label || node.props.children === label));
  assert.ok(result);
  return result;
}

for (const confirmation of [false, true]) {
  test(`admin submit: invalid input can be corrected; pending blocks overlap and completion permits retry (confirmation=${confirmation})`, () => {
    const h = harness('components/admin/AdminLocale.tsx');
    const props = { ar: 'Save', en: 'Save', className: '', ...(confirmation ? { confirmEn: 'Save changes?' } : {}) };
    const render = () => h.render('AdminSubmitButton', props);
    let valid = false;
    let submissions = 0;
    const form = { reportValidity: () => valid, requestSubmit() { assert.ok(valid); submissions++; } };
    assert.equal(click(button(render()), form), true);
    assert.equal(render().some(node => node.props.role === 'dialog'), false);
    valid = true;
    const start = () => {
      const prevented = click(button(render()), form);
      if (confirmation) click(button(render(), 'Confirm'));
      else if (!prevented) submissions++;
    };
    start();
    assert.equal(submissions, 1);
    assert.equal(click(button(render()), form), true, 'same-tick overlap blocked');
    h.setPending(true);
    assert.equal(button(render()).props.disabled, true);
    h.setPending(false);
    assert.equal(button(render()).props.disabled, false);
    start();
    assert.equal(submissions, 2, 'retained component accepts explicit retry after completed action');
  });
}

test('admin confirmation revalidates fields changed while dialog is open without trapping retry', () => {
  const h = harness('components/admin/AdminLocale.tsx');
  const render = () => h.render('AdminSubmitButton', { ar: 'Save', en: 'Save', className: '', confirmEn: 'Save?' });
  let valid = true;
  let submissions = 0;
  const form = { reportValidity: () => valid, requestSubmit() { submissions++; } };
  click(button(render()), form);
  valid = false;
  click(button(render(), 'Confirm'));
  assert.equal(submissions, 0);
  valid = true;
  click(button(render()), form);
  click(button(render(), 'Confirm'));
  assert.equal(submissions, 1);
});

for (const fails of [false, true]) {
  test(`lifecycle action serializes siblings and unlocks after ${fails ? 'failure' : 'completion'}`, async () => {
    let finish!: () => void;
    let calls = 0;
    const action = async () => { calls++; await new Promise<void>(resolve => { finish = resolve; }); if (fails) throw new Error('ACTION_FAILED'); };
    const h = harness('components/products/ProductLifecycleControls.tsx', { publishProductAction: action, archiveProductAction: action, unpublishProductAction: action });
    const render = () => h.render('default', { id: 'product', slug: 'product', status: 'draft', lifecycleVersion: 2, canWrite: true });
    let result: Promise<void> | undefined;
    function dispatch(index: number) {
      const node = render().filter(node => node.type === 'form')[index];
      let prevented = false;
      const form = { reportValidity: () => true, requestSubmit() { dispatch(index); } };
      (node.props.onSubmit as (event: unknown) => void)({ currentTarget: form, preventDefault() { prevented = true; } });
      if (!prevented) result = (node.props.action as (data: FormData) => Promise<void>)(new FormData());
    }
    dispatch(0);
    click(button(render(), 'Confirm'));
    assert.equal(calls, 1);
    dispatch(1);
    assert.equal(calls, 1, 'sibling cannot dispatch while first action is pending');
    assert.equal(button(render(), 'Archive').props.disabled, true);
    const completion = fails ? assert.rejects(result!, /ACTION_FAILED/) : result!;
    finish();
    await completion;
    assert.equal(button(render(), 'Archive').props.disabled, false);
    dispatch(1);
    assert.equal(calls, 1, 'new operation still requires human confirmation');
    click(button(render(), 'Confirm'));
    assert.equal(calls, 2);
    const second = fails ? assert.rejects(result!, /ACTION_FAILED/) : result!;
    finish();
    await second;
  });
}
