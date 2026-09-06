begin;

create table if not exists public.partner_portal_assets (
  id text primary key,
  owner_id uuid not null references public.partners(id) on delete cascade,
  owner_kind text not null check (owner_kind in ('drive_partner', 'stay_supplier')),
  record jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.partner_portal_asset_media (
  id text primary key,
  owner_id uuid not null references public.partners(id) on delete cascade,
  asset_id text not null references public.partner_portal_assets(id) on delete cascade,
  owner_kind text not null check (owner_kind in ('drive_partner', 'stay_supplier')),
  storage_path text not null,
  record jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.partner_portal_review_queue (
  id text primary key,
  owner_id uuid not null references public.partners(id) on delete cascade,
  asset_id text not null references public.partner_portal_assets(id) on delete cascade,
  media_id text,
  owner_kind text not null check (owner_kind in ('drive_partner', 'stay_supplier')),
  record jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.partner_portal_contracts (
  id text primary key,
  owner_id uuid not null references public.partners(id) on delete cascade,
  owner_kind text not null check (owner_kind in ('drive_partner', 'stay_supplier')),
  record jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.partner_storage_cleanup_queue (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.partners(id) on delete cascade,
  document_id uuid not null,
  bucket text not null,
  storage_path text not null,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  unique (bucket, storage_path)
);

create or replace function public.persist_partner_portal_state(
  p_assets jsonb default '[]'::jsonb,
  p_media jsonb default '[]'::jsonb,
  p_reviews jsonb default '[]'::jsonb,
  p_contracts jsonb default '[]'::jsonb
) returns void language plpgsql security invoker set search_path = public as $$
begin
  insert into partner_portal_assets(id, owner_id, owner_kind, record, updated_at)
  select item->>'id', (item->>'owner_id')::uuid, item->>'owner_kind', item->'record', (item->>'updated_at')::timestamptz from jsonb_array_elements(p_assets) item
  on conflict (id) do update set owner_id=excluded.owner_id, owner_kind=excluded.owner_kind, record=excluded.record, updated_at=excluded.updated_at;
  insert into partner_portal_asset_media(id, owner_id, asset_id, owner_kind, storage_path, record, updated_at)
  select item->>'id', (item->>'owner_id')::uuid, item->>'asset_id', item->>'owner_kind', item->>'storage_path', item->'record', (item->>'updated_at')::timestamptz from jsonb_array_elements(p_media) item
  on conflict (id) do update set owner_id=excluded.owner_id, asset_id=excluded.asset_id, owner_kind=excluded.owner_kind, storage_path=excluded.storage_path, record=excluded.record, updated_at=excluded.updated_at;
  insert into partner_portal_review_queue(id, owner_id, asset_id, media_id, owner_kind, record, updated_at)
  select item->>'id', (item->>'owner_id')::uuid, item->>'asset_id', nullif(item->>'media_id',''), item->>'owner_kind', item->'record', (item->>'updated_at')::timestamptz from jsonb_array_elements(p_reviews) item
  on conflict (id) do update set owner_id=excluded.owner_id, asset_id=excluded.asset_id, media_id=excluded.media_id, owner_kind=excluded.owner_kind, record=excluded.record, updated_at=excluded.updated_at;
  insert into partner_portal_contracts(id, owner_id, owner_kind, record)
  select item->>'id', (item->>'owner_id')::uuid, item->>'owner_kind', item->'record' from jsonb_array_elements(p_contracts) item
  on conflict (id) do update set owner_id=excluded.owner_id, owner_kind=excluded.owner_kind, record=excluded.record, updated_at=now();
end;
$$;

revoke all on function public.persist_partner_portal_state(jsonb,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.persist_partner_portal_state(jsonb,jsonb,jsonb,jsonb) to service_role;

create index if not exists idx_partner_portal_assets_owner on public.partner_portal_assets(owner_id);
create index if not exists idx_partner_portal_asset_media_owner_asset on public.partner_portal_asset_media(owner_id, asset_id);
create index if not exists idx_partner_portal_review_owner on public.partner_portal_review_queue(owner_id);
create index if not exists idx_partner_portal_contracts_owner on public.partner_portal_contracts(owner_id);

alter table public.partner_portal_assets enable row level security;
alter table public.partner_portal_asset_media enable row level security;
alter table public.partner_portal_review_queue enable row level security;
alter table public.partner_portal_contracts enable row level security;
alter table public.partner_storage_cleanup_queue enable row level security;

revoke all on table public.partner_portal_assets, public.partner_portal_asset_media,
  public.partner_portal_review_queue, public.partner_portal_contracts, public.partner_storage_cleanup_queue from anon, authenticated;
grant select, insert, update, delete on table public.partner_portal_assets,
  public.partner_portal_asset_media, public.partner_portal_contracts to authenticated;
grant select, insert on table public.partner_portal_review_queue to authenticated;
grant all on table public.partner_portal_assets, public.partner_portal_asset_media,
  public.partner_portal_review_queue, public.partner_portal_contracts, public.partner_storage_cleanup_queue to service_role;

create policy partner_portal_assets_owner_select on public.partner_portal_assets
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy partner_portal_assets_owner_insert on public.partner_portal_assets
  for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy partner_portal_assets_owner_update on public.partner_portal_assets
  for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy partner_portal_assets_owner_delete on public.partner_portal_assets
  for delete to authenticated using ((select auth.uid()) = owner_id);

create policy partner_portal_media_owner_select on public.partner_portal_asset_media
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy partner_portal_media_owner_insert on public.partner_portal_asset_media
  for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy partner_portal_media_owner_update on public.partner_portal_asset_media
  for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy partner_portal_media_owner_delete on public.partner_portal_asset_media
  for delete to authenticated using ((select auth.uid()) = owner_id);

create policy partner_portal_review_owner_select on public.partner_portal_review_queue
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy partner_portal_review_owner_insert on public.partner_portal_review_queue
  for insert to authenticated with check ((select auth.uid()) = owner_id);

create policy partner_portal_contracts_owner_select on public.partner_portal_contracts
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy partner_portal_contracts_owner_insert on public.partner_portal_contracts
  for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy partner_portal_contracts_owner_update on public.partner_portal_contracts
  for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy partner_portal_contracts_owner_delete on public.partner_portal_contracts
  for delete to authenticated using ((select auth.uid()) = owner_id);

-- Document mutations remain server-authoritative through the owner-scoped API.
-- Partners may read their rows through the existing RLS policy, but cannot
-- self-approve or directly change review state through the Data API.
revoke update, delete on table public.partner_documents from authenticated;

commit;
