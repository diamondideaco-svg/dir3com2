import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Run with an isolated PGlite installation; never connects to a remote database.
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE));
const db = new PGlite();
const baseline = readFileSync(new URL('../supabase/migrations/20260903215959_production_schema_baseline.sql', import.meta.url), 'utf8');
function originalFunction(name) {
  const start = baseline.indexOf(`CREATE OR REPLACE FUNCTION public.${name}()`);
  assert.ok(start >= 0);
  const end = baseline.indexOf('$function$', baseline.indexOf('$function$', start) + 10) + 10;
  return baseline.slice(start, end) + ';';
}
await db.exec(`
  CREATE TABLE public.partners(id integer PRIMARY KEY, slug text, status text, deleted_at timestamptz);
  CREATE TABLE public.products(id integer PRIMARY KEY, status text, verified boolean, shield_certified boolean, featured boolean, synthetic boolean, environment text);
  CREATE TABLE public.product_availability(product_id integer, partner_id integer);
  INSERT INTO public.partners VALUES (1,'abu-al-anaq-drive','active',NULL),(2,'unrelated','pending',NULL);
  INSERT INTO public.products VALUES (1,'draft',false,false,false,false,NULL),(2,'draft',false,false,false,false,NULL);
  INSERT INTO public.product_availability VALUES (1,1),(2,2);
  ${originalFunction('phase0_enforce_alhana_product_state')}
  ${originalFunction('phase0_lock_staging_synthetic_products')}
  CREATE TRIGGER trg_phase0_enforce_alhana_product_state BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.phase0_enforce_alhana_product_state();
  CREATE TRIGGER trg_phase0_lock_staging_synthetic_products BEFORE INSERT OR UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.phase0_lock_staging_synthetic_products();
`);
async function updateAndRead(id = 1) {
  return (await db.query('UPDATE public.products SET status=$1, verified=true, shield_certified=true WHERE id=$2 RETURNING *', ['published',id])).rows[0];
}
assert.equal((await updateAndRead()).status, 'draft', 'reproduce legacy active-partner regression');
await db.exec(readFileSync(process.argv[2], 'utf8'));
let passed = 1;
for (const status of ['active','approved','pending','under_review','suspended','rejected','archived',null]) {
  await db.query('UPDATE public.partners SET status=$1,deleted_at=NULL WHERE id=1', [status]);
  const row = await updateAndRead();
  const permitted = ['active','approved'].includes(status);
  assert.equal(row.status, permitted ? 'published' : 'draft', String(status));
  assert.equal(row.verified, permitted);
  assert.equal(row.shield_certified, permitted);
  passed++;
}
for (const status of ['active','approved']) {
  await db.query('UPDATE public.partners SET status=$1,deleted_at=now() WHERE id=1',[status]);
  assert.equal((await updateAndRead()).status, 'draft', 'deleted partner remains blocked');
  passed++;
}
await db.exec("UPDATE public.partners SET status='active',deleted_at=NULL WHERE id=1");
await db.exec("UPDATE public.products SET synthetic=true,environment='staging' WHERE id=1");
assert.equal((await updateAndRead()).status,'draft','synthetic staging guard still applies'); passed++;
assert.equal((await updateAndRead(2)).status,'published','unrelated partner behavior unchanged'); passed++;
await db.exec("UPDATE public.products SET synthetic=false,environment=NULL,status='draft',verified=false,shield_certified=false WHERE id=1");
const draft = (await db.query('SELECT * FROM public.products WHERE id=1')).rows[0];
assert.equal(draft.status,'draft'); assert.equal(draft.verified,false); assert.equal(draft.shield_certified,false); passed++;
await db.close();
console.log(`${passed} isolated PostgreSQL trigger cases PASS; not a CEO browser/RBAC test.`);
