import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import type { Client } from 'pg';
import type { SupabaseClient } from '@supabase/supabase-js';
import ts from 'typescript';

function load<T>(path: string, dependencies: Record<string, unknown>): T {
  const source = readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
  const exports = {};
  const require = createRequire(import.meta.url);
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, require: (id: string) => id in dependencies ? dependencies[id] : require(id), FormData, Date }, { filename: path });
  return exports as T;
}

// Real PostgreSQL IO adapter for the actual server action, not a copied action.
// Only the action's small Supabase transport surface is substituted.
export function postgresTeamActions(db: Client, actorId: string) {
  const identifier = (name: string) => {
    if (!/^[a-z_]+$/.test(name)) throw new Error('Unsafe test identifier');
    return `"${name}"`;
  };
  const errors: { code?: string; constraint?: string }[] = [];
  async function query(sql: string, values: unknown[] = []) {
    try { return { data: (await db.query(sql, values)).rows, error: null }; }
    catch (error) { errors.push(error as { code?: string; constraint?: string }); return { data: null, error }; }
  }
  const client = {
    auth: { admin: {
      listUsers: async () => ({ data: { users: (await db.query('SELECT id,email FROM auth.users')).rows }, error: null }),
      inviteUserByEmail: async () => { throw new Error('Unexpected invitation in existing-user test'); },
    } },
    from(table: string) {
      if (!['profiles', 'team_access_grants'].includes(table)) throw new Error('Unexpected test table');
      const filters: [string, unknown][] = [];
      let columns = '*'; let limit: number | undefined; let values: Record<string, unknown> | undefined;
      let operation = 'select'; let conflict = '';
      async function execute() {
        const args: unknown[] = [];
        const parameter = (value: unknown) => { args.push(value); return `$${args.length}`; };
        let sql = `SELECT ${columns} FROM public.${identifier(table)}`;
        if (operation === 'upsert' || operation === 'insert') {
          const keys = Object.keys(values!);
          sql = `INSERT INTO public.${identifier(table)} (${keys.map(identifier).join(',')}) VALUES (${keys.map(key => parameter(values![key])).join(',')})`;
          if (operation === 'upsert') sql += ` ON CONFLICT (${identifier(conflict)}) DO UPDATE SET ${keys.map(key => `${identifier(key)}=EXCLUDED.${identifier(key)}`).join(',')}`;
        } else if (operation === 'update') {
          sql = `UPDATE public.${identifier(table)} SET ${Object.keys(values!).map(key => `${identifier(key)}=${parameter(values![key])}`).join(',')}`;
        }
        if (filters.length) sql += ` WHERE ${filters.map(([key,value]) => value === null ? `${identifier(key)} IS NULL` : `${identifier(key)}=${parameter(value)}`).join(' AND ')}`;
        if (operation !== 'select') sql += ' RETURNING *';
        else if (limit !== undefined) sql += ` LIMIT ${limit}`;
        return query(sql, args);
      }
      const chain = {
        select: (value = '*') => { columns = value === '*' ? '*' : value.split(',').map(key => identifier(key.trim())).join(','); return chain; },
        order: () => chain,
        limit: (value: number) => { limit = value; return chain; },
        eq: (key: string, value: unknown) => { filters.push([key,value]); return chain; },
        is: (key: string, value: null) => { filters.push([key,value]); return chain; },
        upsert: (row: Record<string,unknown>, options: {onConflict:string}) => { operation='upsert'; values=row; conflict=options.onConflict; return chain; },
        insert: (row: Record<string,unknown>) => { operation='insert'; values=row; return chain; },
        update: (row: Record<string,unknown>) => { operation='update'; values=row; return chain; },
        maybeSingle: async () => { const r=await execute(); return { data:r.data?.length === 1 ? r.data[0] : null, error:r.error ?? (r.data && r.data.length > 1 ? new Error('Ambiguous rows') : null) }; },
        then: (resolve: (value: unknown)=>unknown, reject: (reason: unknown)=>unknown) => execute().then(resolve,reject),
      };
      return chain;
    },
    rpc: async (name: string, params: Record<string,unknown> = {}) => {
      const keys=Object.keys(params);
      const r=await query(`SELECT public.${identifier(name)}(${keys.map((key,i)=>`${identifier(key)} => $${i+1}`).join(',')}) AS result`,keys.map(key=>params[key]));
      return {data:r.data?.[0]?.result ?? null,error:r.error};
    },
  } as unknown as SupabaseClient;
  const team=load<typeof import('../../lib/auth/team-access')>('lib/auth/team-access.ts',{'server-only':{}});
  const loader=load<typeof import('../../lib/admin/team-access-data')>('lib/admin/team-access-data.ts',{'server-only':{},'@/lib/security/safe-logger':{logServerEvent:()=>undefined}});
  const actions=load<typeof import('../../lib/actions/team-access-actions')>('lib/actions/team-access-actions.ts',{
    '@/lib/auth/admin':{requireAdminActionAccess:async()=>({supabase:client,user:{id:actorId}})},
    '@/lib/auth/team-access':team,'@/lib/admin/team-access-data':loader,
    '@/lib/supabase/server':{supabaseAdmin:client},'next/cache':{revalidatePath:()=>undefined},
  });
  return {actions,errors};
}
