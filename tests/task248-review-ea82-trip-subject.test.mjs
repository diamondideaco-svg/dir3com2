import test from 'node:test';
import assert from 'node:assert/strict';
import {newTripRequested} from '../lib/dabra/trip-routing.ts';
for(const [text,kind] of [
 ['start a new trip but do not use a driver','new'],
 ['ابدأ رحلة جديدة لكن لا أريد سائق','new'],
 ['keep the same trip without a driver','continue'],
 ['استمر في نفس الرحلة بدون سائق','continue'],
 ['a driver for the new trip','uncertain'],
 ['سائق للرحلة الجديدة','uncertain'],
 ['new trip','new'],['رحلة جديدة','new']
]) test('trip intent is scoped to the trip rather than a service: '+text,()=>{
 assert.equal(newTripRequested.decision?.(text).kind,kind);
});
