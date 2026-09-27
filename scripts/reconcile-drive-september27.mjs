import fs from 'node:fs';

// Source facts remain in the rate register; only customer rates enter the app.
const path = 'docs/catalog/drive-rates-2026-09-27.json';
const register = JSON.parse(fs.readFileSync(path, 'utf8'));
const mappings = [
  [1,'mercedes-e200','Mercedes-Benz','E 200','مرسيدس E 200','Luxury','sedan',[2022]],
  [2,'mercedes-s500','Mercedes-Benz','S 500','مرسيدس S 500','Luxury','sedan',[2022,2023]],
  [3,'mercedes-gclass','Mercedes-Benz','G-Class','مرسيدس G-Class','Premium SUV','suv',[2022,2023]],
  [4,'mercedes-v250','Mercedes-Benz','V 250','مرسيدس V 250','Luxury','mpv',[2022,2023,2024,2025]],
  [5,'mercedes-v300','Mercedes-Benz','V 300','مرسيدس V 300','Luxury','mpv',[2025,2026,2027]],
  [8,'kia-sportage','Kia','Sportage','كيا سبورتاج','SUV','suv',[2026]],
  [9,'hyundai-elantra-cn7','Hyundai','Elantra CN7','هيونداي إلنترا CN7','Sedan','sedan',[2022,2023]],
  [11,'hyundai-accent','Hyundai','Accent','هيونداي أكسنت','Economy','sedan',[2022,2026]],
  [12,'jetour-t2','Jetour','T2','جيتور T2','SUV','suv',[2026,2027]],
  [13,'jetour-x70','Jetour','X70','جيتور X70','SUV','suv',[2026]],
  [14,'jetour-x90','Jetour','X90','جيتور X90','SUV','suv',[2026]],
  [15,'soueast-s05','Soueast','S05','سوايست S05','SUV','suv',[2026]],
  [16,'soueast-s09','Soueast','S09','سوايست S09','SUV','suv',[2026]],
  [17,'soueast-s07','Soueast','S07','سوايست S07','SUV','suv',[2026]],
  [18,'range-rover','Land Rover','Range Rover','رينج روفر','Premium SUV','suv',[2022]],
  [19,'range-rover-sport','Land Rover','Range Rover Sport','رينج روفر سبورت','Premium SUV','suv',[2024,2025]],
  [20,'nissan-sunny','Nissan','Sunny','نيسان صني','Economy','sedan',[2022,2025]],
  [21,'nissan-patrol','Nissan','Patrol','نيسان باترول','Premium SUV','suv',[2022,2023]],
  [24,'toyota-land-cruiser','Toyota','Land Cruiser','تويوتا لاند كروزر','Premium SUV','suv',[2022,2023,2024,2025]],
  [25,'cadillac-escalade','Cadillac','Escalade','كاديلاك إسكاليد','Premium SUV','suv',[2026]],
];
const existing = new Set(['jetour-t2','jetour-x90','nissan-sunny','mercedes-e200','mercedes-gclass','range-rover']);
const publicRows = mappings.map(([row,vehicleId,make,model,ar,vehicleClass,body,modelYears]) => {
  const source = register.rows.find(r => r.row === row);
  const high = Math.max(...source.sourcePricesUSD);
  const dailyCents = high * 110;
  const airportCents = dailyCents / 2;
  if (!Number.isSafeInteger(dailyCents) || !Number.isSafeInteger(airportCents)
    || dailyCents !== source.proposedCustomerUSDCents || airportCents !== source.proposedAirportUSDCents) throw Error(`Price mismatch row ${row}`);
  source.status = 'mapped_2022_plus_pending_release_gates';
  source.mappedVehicleId = vehicleId;
  source.eligibleModelYears = modelYears;
  return {sourceRow:row,vehicleId,offerId:`${existing.has(vehicleId)?'safeerat':'managed'}-eg-${vehicleId}`,
    make,model,ar,vehicleClass,body,modelYears,dailyCents,airportCents};
});
for(const row of register.rows) {
  if(!publicRows.some(r=>r.sourceRow===row.row)) row.status=row.row===23?'held_source_years_2020_2021_below_approved_2022':'held_source_model_or_year_confirmation';
}
register.operationsOwner = 'Egypt Operations — no supplier assignment or supplier confirmation implied';
register.minimumModelYearApproval = {minimum:2022, date:'2026-09-28', authority:'CEO — include 2024, 2023 and 2022; existing request promises remain unchanged'};
register.publicationBlockers = ['7 source rows await model/year clarification or are below 2022; these do not block the 20 reconciled rows', 'Public release requires exact-SHA Preview and independent review; local verification is recorded in drive-september27-release.md'];
delete register.serviceBasis.airportRateIncluded;
delete register.serviceBasis.airportRateIncludedMeaning;
register.serviceBasis.airportBundledWithDaily = false;
fs.writeFileSync(path, JSON.stringify(register,null,2)+'\n');
fs.writeFileSync('lib/drive/september-catalog.json', JSON.stringify({version:'managed-eg-20260928-v2',rows:publicRows},null,2)+'\n');
const columns=['row','sourceName','sourceYears','approvedHigherUSD','proposedCustomerUSDCents','proposedAirportUSDCents','status','mappedVehicleId','eligibleModelYears'];
const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';
fs.writeFileSync('docs/catalog/drive-rates-2026-09-27.csv',columns.join(',')+'\n'+register.rows.map(r=>columns.map(c=>quote(r[c])).join(',')).join('\n')+'\n');
const table=register.rows.map(r=>`| ${r.row} | ${r.sourceName} | ${r.sourceYears} | ${(r.proposedCustomerUSDCents/100).toFixed(2)} | ${(r.proposedAirportUSDCents/100).toFixed(2)} | ${r.eligibleModelYears?.join(' / ')??'HELD'} |`).join('\n');
fs.writeFileSync('docs/catalog/drive-rates-2026-09-27.md',`# Task #167 — September Drive rate register\n\nPrepared, NOT published. Owner: Codex — ChatGPT Work Mode. Branch: feat/drive-catalog-september27.\n\nDaily = highest source USD price + 10% once. Airport reception = 50% of final daily rate. Daily service covers a 24-hour period including driver, fuel and 120km; continuous driver duty and extra-distance charges are not promised. Airport is a separate service. Final journey total remains subject to Operations confirmation.\n\n20 rows mapped to supplied 2022+ years under the CEO approval of 2026-09-28; seven unresolved or pre-2022 rows remain separate without delaying eligible rows. Source years are never relabelled as newer inventory. Three unmatched existing approved offers remain unchanged. Existing REQs retain their original year promise. Row 1 uses only the legible 2022 year; its clipped year is not guessed. CN7 is normalized to Hyundai Elantra, consistent with Hyundai official CN7 documentation. Abu Al-Hana products are untouched. New and repriced offers belong to Egypt Operations; no supplier is inferred.\n\n| Row | Source model | Source years | Daily USD | Airport USD | Eligible years |\n|---:|---|---|---:|---:|---|\n${table}\n\nImages are original generated catalogue assets. Model-specific generation review and transparent-background checks precede release; no copied rental-company photographs. Model/color/trim are not guaranteed physical inventory.\n`);
console.log(`Reconciled ${publicRows.length} rows; held ${register.rows.length-publicRows.length}; no database connection or publication.`);
