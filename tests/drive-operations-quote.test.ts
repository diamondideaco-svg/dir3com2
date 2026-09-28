import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as catalog from '../lib/drive/catalog';
import * as record from '../lib/drive/record';
import * as request from '../lib/drive/request';

type Element = { type: unknown; props: Record<string, unknown>; key?: string };
function all(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(all);
  if (!node || typeof node !== 'object' || !('props' in node)) return [];
  const element = node as Element;
  return [element, ...all(element.props.children)];
}
function text(node: unknown): string {
  if (Array.isArray(node)) return node.map(text).join(' ');
  if (node && typeof node === 'object' && 'props' in node) return text((node as Element).props.children);
  return typeof node === 'string' || typeof node === 'number' ? String(node) : '';
}
function fixture(status = 'under_review', legacy = false): record.DriveRequestRecord {
  return {
    id: '00000000-0000-4000-8000-000000000169', request_reference: 'REQ-ISOLATED-169',
    drive_offer_id: 'safeerat-eg-nissan-sunny', status, quote_amount: null, quote_currency: null, quote_expires_at: null,
    drive_request_context: {
      country: 'EG', supplier_amount: 66, supplier_currency: 'USD', version: 1,
      confirmed_vehicle: null, confirmed_vehicle_year: null, customer_accepted_at: null,
      trip: { mode: 'chauffeur', pickup: 'Cairo', dropoff: 'Giza', pickupAt: '2030-12-12T12:00', returnAt: '2030-12-13T12:00',
        passengers: 2, luggage: 1, currency: 'USD', name: 'Isolated QA', phone: '+10000000000', acknowledged: true,
        flightNumber: '', flightArrival: '', specialRequest: '', notes: '',
        minimumModelYear: legacy ? 2025 : null, acceptableModelYears: legacy ? [2025, 2026, 2027] : null },
    },
  };
}

function mount(language: 'ar' | 'en', data = fixture(), canWrite = true) {
  const states: unknown[] = []; let cursor = 0; const submissions: FormData[] = [];
  const jsx = (type: unknown, props: Record<string, unknown>, key?: string): Element => typeof type === 'function'
    ? type(props) : { type, props, key };
  const serverAction = async (_previous: string, form: FormData) => { submissions.push(form); return 'SAVED'; };
  const modules: Record<string, unknown> = {
    react: {
      useActionState(fn: typeof serverAction) { return ['', (form: FormData) => fn('', form)]; },
      useState(initial: unknown) { const i=cursor++; if (!(i in states)) states[i]=initial; return [states[i], (value: unknown) => { states[i]=value; }]; },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/components/i18n/LanguageProvider': { useLanguage: () => ({ language, direction: language==='ar'?'rtl':'ltr' }) },
    '@/components/admin/AdminLocale': { AdminSubmitButton: (props: Record<string, unknown>) => jsx('button', { ...props, type: 'submit', children: props[language] }) },
    '@/app/admin/operations/drive/actions': { reviewDriveRequest: serverAction },
    '@/lib/drive/catalog': catalog, '@/lib/drive/record': record, '@/lib/drive/request': request,
    './drive.module.css': { default: {} },
  };
  const exports: { default?: (props: { requests: record.DriveRequestRecord[]; canWrite: boolean }) => Element } = {};
  runInNewContext(ts.transpileModule(readFileSync('components/drive/DriveOperations.tsx','utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require(name: string) { assert.ok(name in modules, name); return modules[name]; } });
  const render = () => { cursor=0; return exports.default!({ requests: [data], canWrite }); };
  const named = (tree: Element, name: string) => all(tree).find(x=>x.props.name===name);
  return { render, named, submissions, choose(value: string) {
    const select=named(render(),'action'); assert.ok(select);
    (select.props.onChange as (e: {target:{value:string}})=>void)({target:{value}});
  }};
}

for (const language of ['ar','en'] as const) {
  test(`Review and offer are separate visible actions (${language})`, () => {
    const ui=mount(language,fixture('request_submitted')); const tree=ui.render();
    assert.equal(ui.named(tree,'action')?.props.value,'review');
    assert.equal(text(all(tree).find(x=>x.type==='button')),language==='ar'?'بدء المراجعة':'Start review');
    assert.equal(ui.named(tree,'amount'),undefined);
    assert.match(text(tree),language==='ar'?/بدء المراجعة لا يرسل عرضًا/:/Starting a review does not send an offer/);
  });

  test(`Under review exposes an explicit offer CTA and required quote fields (${language})`, () => {
    const ui=mount(language); const tree=ui.render(); const button=all(tree).find(x=>x.type==='button')!;
    assert.equal(text(button),language==='ar'?'إرسال العرض للعميل':'Send offer to customer');
    assert.match(String(button.props[language==='ar'?'confirmAr':'confirmEn']),language==='ar'?/حساب العميل/:/customer’s account/);
    for (const name of ['vehicle','amount','expires']) assert.equal(ui.named(tree,name)?.props.required,true,name);
    assert.equal(ui.named(tree,'expires')?.props.max,'2030-12-12T12:00');
    assert.equal(ui.named(tree,'vehicleYear')?.props.required,undefined,'current all-years policy keeps year optional');
    assert.equal(ui.named(tree,'amount')?.props.defaultValue,undefined,'supplier price is not a silently confirmed final quote');
    assert.match(text(tree),language==='ar'?/واتساب التلقائي غير مفعّل/:/WhatsApp notifications are not enabled/);
  });

  test(`Decline removes quote validation and sends only the selected action (${language})`, async () => {
    const ui=mount(language,fixture('under_review',true));
    assert.equal(ui.named(ui.render(),'vehicleYear')?.props.required,true);
    ui.choose('decline'); const tree=ui.render();
    assert.equal(text(all(tree).find(x=>x.type==='button')),language==='ar'?'رفض الطلب':'Decline request');
    for (const name of ['vehicle','vehicleYear','amount','currency','expires']) assert.equal(ui.named(tree,name),undefined,name);
    const form=new FormData();
    for(const node of all(tree).filter(x=>['input','select','textarea'].includes(String(x.type))&&x.props.name)) {
      form.set(String(node.props.name),String(node.props.value??''));
    }
    await (all(tree).find(x=>x.type==='form')!.props.action as (form:FormData)=>Promise<string>)(form);
    assert.equal(ui.submissions.length,1); assert.equal(form.get('action'),'decline'); assert.equal(form.get('version'),'1');
    assert.equal(form.has('amount'),false); assert.equal(form.get('requestId'),fixture().id);
    ui.choose('confirm'); assert.equal(ui.named(ui.render(),'amount')?.props.required,true);
  });

  test(`Read-only and completed requests cannot expose quote controls (${language})`, () => {
    for(const [status,canWrite] of [['under_review',false],['declined',true],['awaiting_customer_acceptance',true],['confirmed',true]] as const) {
      const tree=mount(language,fixture(status),canWrite).render();
      assert.equal(all(tree).filter(x=>x.type==='form'||x.type==='button').length,0,`${status}/${canWrite}`);
    }
  });

  test(`Sending an offer retains the authoritative confirm payload and historical years (${language})`, async () => {
    const ui=mount(language,fixture('under_review',true)); const tree=ui.render();
    assert.deepEqual(all(ui.named(tree,'vehicleYear')).filter(x=>x.type==='option').map(x=>x.props.children),[2025,2026,2027]);
    const form=new FormData();
    for(const [key,value] of Object.entries({requestId:fixture().id,version:'1',action:String(ui.named(tree,'action')!.props.value),vehicle:'Approved model',vehicleYear:'2025',amount:'150',currency:'USD',expires:'2030-12-11T12:00'}))form.set(key,value);
    await (all(tree).find(x=>x.type==='form')!.props.action as (form:FormData)=>Promise<string>)(form);
    assert.equal(ui.submissions[0].get('action'),'confirm');
    assert.equal(ui.submissions[0].get('amount'),'150'); assert.equal(ui.submissions[0].get('currency'),'USD');
    assert.equal(ui.submissions[0].get('vehicleYear'),'2025');
  });
}
