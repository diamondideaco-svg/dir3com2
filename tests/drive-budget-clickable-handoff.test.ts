import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import PlatformAnswer,{platformLinkAllowed} from '../components/dabra/PlatformAnswer';
import {createPlatformScopeOwner,platformUserRequest,buildPlatformAssistantResponse} from '../lib/dabra/platform-assistant';
for(const locale of ['ar','en'] as const)for(const amount of ['800','900'])test(`actual ${locale} ${amount} budget/luggage handoff is a clickable local anchor`,()=>{
 const content=locale==='ar'?`أريد سيارة مع سائق في القاهرة لشخصين وشنطتين من ٨ إلى ١٠ ديسمبر ٢٠٢٦. ميزانية السيارة ${amount} ريال سعودي للرحلة كاملة. السعر الإجمالي والتوفر بحاجة لتأكيد العمليات.`:`I need a car with a driver in Cairo for two people and two bags, from 8 to 10 December 2026. My car budget is ${amount} SAR for the whole trip. The total price and availability require Operations confirmation.`;
 const request=platformUserRequest({role:'user',content},[],null,createPlatformScopeOwner());
 const answer=buildPlatformAssistantResponse(request,[],locale,Date.now(),undefined,{currency:'SAR',snapshot:null}).answer;
 const href=answer.match(/\]\((\/marketplace\?[^)]+)\)/)?.[1];assert.ok(href,answer);
 const params=new URL(href,'https://local.invalid').searchParams;assert.equal(params.get('budgetAmount'),amount);assert.equal(params.get('luggage'),'2');
 assert.equal(platformLinkAllowed(href),true,'the actual emitted contract must be allowed');
 const html=renderToStaticMarkup(createElement(PlatformAnswer,{text:answer}));
 const anchors=[...html.matchAll(/<a[^>]*href="([^"]+)"/g)].map(match=>match[1].replaceAll('&amp;','&'));
 assert.ok(anchors.includes(href),'must render a real anchor, not literal Markdown');
 assert.doesNotMatch(html,/<form|<button/);
});
test('Drive-only luggage and budget keys stay bounded and cannot become an action or redirect',()=>{
 const valid='/marketplace?family=dir3-drive&luggage=2&budgetAmount=800&budgetCurrency=SAR&budgetBasis=trip';
 assert.equal(platformLinkAllowed(valid),true);
 assert.equal(platformLinkAllowed('/marketplace?family=dir3-drive&luggage=0'),true);
 assert.equal(platformLinkAllowed('/marketplace?family=dir3-drive&luggage=20'),true);
 for(const href of [
  valid+'&execute=1',valid+'&redirect=https://evil.invalid',valid+'&budgetAmount=900',valid+'&family=dir3-stay',
  valid.replace('family=dir3-drive','family=dir3-stay'),valid.replace('/marketplace','/support'),
  valid.replace('luggage=2','luggage=21'),valid.replace('luggage=2','luggage=-1'),valid+'&luggage=2',
  valid.replace('budgetAmount=800','budgetAmount=0'),valid.replace('budgetAmount=800','budgetAmount=PRIVATE_TEXT'),
  valid.replace('budgetBasis=trip','budgetBasis=day'),valid.replace('&budgetBasis=trip',''),
  valid.replace('budgetCurrency=SAR','budgetCurrency=BAD'),
  'https://evil.invalid'+valid,'//evil.invalid'+valid,
 ]){assert.equal(platformLinkAllowed(href),false,href);const html=renderToStaticMarkup(createElement(PlatformAnswer,{text:`[Review](${href})`}));assert.doesNotMatch(html,/<a /,href);}
});
