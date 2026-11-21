import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {runInNewContext} from 'node:vm';
import {driveDialogue,isRejectedBudgetChangeCurrency} from '../lib/dabra/drive-planning.ts';
const norm=s=>s.toLowerCase().normalize('NFKC').replace(/[\u064b-\u065f\u0670\u0640]/g,'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/\s+/g,' ').trim();
const p={city:'cairo',ambiguous:false,dates:['2026-12-12','2026-12-14'],party:'2'};
for(const [base,text] of [
 [['I need a car with a driver','my car budget is 800 SAR per day'],'do not set it to 1000 EUR per day'],
 [['أحتاج سيارة مع سائق','ميزانية السيارة 800 ريال يومياً'],'لا تحولها إلى 1000 يورو يومياً']
]) test('a negated ambiguous pronoun cannot become an affirmative budget: '+text,()=>{
 const s=driveDialogue([...base,text].map(norm),p);
 assert.equal(s?.budget?.amount,'800');assert.equal(s?.budget?.currency,'SAR');assert.equal(s?.kind,'clarify');
});
const code=stripTypeScriptTypes(readFileSync(new URL('../lib/dabra/platform-assistant.ts',import.meta.url),'utf8'),{mode:'strip'})
 .replace(/^import .*;\s*$/gm,'').replace(/^export\s+(?=(?:function|const|class|let)\b)/gm,'')
 +'\n;globalThis.exportsForTest={platformCurrencySelection};';
const api=runInNewContext(code,{isRejectedBudgetChangeCurrency,parseDisplayCurrency:value=>['SAR','USD','EUR','EGP','AED'].includes(String(value).toUpperCase())?String(value).toUpperCase():null});
for(const text of ['my budget is 800 SAR; do not set it to 1000 EUR','ميزانيتي 800 ريال؛ لا تحولها إلى 1000 يورو']) {
 test('a rejected pronoun target is not promoted to display currency: '+text,()=>{
  const c=api.platformCurrencySelection(text);assert.notEqual(c.requested,'EUR');assert.equal(Array.from(c.excluded).includes('EUR'),false);
 });
}
