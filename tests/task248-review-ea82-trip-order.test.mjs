import test from 'node:test';
import assert from 'node:assert/strict';
import {newTripRequested} from '../lib/dabra/trip-routing.ts';
import {driveBudgetState} from '../lib/dabra/drive-planning.ts';
for(const [text,kind] of [
 ['do not start a new trip but start a new trip','new'],
 ['start a new trip but do not start a new trip','continue'],
 ['if I approve start a new trip but keep this trip','uncertain'],
 ['start a new trip but do not use a driver','new'],
 ['لا تبدأ رحلة جديدة لكن ابدأ رحلة جديدة','new'],
 ['ابدأ رحلة جديدة لكن لا تبدأ رحلة جديدة','continue']
]) test('the last scoped trip action wins only when unconditioned: '+text,()=>{
 assert.equal(newTripRequested.decision(text).kind,kind);
});
test('the shared budget reducer discards an earlier scope after an explicit new trip',()=>{
 const state=driveBudgetState(['i need a car with a driver','my car budget is 800 sar per day','start a new trip','show cars']);
 assert.equal(state.confirmed,null);
});
