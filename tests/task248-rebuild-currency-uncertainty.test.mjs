import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {runInNewContext} from './fixtures/task258-platform-vm.mjs';
import {isRejectedBudgetChangeCurrency} from '../lib/dabra/drive-planning.ts';
const code=stripTypeScriptTypes(readFileSync(new URL('../lib/dabra/platform-assistant.ts',import.meta.url),'utf8'),{mode:'strip'})
 .replace(/^import .*;\s*$/gm,'').replace(/^export\s+(?=(?:function|const|class|let)\b)/gm,'')
 +'\n;globalThis.exportsForTest={platformCurrencySelection};';
const globals={isRejectedBudgetChangeCurrency,parseDisplayCurrency:value=>['SAR','USD','EUR','EGP','AED'].includes(String(value).toUpperCase())?String(value).toUpperCase():null};
const api=runInNewContext(code,globals);
for(const text of [
 'if I approve show cars in EUR',
 'perhaps show cars in EUR',
 'same trip, should I show cars in EUR?',
 'same trip, can I show cars in EUR',
 'إذا وافقت اعرض السيارات باليورو',
 'ربما اعرض السيارات باليورو',
 'نفس الرحلة، هل تنصحني أن أعرض السيارات باليورو؟',
 'نفس الرحلة، هل يمكنني عرض السيارات باليورو'
]) test('a conditional or advisory currency mention is not a positive choice: '+text,()=>{
 const c=api.platformCurrencySelection(text);assert.notEqual(c.requested,'EUR');assert.equal(Array.from(c.excluded).includes('EUR'),false);
});
for(const text of [
 'do not use EUR; if I approve show cars in EUR',
 'لا تستخدم اليورو؛ إذا وافقت اعرض السيارات باليورو'
]) test('a conditional mention does not clear a prior refusal: '+text,()=>{
 const c=api.platformCurrencySelection(text);assert.equal(c.requested,null);assert.equal(Array.from(c.excluded).includes('EUR'),true);
});
for(const text of [
 'Can you show cars in EUR?',
 'هل يمكنك عرض السيارات باليورو؟',
 'do not use EUR; show prices in EUR',
 'لا تستخدم اليورو؛ اعرض الأسعار باليورو'
]) test('a direct unconditioned display request remains a choice: '+text,()=>{
 const c=api.platformCurrencySelection(text);assert.equal(c.requested,'EUR');assert.equal(Array.from(c.excluded).includes('EUR'),false);
});
