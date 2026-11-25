import assert from 'node:assert/strict';
import test from 'node:test';
import {resolveDriveTemporalText,replayDriveTemporalText,cairoCalendarDay,validDriveCalendarDay} from '../lib/dabra/drive-time.mjs';
const turn='الاستلام من مطار القاهرة بعد بكرة الساعة ٩ بالليل بتوقيت القاهرة';
test('literal Cairo turn at the actual recorded time resolves 27 November 21:00',()=>{
 const result=resolveDriveTemporalText(turn,Date.parse('2026-11-25T19:06:27Z'));
 assert.equal(result.relativeDate,'2026-11-27');assert.match(result.text,/يوم 2026-11-27 الساعة 21:00/);
});
test('requested fixed 21:00 UTC scenario is still Cairo 25 November',()=>{
 const now=Date.parse('2026-11-25T21:00:00Z');assert.equal(cairoCalendarDay(now),'2026-11-25');
 assert.equal(resolveDriveTemporalText(turn,now).relativeDate,'2026-11-27');
});
test('Cairo calendar boundary takes precedence over UTC date',()=>{
 const now=Date.parse('2026-11-25T22:30:00Z');assert.equal(cairoCalendarDay(now),'2026-11-26');
 assert.equal(resolveDriveTemporalText(turn,now).relativeDate,'2026-11-28');
});
test('historical relative date is pinned across later days without rewriting visible user text',()=>{
 const pin=resolveDriveTemporalText(turn,Date.parse('2026-11-25T19:06:27Z')).relativeDate;
 assert.match(replayDriveTemporalText(turn,pin),/2026-11-27/);
 assert.match(replayDriveTemporalText(turn,undefined),/بعد بكرة/);
 assert.match(replayDriveTemporalText(turn,'2026-02-30'),/بعد بكرة/);
});
test('English date and evening time use the same Cairo day',()=>{
 assert.match(resolveDriveTemporalText('Pickup at Cairo airport the day after tomorrow at 9pm',Date.parse('2026-11-25T21:00:00Z')).text,/on 2026-11-27 at 21:00/);
});
test('explicit Arabic and English dates normalize without changing the trip day',()=>{
 assert.match(resolveDriveTemporalText('الاستلام يوم الجمعة ٢٧ نوفمبر ٢٠٢٦ الساعة ٩ مساءً').text,/يوم 2026-11-27 الساعة 21:00/);
 assert.match(resolveDriveTemporalText('Pickup on Friday 27 November 2026 at 9pm').text,/on 2026-11-27 at 21:00/);
});
test('a date range, invalid day, competing weekday or unknown AM/PM is not invented',()=>{
 assert.equal(validDriveCalendarDay('2026-02-30'),false);
 assert.equal(resolveDriveTemporalText('from 8 to 10 December 2026').text,'from 8 to 10 December 2026');
 assert.match(resolveDriveTemporalText('on Friday 28 November 2026').text,/28 November/);
 assert.match(resolveDriveTemporalText('الاستلام بعد بكرة الساعة ٩',Date.parse('2026-11-25T19:06:27Z')).text,/الساعة 9$/);
});
test('true conditional intent withholds temporal preference projection',()=>{
 const result=resolveDriveTemporalText('إذا وافقت على رحلة جديدة فالاستلام بعد بكرة الساعة ٩ بالليل',Date.parse('2026-11-25T19:06:27Z'));
 assert.equal(result.relativeDate,null);assert.match(result.text,/بعد بكرة/);
});
