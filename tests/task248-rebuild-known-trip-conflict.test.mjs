import test from 'node:test';
import assert from 'node:assert/strict';
import {newTripRequested} from '../lib/dabra/trip-routing.ts';

// Known out-of-scope blocker retained explicitly for independent design review.
for(const text of [
 'start a new trip, actually keep this trip',
 'ابدأ رحلة جديدة، بل ابق على هذه الرحلة'
]) test('a later clear keep decision must not start a new trip: '+text,()=>{
 assert.equal(newTripRequested(text),false);
});
