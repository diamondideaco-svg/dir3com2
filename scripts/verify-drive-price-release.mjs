import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
// Caller must supply its own isolated database. No URL, credentials or project access.
export async function verifyDrivePriceRelease({execute, scalar}) {
 const baseline=JSON.parse(read('docs/catalog/drive-price-reduction-2026-09-28.json'));
 const availability=JSON.parse(read('docs/catalog/drive-availability-price-reduction-2026-09-28.json'));
 const rates=JSON.parse(read('lib/drive/current-prices.json'));
 const migration=read('supabase/migrations/20260928121156_drive_price_reduction_15_percent.sql');
 for (const p of baseline.before.partnerProducts) await execute(`INSERT INTO public.products(id,name_ar,name_en,slug,country,marketplace_family,status,base_price,currency,lifecycle_version) VALUES('${p.id}','اختبار','Isolated QA','qa-${p.id}','EG','drive','published',${p.beforeCents}/100.0,'${p.currency}',${p.version})`);
 // The real baseline deliberately creates every inserted product as synthetic draft.
 // This fixture models the already published, non-synthetic rows captured read-only;
 // never disable a trigger or change the release migration to accommodate fixtures.
 for (const p of baseline.before.partnerProducts) await execute(`UPDATE public.products SET synthetic=false,status='published' WHERE id='${p.id}'`);
 const v=x=>x===null?'NULL':String(x/100);
 for (const a of availability) await execute(`INSERT INTO public.product_availability(id,product_id,city,currency,price,weekend_price,seasonal_price,discount_percent,capacity,booked_count) VALUES('${a.id}','${a.productId}','Cairo','${a.currency}',${v(a.priceCents)},${v(a.weekendCents)},${v(a.seasonalCents)},${a.discountPercent},7,2)`);
 const oldRequests=await scalar('SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY request_id),\'[]\')::text FROM public.drive_request_context c');
 const oldRates=await scalar('SELECT jsonb_agg(to_jsonb(o) ORDER BY id)::text FROM public.drive_managed_offers o');
 // Stale snapshot fails atomically before any commercial price or request changes.
 await execute(`UPDATE public.product_availability SET price=751 WHERE id='${availability.find(a=>a.priceCents!==null).id}'`);
 await assert.rejects(execute(migration),/AVAILABILITY_PRICE_BASELINE_CHANGED/);
 await execute('ROLLBACK');
 assert.equal(await scalar('SELECT jsonb_agg(to_jsonb(o) ORDER BY id)::text FROM public.drive_managed_offers o'),oldRates);
 await execute(`UPDATE public.product_availability SET price=750 WHERE id='${availability.find(a=>a.priceCents!==null).id}'`);
 await execute(migration);
 for(const r of rates.offers) assert.equal(await scalar(`SELECT daily_amount*100=${r.dailyCents} AND airport_amount*100=${r.airportCents} AND version='${rates.version}' FROM public.drive_managed_offers WHERE id='${r.id}'`),'true');
 for(const p of baseline.partnerAfter) assert.equal(await scalar(`SELECT base_price*100=${p.afterCents} AND currency='${p.currency}' AND lifecycle_version=${p.version+1} FROM public.products WHERE id='${p.id}'`),'true');
 assert.equal(await scalar("SELECT count(*)::text FROM public.product_availability WHERE price=637.50 AND capacity=7 AND booked_count=2"),'10');
 assert.equal(await scalar("SELECT count(*)::text FROM public.product_availability WHERE product_id IN(SELECT id FROM partner_rate_change)" ).catch(()=> 'temp-table-dropped'),'temp-table-dropped');
 assert.equal(await scalar("SELECT count(*)::text FROM public.system_events WHERE event_name='drive_catalog_prices_reduced'"),'1');
 assert.equal(await scalar('SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY request_id),\'[]\')::text FROM public.drive_request_context c'),oldRequests);
 await assert.rejects(execute(migration),/DRIVE_PRICE_BASELINE_CHANGED/);await execute('ROLLBACK');
 assert.equal(await scalar("SELECT count(*)::text FROM public.system_events WHERE event_name='drive_catalog_prices_reduced'"),'1');
 console.log('PASS: 30 exact rates, 13 partner rates, 10 overrides, stale baseline atomic rollback, no compounded reduction, prior request snapshots and availability capacity unchanged.');
}
