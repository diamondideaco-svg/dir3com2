-- DIR3COM Admin Product Lifecycle + Request Handoff
-- Scope: audited, fail-closed operational lifecycle. No DABRA changes.

alter table public.products
  add column if not exists lifecycle_version integer not null default 1,
  add column if not exists published_at timestamptz,
  add column if not exists published_by uuid,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid;

create table if not exists public.product_audit_events (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  action text not null check (action in ('create_draft','update_draft','publish','unpublish','archive')),
  actor_user_id uuid not null,
  actor_role text not null check (actor_role in ('admin','staff')),
  country text,
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  reason text,
  correlation_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create index if not exists idx_product_audit_events_product_created
  on public.product_audit_events(product_id, created_at desc);

alter table public.product_audit_events enable row level security;

-- Admin/staff may read lifecycle history. Writes occur only inside the audited RPCs below.
drop policy if exists product_audit_admin_read on public.product_audit_events;
create policy product_audit_admin_read
on public.product_audit_events
for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin','staff')
      and p.status = 'active'
      and p.deleted_at is null
  )
);

revoke insert, update, delete on public.product_audit_events from anon, authenticated;
grant select on public.product_audit_events to authenticated;

create or replace function public.product_lifecycle_actor_role()
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role text;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'PRODUCT_LIFECYCLE_AUTH_REQUIRED';
  end if;

  select role, status into v_role, v_status
  from public.profiles
  where id = auth.uid() and deleted_at is null;

  if v_role not in ('admin','staff') or v_status <> 'active' then
    raise exception 'PRODUCT_LIFECYCLE_DENIED';
  end if;

  return v_role;
end;
$$;

revoke all on function public.product_lifecycle_actor_role() from public, anon;
grant execute on function public.product_lifecycle_actor_role() to authenticated;

create or replace function public.create_product_draft_lifecycle(
  p_name_ar text,
  p_name_en text,
  p_slug text,
  p_base_price numeric,
  p_country text,
  p_city text,
  p_marketplace_family text,
  p_fulfilment_state text,
  p_transaction_method text,
  p_supply_type text,
  p_supplier_verified boolean,
  p_featured boolean,
  p_shield_certified boolean,
  p_reason text default 'Admin draft created'
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_id uuid;
  v_after jsonb;
begin
  v_role := public.product_lifecycle_actor_role();

  if nullif(btrim(coalesce(p_name_ar,'')), '') is null
     and nullif(btrim(coalesce(p_name_en,'')), '') is null then
    raise exception 'PRODUCT_NAME_REQUIRED';
  end if;
  if nullif(btrim(coalesce(p_country,'')), '') is null then
    raise exception 'PRODUCT_COUNTRY_REQUIRED';
  end if;

  insert into public.products (
    name_ar, name_en, slug, base_price, country, city,
    marketplace_family, fulfilment_state, transaction_method, supply_type,
    supplier_verified, marketplace_environment, synthetic,
    status, featured, verified, shield_certified, lifecycle_version
  ) values (
    coalesce(p_name_ar,''), coalesce(p_name_en,''), p_slug, greatest(coalesce(p_base_price,0),0),
    p_country, nullif(btrim(coalesce(p_city,'')), ''),
    p_marketplace_family, p_fulfilment_state, p_transaction_method, p_supply_type,
    coalesce(p_supplier_verified,false), 'production', false,
    'draft', coalesce(p_featured,false), false, coalesce(p_shield_certified,false), 1
  )
  returning id into v_id;

  select to_jsonb(p) into v_after from public.products p where p.id = v_id;

  insert into public.product_audit_events(
    product_id, action, actor_user_id, actor_role, country, before_state, after_state, reason
  ) values (
    v_id, 'create_draft', v_actor, v_role, p_country, '{}'::jsonb, v_after, nullif(btrim(coalesce(p_reason,'')), '')
  );

  return v_id;
end;
$$;

create or replace function public.update_product_draft_lifecycle(
  p_product_id uuid,
  p_expected_version integer,
  p_name_ar text,
  p_name_en text,
  p_slug text,
  p_base_price numeric,
  p_country text,
  p_city text,
  p_marketplace_family text,
  p_fulfilment_state text,
  p_transaction_method text,
  p_supply_type text,
  p_supplier_verified boolean,
  p_featured boolean,
  p_shield_certified boolean,
  p_reason text default 'Admin draft updated'
)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_before jsonb;
  v_after jsonb;
  v_version integer;
  v_status text;
  v_deleted timestamptz;
begin
  v_role := public.product_lifecycle_actor_role();

  select to_jsonb(p), p.lifecycle_version, p.status, p.deleted_at
    into v_before, v_version, v_status, v_deleted
  from public.products p
  where p.id = p_product_id
  for update;

  if v_before is null then raise exception 'PRODUCT_NOT_FOUND'; end if;
  if v_deleted is not null then raise exception 'PRODUCT_ARCHIVED'; end if;
  if v_version <> p_expected_version then raise exception 'PRODUCT_VERSION_STALE'; end if;
  if v_status <> 'draft' then raise exception 'PRODUCT_NOT_DRAFT'; end if;

  update public.products set
    name_ar = coalesce(p_name_ar,''),
    name_en = coalesce(p_name_en,''),
    slug = p_slug,
    base_price = greatest(coalesce(p_base_price,0),0),
    country = p_country,
    city = nullif(btrim(coalesce(p_city,'')), ''),
    marketplace_family = p_marketplace_family,
    fulfilment_state = p_fulfilment_state,
    transaction_method = p_transaction_method,
    supply_type = p_supply_type,
    supplier_verified = coalesce(p_supplier_verified,false),
    featured = coalesce(p_featured,false),
    shield_certified = coalesce(p_shield_certified,false),
    lifecycle_version = lifecycle_version + 1,
    updated_at = now()
  where id = p_product_id
  returning lifecycle_version into v_version;

  select to_jsonb(p) into v_after from public.products p where p.id = p_product_id;

  insert into public.product_audit_events(product_id, action, actor_user_id, actor_role, country, before_state, after_state, reason)
  values (p_product_id, 'update_draft', v_actor, v_role, p_country, v_before, v_after, nullif(btrim(coalesce(p_reason,'')), ''));

  return v_version;
end;
$$;

create or replace function public.publish_product_lifecycle(
  p_product_id uuid,
  p_expected_version integer,
  p_reason text default 'Admin publish'
)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_before jsonb;
  v_after jsonb;
  v_version integer;
  v_country text;
  v_status text;
  v_deleted timestamptz;
  v_synthetic boolean;
  v_environment text;
  v_family text;
  v_fulfilment text;
  v_transaction text;
begin
  v_role := public.product_lifecycle_actor_role();

  select to_jsonb(p), p.lifecycle_version, p.country, p.status, p.deleted_at,
         p.synthetic, p.marketplace_environment, p.marketplace_family,
         p.fulfilment_state, p.transaction_method
    into v_before, v_version, v_country, v_status, v_deleted,
         v_synthetic, v_environment, v_family, v_fulfilment, v_transaction
  from public.products p
  where p.id = p_product_id
  for update;

  if v_before is null then raise exception 'PRODUCT_NOT_FOUND'; end if;
  if v_deleted is not null then raise exception 'PRODUCT_ARCHIVED'; end if;
  if v_version <> p_expected_version then raise exception 'PRODUCT_VERSION_STALE'; end if;
  if v_status <> 'draft' then raise exception 'PRODUCT_NOT_DRAFT'; end if;
  if coalesce(v_synthetic,true) then raise exception 'PRODUCT_SYNTHETIC_BLOCKED'; end if;
  if v_environment <> 'production' then raise exception 'PRODUCT_ENVIRONMENT_BLOCKED'; end if;
  if v_family is null then raise exception 'PRODUCT_FAMILY_REQUIRED'; end if;
  if v_fulfilment in ('catalog_only','test_sandbox') then raise exception 'PRODUCT_FULFILMENT_NOT_READY'; end if;
  if v_transaction = 'none' then raise exception 'PRODUCT_TRANSACTION_METHOD_REQUIRED'; end if;

  update public.products set
    status = 'published',
    lifecycle_version = lifecycle_version + 1,
    published_at = now(),
    published_by = v_actor,
    updated_at = now()
  where id = p_product_id
  returning lifecycle_version into v_version;

  select to_jsonb(p) into v_after from public.products p where p.id = p_product_id;
  insert into public.product_audit_events(product_id, action, actor_user_id, actor_role, country, before_state, after_state, reason)
  values (p_product_id, 'publish', v_actor, v_role, v_country, v_before, v_after, nullif(btrim(coalesce(p_reason,'')), ''));

  return v_version;
end;
$$;

create or replace function public.unpublish_product_lifecycle(
  p_product_id uuid,
  p_expected_version integer,
  p_reason text default 'Admin unpublish'
)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_before jsonb;
  v_after jsonb;
  v_version integer;
  v_country text;
  v_status text;
  v_deleted timestamptz;
begin
  v_role := public.product_lifecycle_actor_role();

  select to_jsonb(p), p.lifecycle_version, p.country, p.status, p.deleted_at
    into v_before, v_version, v_country, v_status, v_deleted
  from public.products p where p.id = p_product_id for update;

  if v_before is null then raise exception 'PRODUCT_NOT_FOUND'; end if;
  if v_deleted is not null then raise exception 'PRODUCT_ARCHIVED'; end if;
  if v_version <> p_expected_version then raise exception 'PRODUCT_VERSION_STALE'; end if;
  if v_status <> 'published' then raise exception 'PRODUCT_NOT_PUBLISHED'; end if;

  update public.products set
    status = 'draft',
    lifecycle_version = lifecycle_version + 1,
    updated_at = now()
  where id = p_product_id
  returning lifecycle_version into v_version;

  select to_jsonb(p) into v_after from public.products p where p.id = p_product_id;
  insert into public.product_audit_events(product_id, action, actor_user_id, actor_role, country, before_state, after_state, reason)
  values (p_product_id, 'unpublish', v_actor, v_role, v_country, v_before, v_after, nullif(btrim(coalesce(p_reason,'')), ''));

  return v_version;
end;
$$;

create or replace function public.archive_product_lifecycle(
  p_product_id uuid,
  p_expected_version integer,
  p_reason text default 'Admin archive'
)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_before jsonb;
  v_after jsonb;
  v_version integer;
  v_country text;
  v_request_count bigint;
  v_booking_count bigint;
begin
  v_role := public.product_lifecycle_actor_role();

  select to_jsonb(p), p.lifecycle_version, p.country
    into v_before, v_version, v_country
  from public.products p
  where p.id = p_product_id and p.deleted_at is null
  for update;

  if v_before is null then raise exception 'PRODUCT_NOT_FOUND_OR_ARCHIVED'; end if;
  if v_version <> p_expected_version then raise exception 'PRODUCT_VERSION_STALE'; end if;

  select count(*) into v_request_count from public.marketplace_requests where product_id = p_product_id;
  select count(*) into v_booking_count from public.bookings where product_id = p_product_id;

  -- Archive is intentionally allowed with historical dependencies; hard delete is not exposed.
  update public.products set
    status = 'draft',
    deleted_at = now(),
    archived_at = now(),
    archived_by = v_actor,
    lifecycle_version = lifecycle_version + 1,
    updated_at = now()
  where id = p_product_id
  returning lifecycle_version into v_version;

  select to_jsonb(p) into v_after from public.products p where p.id = p_product_id;
  insert into public.product_audit_events(product_id, action, actor_user_id, actor_role, country, before_state, after_state, reason)
  values (
    p_product_id, 'archive', v_actor, v_role, v_country, v_before, v_after,
    coalesce(nullif(btrim(coalesce(p_reason,'')), ''), 'Admin archive') ||
      format(' [historical_requests=%s historical_bookings=%s]', v_request_count, v_booking_count)
  );

  return v_version;
end;
$$;

revoke all on function public.create_product_draft_lifecycle(text,text,text,numeric,text,text,text,text,text,text,boolean,boolean,boolean,text) from public, anon;
revoke all on function public.update_product_draft_lifecycle(uuid,integer,text,text,text,numeric,text,text,text,text,text,text,boolean,boolean,boolean,text) from public, anon;
revoke all on function public.publish_product_lifecycle(uuid,integer,text) from public, anon;
revoke all on function public.unpublish_product_lifecycle(uuid,integer,text) from public, anon;
revoke all on function public.archive_product_lifecycle(uuid,integer,text) from public, anon;

grant execute on function public.create_product_draft_lifecycle(text,text,text,numeric,text,text,text,text,text,text,boolean,boolean,boolean,text) to authenticated;
grant execute on function public.update_product_draft_lifecycle(uuid,integer,text,text,text,numeric,text,text,text,text,text,text,boolean,boolean,boolean,text) to authenticated;
grant execute on function public.publish_product_lifecycle(uuid,integer,text) to authenticated;
grant execute on function public.unpublish_product_lifecycle(uuid,integer,text) to authenticated;
grant execute on function public.archive_product_lifecycle(uuid,integer,text) to authenticated;

-- Atomically persist the handoff start before redirecting an operator to WhatsApp.
create or replace function public.start_marketplace_request_handoff(
  p_request_id uuid,
  p_handoff_reference text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_status text;
  v_product_id uuid;
begin
  v_role := public.product_lifecycle_actor_role();

  select status, product_id into v_status, v_product_id
  from public.marketplace_requests
  where id = p_request_id
  for update;

  if v_status is null then raise exception 'REQUEST_NOT_FOUND'; end if;

  update public.marketplace_requests
  set handoff_type = 'whatsapp',
      fulfilment_method = 'whatsapp_handoff',
      handoff_reference = nullif(btrim(coalesce(p_handoff_reference,'')), ''),
      handoff_started_at = coalesce(handoff_started_at, now()),
      next_action = 'await_partner_response',
      updated_at = now()
  where id = p_request_id;

  insert into public.marketplace_request_audit_logs(
    request_id, actor_user_id, actor_identity, actor_role, actor_source,
    previous_status, new_status, event_type, metadata
  ) values (
    p_request_id, v_actor, v_actor::text, v_role, 'authenticated_admin',
    v_status, v_status, 'request_status_updated',
    jsonb_build_object(
      'operation', 'whatsapp_handoff_started',
      'handoff_reference', nullif(btrim(coalesce(p_handoff_reference,'')), ''),
      'product_id', v_product_id
    )
  );
end;
$$;

revoke all on function public.start_marketplace_request_handoff(uuid,text) from public, anon;
grant execute on function public.start_marketplace_request_handoff(uuid,text) to authenticated;
