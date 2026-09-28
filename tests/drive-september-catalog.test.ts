import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {DRIVE_OFFERS, VEHICLE_MASTER, DRIVE_CATALOG_VERSION, journeyPrice, vehicleYearAvailabilityLabel} from '../lib/drive/catalog';
import data from '../lib/drive/september-catalog.json';
import source from '../docs/catalog/drive-rates-2026-09-27.json';
import {savedDriveModelYears} from '../lib/drive/record';

test('approved high USD price plus 10% once; airport exactly half, in integer cents',()=>{
  assert.equal(source.rows.length,27);
  for(const row of source.rows){
    const cents=Math.max(...row.sourcePricesUSD)*110;
    assert.equal(row.proposedCustomerUSDCents,cents);
    assert.equal(row.proposedAirportUSDCents,cents/2);
  }
  for(const row of data.rows){
    const original=source.rows.find(r=>r.row===row.sourceRow)!;
    const offer=DRIVE_OFFERS.find(o=>o.id===row.offerId)!;
    assert.equal(offer.chauffeur*100,original.proposedCustomerUSDCents);
    assert.equal(offer.airport!*100,original.proposedAirportUSDCents);
    assert.equal(offer.currency,'USD');assert.equal(offer.supplierId,'egypt-operations');
    assert.equal(offer.dailyPeriodHours,24);assert.equal(offer.version,DRIVE_CATALOG_VERSION);
    assert.equal(journeyPrice(offer,'chauffeur').dailyPeriodHours,24);
    assert.equal(journeyPrice(offer,'airport').dailyPeriodHours,null);
    assert.equal(journeyPrice(offer,'chauffeur').total,null);
  }
});
test('all 27 CEO-approved rows included; no year or missing field excludes an offer',()=>{
  assert.equal(data.rows.length,27);assert.equal(DRIVE_OFFERS.length,30);
  assert.equal(new Set(DRIVE_OFFERS.map(o=>o.id)).size,30);
  assert.deepEqual(data.rows.map(r=>r.sourceRow),Array.from({length:27},(_,i)=>i+1));
  assert.deepEqual(data.rows.find(r=>r.sourceRow===23)!.modelYears,[2020,2021]);
  assert.deepEqual(data.rows.find(r=>r.sourceRow===26)!.modelYears,[]);
  assert.deepEqual(data.rows.find(r=>r.sourceRow===27)!.modelYears,[]);
  assert.ok(source.rows.every(r=>r.status==='accepted_all_years_pending_release_gates'));
  assert.ok(DRIVE_OFFERS.every(o=>o.availability==='request_to_confirm'));
  const legacy=DRIVE_OFFERS.filter(o=>o.supplierId==='safeerat-al-arab');
  assert.deepEqual(legacy.map(o=>[o.vehicleId,o.airport,o.chauffeur,o.currency]),[
    ['mercedes-e200-amg',100,200,'USD'],['jetour-t1',50,100,'USD'],
    ['range-rover-2025',250,450,'USD'],
  ]);
  const sport=VEHICLE_MASTER.find(v=>v.id==='range-rover-sport')!;
  assert.notEqual(sport.image,VEHICLE_MASTER.find(v=>v.id==='range-rover-2025')!.image);
  assert.match(vehicleYearAvailabilityLabel('en',sport),/2024 \/ 2025 —/);
  assert.doesNotMatch(vehicleYearAvailabilityLabel('en',sport),/2026|2027|2023/);
});
test('database release generated from same prices and safe ordering preserves retry and commercial boundaries',()=>{
  const path='supabase/migrations/20260927223137_drive_september27_managed_catalog.sql';
  const before=readFileSync(path,'utf8');
  execFileSync(process.execPath,['scripts/generate-drive-september27-sql.mjs']);
  assert.equal(readFileSync(path,'utf8'),before);
  for(const row of data.rows) assert.ok(before.includes(`('${row.offerId}','${row.vehicleId}',${(row.airportCents/100).toFixed(2)},${(row.dailyCents/100).toFixed(2)})`));
  assert.ok(before.indexOf("'replayed',true") < before.indexOf("RAISE EXCEPTION 'CATALOG_CHANGED'"));
  assert.match(before,/CATALOG_BASELINE_CHANGED/);assert.match(before,/NEW_OFFER_ID_ALREADY_EXISTS/);
  assert.doesNotMatch(before,/(?:UPDATE|DELETE FROM|INSERT INTO)\s+public\.(?:products|partners|bookings|payments)\b/i);
  assert.match(before,/REVOKE ALL ON FUNCTION public.create_managed_drive_request\(text,text,jsonb,text\) FROM PUBLIC,anon,service_role/);
});
test('Operations and customer review use saved years, never downgrade an old request promise',()=>{
  const saved=(minimumModelYear:number,acceptableModelYears:number[])=>({minimumModelYear,acceptableModelYears});
  assert.deepEqual(savedDriveModelYears(saved(2025,[2025,2026,2027])),[2025,2026,2027]);
  assert.deepEqual(savedDriveModelYears(saved(2022,[2022,2023,2024,2025,2026,2027])),[2022,2023,2024,2025,2026,2027]);
  assert.deepEqual(savedDriveModelYears(saved(2025,[2021,2022,2024,2025,2028])),[2025,2028]);
  assert.equal(savedDriveModelYears({minimumModelYear:null,acceptableModelYears:null}),null);
  assert.deepEqual(savedDriveModelYears({}),[2025,2026,2027]);
});
