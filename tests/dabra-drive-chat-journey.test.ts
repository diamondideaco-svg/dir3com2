import assert from 'node:assert/strict';
import test from 'node:test';
import { tripTurnDecision, turnHasDeferredIntent } from '../lib/dabra/trip-turn-decision.mjs';

const direct = [
 'أخطط لرحلة جديدة في القاهرة: محتاج سيارة مع سائق لمدة ٣ أيام. الاستلام من مطار القاهرة بعد بكرة الساعة ٩ بالليل بتوقيت القاهرة. إحنا ٣ أشخاص ومعانا شنطتين، وميزانيتي ٨٠٠ ريال سعودي للرحلة كلها، مش لليوم. خلينا نراجع التفاصيل ونكمّل الطلب من الشات؛ إيه المعلومة الناقصة؟',
 'خلينا نبدأ رحلة جديدة. أحتاج سيارة مع سائق تبقى معي في القاهرة ثلاثة أيام، وليست توصيلة مطار. الاستلام من مطار القاهرة يوم الجمعة ٢٧ نوفمبر ٢٠٢٦ الساعة ٩ مساءً بتوقيت القاهرة. نحن ثلاثة أشخاص ومعنا شنطتان، والحد ٨٠٠ ريال سعودي للرحلة كاملة. راجع ما فهمته معي ونكمل طلب السيارة هنا في الشات، واسألني عن التفاصيل التي ما زالت ناقصة.',
 'نبدأ رحلة جديدة بالتفاصيل التي ذكرتها في رسالتي السابقة. اعرضها للمراجعة قبل إنشاء أي طلب، ولا تعِد إرسال أي طلب قديم.',
 'أخطط لرحلة جديدة في القاهرة بعد بكرة الساعة ٩ بالليل',
 'Start a new trip in Cairo the day after tomorrow at 9pm',
];
for (const [index,message] of direct.entries()) test(`explicit new-trip wording ${index+1} is a decision, once`,()=>{
 assert.equal(tripTurnDecision(message).kind,'new');
});
for(const message of ['هل نبدأ رحلة جديدة؟','إذا نبدأ رحلة جديدة في القاهرة، اعرض السيارات','ربما نبدأ رحلة جديدة','أفكر أن أخطط لرحلة جديدة','I might start a new trip','Should I start a new trip?'])test(`uncertain new-trip intent stays guarded: ${message}`,()=>{
 assert.notEqual(tripTurnDecision(message).kind,'new');
});
for(const message of ['لا نبدأ رحلة جديدة','لا أخطط لرحلة جديدة','لا نخطط لرحلة جديدة'])test(`negative new-trip intent does not reset: ${message}`,()=>{
 assert.notEqual(tripTurnDecision(message).kind,'new');
});
test('calendar phrase does not erase a real approval condition',()=>{
 assert.equal(turnHasDeferredIntent('إذا وافقت سأبدأ رحلة جديدة بعد بكرة'),true);
 assert.equal(turnHasDeferredIntent('Start a new trip the day after tomorrow if I approve'),true);
 assert.equal(turnHasDeferredIntent('أخطط لرحلة جديدة بعد بكرة الساعة ٩ بالليل'),false);
});
