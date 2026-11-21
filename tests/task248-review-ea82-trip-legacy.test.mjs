import test from 'node:test';
import assert from 'node:assert/strict';
import {newTripRequested} from '../lib/dabra/trip-routing.ts';
for(const [text,kind] of [
 ['start over','new'],
 ['ابدأ من جديد','new'],
 ["don't start over",'continue'],
 ['should I start over?','uncertain']
]) test('legacy restart phrases still obey whole-turn polarity: '+text,()=>{
 assert.equal(newTripRequested.decision(text).kind,kind);
});
