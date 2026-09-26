import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { DRIVE_MIN_MODEL_YEAR, DRIVE_MODEL_YEARS, DRIVE_OFFERS, VEHICLE_MASTER, journeyPrice, vehicleTitle, vehicleYearAvailabilityLabel } from '../lib/drive/catalog';
import { cairoInstant, readDriveSearch, driveSearchParams, validateDriveSearch } from '../lib/drive/search';
import { parseDriveTrip, driveRequestState, validateDriveOfferRequest } from '../lib/drive/request';
import { CUSTOMER_MARKETPLACE_REQUEST_FIELDS } from '../lib/marketplace/customer-requests';

const now=Date.parse('2026-09-17T06:00Z');
const search={pickup:'Cairo airport',dropoff:'Cairo hotel',pickupAt:'2026-09-17T15:00',returnAt:'2026-09-18T15:00',mode:'chauffeur' as const,currency:'EGP' as const,passengers:2,luggage:1};
const trip={...search,name:'QA Customer',phone:'+201000000000',notes:'',specialRequest:'',flightNumber:'',flightArrival:'',acknowledged:true};
test('exact nine approved offers, immutable supplier identity and no legacy substitutions',()=>{
  assert.equal(DRIVE_OFFERS.length,9);assert.equal(new Set(DRIVE_OFFERS.map(x=>x.id)).size,9);
  assert.deepEqual(DRIVE_OFFERS.map(x=>[x.airport,x.chauffeur,x.currency]),[[100,200,'USD'],[50,100,'USD'],[50,100,'USD'],[900,1800,'EGP'],[1500,3500,'EGP'],[80,150,'USD'],[200,350,'USD'],[250,450,'USD'],[null,550,'USD']]);
  assert.ok(DRIVE_OFFERS.every(x=>x.supplierId==='safeerat-al-arab'&&x.country==='EG'&&x.availability==='request_to_confirm'));
});
test('unknown capacities/trims remain unknown and each mapped image exists locally',()=>{
  for(const v of VEHICLE_MASTER){
    assert.equal(v.passengers,null);assert.equal(v.luggage,null);assert.equal(v.airConditioning,null);
    assert.match(v.image,/\.webp$/);assert.ok(existsSync(`public${v.image}`));
    const bytes=readFileSync(`public${v.image}`);assert.equal(bytes.subarray(0,4).toString(),'RIFF');assert.equal(bytes.subarray(8,12).toString(),'WEBP');
    assert.match(vehicleTitle(v,'en'),/or similar$/);assert.match(vehicleTitle(v,'ar'),/أو ما يماثلها$/);
  }
  assert.equal(VEHICLE_MASTER.filter(v=>v.year!==null).length,1);
  assert.equal(DRIVE_MIN_MODEL_YEAR,2025);assert.deepEqual(DRIVE_MODEL_YEARS,[2025,2026,2027]);
  assert.match(vehicleYearAvailabilityLabel('ar'),/2025 \/ 2026 \/ 2027/);assert.match(vehicleYearAvailabilityLabel('en'),/subject to availability or similar/);
});
test('price truth: no invented total or G-Class airport rate',()=>{
  for(const offer of DRIVE_OFFERS){assert.equal(journeyPrice(offer,'chauffeur').total,null);assert.equal(journeyPrice(offer,'chauffeur').baseAmount,offer.chauffeur);}
  assert.equal(validateDriveOfferRequest(DRIVE_OFFERS[8].id,{...trip,mode:'airport'}),null);
});
test('six-hour boundary is Cairo-local, inclusive to the minute',()=>{
  assert.equal(validateDriveSearch(search,now),null);
  assert.equal(validateDriveSearch({...search,pickupAt:'2026-09-17T14:59'},now),'PICKUP_TOO_SOON');
});
test('Cairo winter and summer offsets follow IANA rules',()=>{
  assert.equal(cairoInstant('2026-01-12T12:00'),Date.parse('2026-01-12T10:00Z'));
  assert.equal(cairoInstant('2026-07-12T12:00'),Date.parse('2026-07-12T09:00Z'));
});
test('Cairo DST missing/ambiguous wall times and invalid calendar rejected',()=>{
  for(const value of ['2026-04-24T00:30','2026-10-29T23:30','2026-02-30T12:00','invalid'])assert.equal(cairoInstant(value),null,value);
});
test('dates and passenger bounds validated',()=>{
  assert.equal(validateDriveSearch({...search,returnAt:search.pickupAt},now),'INVALID_RETURN');
  for(const passengers of [0,21,1.5,NaN])assert.equal(validateDriveSearch({...search,passengers},now),'INVALID_TRAVELLERS');
});
test('search roundtrip survives language-independent URL serialization',()=>assert.deepEqual(readDriveSearch(driveSearchParams(search)),search));
test('customer contact and acknowledgement are mandatory',()=>{
  assert.equal(parseDriveTrip(trip,now).error,null);
  for(const patch of [{acknowledged:false},{phone:'secret@invalid'},{dropoff:''},{notes:'x'.repeat(1001)},{specialRequest:'x'.repeat(501)}])assert.notEqual(parseDriveTrip({...trip,...patch},now).error,null);
});
test('airport requires flight details; chauffeur never stores irrelevant flight fields',()=>{
  assert.equal(parseDriveTrip({...trip,mode:'airport'},now).error,'FLIGHT_DETAILS_REQUIRED');
  assert.equal(parseDriveTrip({...trip,mode:'airport',flightNumber:'MS123',flightArrival:'2026-09-17T14:00'},now).error,null);
  assert.equal(parseDriveTrip({...trip,flightNumber:'MS123'},now).trip?.flightNumber,'');
});
test('request state is not BOOKING and expiry is truthful',()=>{
  assert.equal(driveRequestState('awaiting_customer_acceptance','2026-09-17T07:00Z',now),'quote_ready');
  assert.equal(driveRequestState('awaiting_payment',null,now),'ready_for_payment');
  assert.equal(driveRequestState('awaiting_customer_acceptance','2026-09-17T05:00Z',now),'expired');
  assert.equal(driveRequestState('request_submitted',null,now),'request_submitted');
});
test('legacy customer request projection remains compatible before managed Drive migration',()=>{
  assert.ok(CUSTOMER_MARKETPLACE_REQUEST_FIELDS.split(', ').includes('product_id'));
  assert.ok(CUSTOMER_MARKETPLACE_REQUEST_FIELDS.split(', ').includes('marketplace_family'));
  assert.equal(CUSTOMER_MARKETPLACE_REQUEST_FIELDS.split(', ').includes('drive_offer_id'),false);
  const route=readFileSync('app/my-requests/[reference]/page.tsx','utf8');
  assert.match(route,/request\.product_id === null && request\.marketplace_family === 'drive'/);
  assert.ok(route.indexOf('getCustomerMarketplaceRequest(supabase, user.id, reference)') < route.indexOf('request.product_id === null'));
});
test('migration preserves legacy inventory, protects country audit and payment stop',()=>{
  const sql=readFileSync('supabase/migrations/20260916234223_managed_drive_request_boundary.sql','utf8');
  const modelYearSql=readFileSync('supabase/migrations/20260918190000_drive_model_year_boundary.sql','utf8');
  assert.doesNotMatch(sql,/(?:UPDATE|DELETE FROM|INSERT INTO)\s+public\.(?:products|partners|bookings|payments)\b/i);
  assert.match(sql,/pg_advisory_xact_lock/);assert.match(sql,/require_operational_access\('operations:write','EG',false\)/);
  assert.match(sql,/ENABLE ROW LEVEL SECURITY/);assert.match(sql,/drive_payment_stop/);assert.match(sql,/drive_events_immutable/);
  assert.match(sql,/trip=p_trip/);assert.match(sql,/IDEMPOTENCY_CONFLICT/);
  assert.match(modelYearSql,/acceptableModelYears/);assert.match(modelYearSql,/confirmed_vehicle_year/);assert.match(modelYearSql,/p_vehicle_year NOT IN \(2025,2026,2027\)/);
  const acceptanceSql=readFileSync('supabase/migrations/20260925150000_drive_customer_quote_acceptance.sql','utf8');
  assert.match(acceptanceSql,/v_request\.user_id IS DISTINCT FROM auth\.uid\(\)/);assert.match(acceptanceSql,/customer_accept/);assert.match(acceptanceSql,/status='awaiting_payment'/);
  assert.match(acceptanceSql,/REVOKE ALL ON FUNCTION public\.accept_managed_drive_quote\(uuid,integer\) FROM PUBLIC,anon,service_role/);
});
test('UI contains no active payment fields or fabricated hour packages',()=>{
  const ui=readFileSync('components/drive/DriveRequestReview.tsx','utf8');assert.match(ui,/Payment unavailable/);assert.match(ui,/<button disabled>/);assert.match(ui,/acceptDriveQuote/);assert.doesNotMatch(ui,/stripe|tokenize|capture\(/i);
  for(const file of ['DriveDeal','DriveMarketplace','DriveRequestReview'])assert.doesNotMatch(readFileSync(`components/drive/${file}.tsx`,'utf8'),/Representative image|صورة توضيحية|hourly|8 hours|12 hours/);
});
