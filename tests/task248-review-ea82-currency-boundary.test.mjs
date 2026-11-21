import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {runInNewContext} from 'node:vm';
import {isRejectedBudgetChangeCurrency} from '../lib/dabra/drive-planning.ts';
const code=stripTypeScriptTypes(readFileSync(new URL('../lib/dabra/platform-assistant.ts',import.meta.url),'utf8'),{mode:'strip'})
 .replace(/^import .*;\s*$/gm,'').replace(/^export\s+(?=(?:function|const|class|let)\b)/gm,'')
 +'\n;globalThis.exportsForTest={platformCurrencySelection};';
const api=runInNewContext(code,{isRejectedBudgetChangeCurrency,parseDisplayCurrency:value=>['SAR','USD','EUR','EGP','AED'].includes(String(value).toUpperCase())?String(value).toUpperCase():null});
for(const text of [
 'if I approve show USD prices; actually do not use EUR',
 'إذا وافقت اعرض الأسعار بالدولار؛ بل لا تستخدم اليورو',
 'if I approve show prices in USD, do not use EUR'
]) test('a correction marker or comma does not itself cancel a condition: '+text,()=>{
 const c=api.platformCurrencySelection(text);assert.equal(Array.from(c.excluded).includes('EUR'),false);
});
for(const text of [
 'if I approve show prices in EUR; do not use EUR',
 'إذا وافقت اعرض الأسعار باليورو؛ لا تستخدم اليورو'
]) test('a separate later refusal wins even for the same currency: '+text,()=>{
 const c=api.platformCurrencySelection(text);assert.equal(Array.from(c.excluded).includes('EUR'),true);assert.notEqual(c.requested,'EUR');
});
