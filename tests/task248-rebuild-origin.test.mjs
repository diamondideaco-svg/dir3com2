import test from 'node:test';
import assert from 'node:assert/strict';
import { cityRoles, refineRoutingTrip } from '../lib/dabra/trip-routing.ts';

const saved = Object.freeze({id:'11111111-1111-4111-8111-111111111111',origin:'Cairo',destination:'Cairo',startDate:'2026-12-12',endDate:'2026-12-14',adults:2,children:0,rooms:1,budget:800,currency:'SAR',families:['drive']});

for (const text of ['I need a transfer from Paris to Cairo', 'أحتاج توصيل من باريس إلى القاهرة']) {
  test('unknown origin is not silently replaced by saved Cairo: '+text, () => {
    const roles=cityRoles(text);
    assert.equal(roles.destination,'cairo');
    assert.equal(roles.unknownOrigin,true);
    assert.equal(refineRoutingTrip(saved,text).origin,null);
    assert.equal(saved.origin,'Cairo');
  });
}
for (const text of ['I need a transfer from Giza to Cairo', 'أحتاج توصيل من الجيزة إلى القاهرة']) {
  test('known origin and destination remain separate: '+text, () => {
    const roles=cityRoles(text);
    assert.equal(roles.origin,'giza');
    assert.equal(roles.destination,'cairo');
    assert.equal(roles.unknownOrigin,false);
    assert.equal(refineRoutingTrip(saved,text).origin,'giza');
  });
}
for (const text of ['I live in Paris; I need a car in Cairo', 'أعيش في باريس، أريد سيارة في القاهرة', 'please show cars in Cairo in EUR']) {
  test('personal location or currency is not an origin: '+text, () => {
    assert.equal(cityRoles(text).unknownOrigin,false);
    assert.equal(refineRoutingTrip(saved,text).origin,'Cairo');
  });
}
