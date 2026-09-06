import assert from 'node:assert/strict';
export const BASELINE = '20260903215959';
export const PENDING = ['20260903220000','20260904210623','20260906034500'];
export const quote = x => '"'+x.replaceAll('"','""')+'"';
const literal = x => "'"+x.replaceAll("'","''")+"'";
const object = (schema,name) => `${quote(schema)}.${quote(name)}`;
export function tableSql(t) {
  assert.equal(t.kind,'r','Unsupported relation requires explicit review');
  return `CREATE TABLE ${object(t.schema,t.name)} (\n${t.columns.map(c=>{
    assert.equal(c.identity,'','Identity needs explicit review');
    return `  ${quote(c.name)} ${c.type}${c.generated ? ` GENERATED ALWAYS AS (${c.default}) STORED` : c.default ? ` DEFAULT ${c.default}` : ''}${c.not_null?' NOT NULL':''}`;
  }).join(',\n')}\n);`;
}
export function renderBaseline(c) {
  const lines=['-- REVIEW ONLY: baseline adoption checkpoint, NOT historical execution.',
    '-- Source: direct read-only Production capture. NO data/backfill or history writes.',
    '-- Fresh disposable/platform-prepared database only; never execute for adoption.',
    'BEGIN;','SET LOCAL check_function_bodies = off;','SET LOCAL search_path = public, extensions;'];
  for(const t of c.types.filter(x=>x.schema==='public')) lines.push(`CREATE TYPE ${object(t.schema,t.name)} AS ENUM (${t.labels.map(literal).join(',')});`);
  for(const t of c.tables.filter(x=>x.schema==='public')) {
    lines.push(tableSql(t),`ALTER TABLE ${object(t.schema,t.name)} OWNER TO ${quote(t.owner)};`);
    if(t.options?.length)lines.push(`ALTER TABLE ${object(t.schema,t.name)} SET (${t.options.join(',')});`);
  }
  for(const f of c.functions.filter(x=>x.schema==='public')) lines.push(f.definition+';',`ALTER FUNCTION ${object(f.schema,f.name)}(${f.arguments}) OWNER TO ${quote(f.owner)};`);
  const constraints=c.constraints.filter(x=>x.schema==='public').sort((a,b)=>(a.type==='f')-(b.type==='f'));
  for(const k of constraints)lines.push(`ALTER TABLE ${object(k.schema,k.table)} ADD CONSTRAINT ${quote(k.name)} ${k.definition};`);
  for(const i of c.indexes.filter(x=>x.schema==='public'&&!x.constraint_owned)) {
    assert.ok(i.valid&&i.ready,'Invalid index must not silently normalize');lines.push(i.definition+';');
  }
  for(const t of c.triggers) {
    assert.ok(t.schema==='public'||t.name==='trg_auth_users_provision_profile','Unexpected managed auth trigger');
    lines.push(t.definition+';');
    if(t.enabled!=='O')lines.push(`ALTER TABLE ${object(t.schema,t.table)} ${t.enabled==='D'?'DISABLE':t.enabled==='A'?'ENABLE ALWAYS':'ENABLE REPLICA'} TRIGGER ${quote(t.name)};`);
  }
  for(const t of c.tables.filter(x=>x.schema==='public')) {
    if(t.rls)lines.push(`ALTER TABLE ${object(t.schema,t.name)} ENABLE ROW LEVEL SECURITY;`);
    if(t.force_rls)lines.push(`ALTER TABLE ${object(t.schema,t.name)} FORCE ROW LEVEL SECURITY;`);
  }
  for(const p of c.policies.filter(x=>x.schemaname==='public'))lines.push(`CREATE POLICY ${quote(p.policyname)} ON ${object(p.schemaname,p.tablename)} AS ${p.permissive} FOR ${p.cmd} TO ${p.roles.map(r=>r==='public'?'PUBLIC':quote(r)).join(',')}${p.qual?` USING (${p.qual})`:''}${p.with_check?` WITH CHECK (${p.with_check})`:''};`);
  const roles=['PUBLIC',...c.roles.properties.map(r=>quote(r.name))].join(',');
  for(const t of c.tables.filter(x=>x.schema==='public'))lines.push(`REVOKE ALL ON TABLE ${object(t.schema,t.name)} FROM ${roles};`);
  for(const f of c.functions.filter(x=>x.schema==='public'))lines.push(`REVOKE ALL ON FUNCTION ${object(f.schema,f.name)}(${f.arguments}) FROM ${roles};`);
  for(const g of c.grants.filter(x=>x.schema==='public'&&x.kind!=='schema')) {
    const target=g.kind==='function'?`FUNCTION ${quote(g.schema)}.${g.object}`:`TABLE ${object(g.schema,g.object)}`;
    lines.push(`GRANT ${g.privilege} ON ${target} TO ${g.grantee==='PUBLIC'?'PUBLIC':quote(g.grantee)}${g.is_grantable?' WITH GRANT OPTION':''};`);
  }
  for(const g of c.column_grants.filter(x=>x.schema==='public'))lines.push(`GRANT ${g.privilege} (${quote(g.column)}) ON TABLE ${object(g.schema,g.table)} TO ${quote(g.grantee)}${g.grantable?' WITH GRANT OPTION':''};`);
  lines.push(`REVOKE ALL ON SCHEMA public FROM ${roles}, pg_database_owner;`);
  for(const g of c.grants.filter(x=>x.schema==='public'&&x.kind==='schema'))lines.push(`GRANT ${g.privilege} ON SCHEMA public TO ${g.grantee==='PUBLIC'?'PUBLIC':quote(g.grantee)}${g.is_grantable?' WITH GRANT OPTION':''};`);
  // postgres-owned defaults are app-relevant. Managed supabase_admin defaults are capture-only.
  for(const kind of ['TABLES','FUNCTIONS','SEQUENCES'])lines.push(`ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON ${kind} FROM ${roles};`);
  for(const g of c.defaults.filter(x=>x.owner==='postgres'&&x.schema==='public'))lines.push(`ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ${g.privilege} ON ${{r:'TABLES',f:'FUNCTIONS',S:'SEQUENCES'}[g.object_type]} TO ${g.grantee==='PUBLIC'?'PUBLIC':quote(g.grantee)}${g.grantable?' WITH GRANT OPTION':''};`);
  lines.push('COMMIT;','');return lines.join('\n').replaceAll('\r\n','\n');
}
export function pendingVersions(applied) {
  const active=[BASELINE,...PENDING];
  assert.equal(new Set(active).size,4);assert.deepEqual([...active].sort(),active);
  return active.filter(v=>!applied.includes(v));
}
export function modelAdoption(actual,expected,baselinePresent) {
  assert.deepEqual(actual,expected,'Exact ledger mismatch: STOP');
  assert.equal(actual.length,47);assert.equal(baselinePresent,false);
  assert.ok(!actual.some(r=>[BASELINE,...PENDING].includes(r.version)));
  return [BASELINE]; // Pure model, no DB writes or executable metadata repair.
}
