-- DIR3COM Partner Request Handoff
-- Service-role-only atomic command invoked after authenticated partner ownership checks.
-- Handoff events are not status transitions and therefore use a dedicated append-only ledger.

create table if not exists public.marketplace_request_handoff_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.marketplace_requests(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  initiated_by_partner_user_id uuid not null references public.profiles(id) on delete restrict,
  handoff_type text not null check (handoff_type in ('whatsapp')),
  handoff_reference text not null check (nullif(btrim(handoff_reference), '') is not null),
  request_status_at_handoff text not null check (nullif(btrim(request_status_at_handoff), '') is not null),
  created_at timestamptz not null default now()
);

create index if not exists idx_marketplace_request_handoff_events_request_created
  on public.marketplace_request_handoff_events(request_id, created_at desc);

alter table public.marketplace_request_handoff_events enable row level security;
revoke all on table public.marketplace_request_handoff_events from public, anon, authenticated, service_role;
grant select, insert on table public.marketplace_request_handoff_events to service_role;

create or replace function public.reject_marketplace_request_handoff_event_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception using errcode = '55000', message = 'MARKETPLACE_REQUEST_HANDOFF_APPEND_ONLY';
end;
$$;

create trigger marketplace_request_handoff_events_reject_update_delete
before update or delete on public.marketplace_request_handoff_events
for each row execute function public.reject_marketplace_request_handoff_event_mutation();

create trigger marketplace_request_handoff_events_reject_truncate
before truncate on public.marketplace_request_handoff_events
for each statement execute function public.reject_marketplace_request_handoff_event_mutation();

revoke all on function public.reject_marketplace_request_handoff_event_mutation() from public, anon, authenticated, service_role;

create or replace function public.start_partner_marketplace_request_handoff(
  p_actor_user_id uuid,
  p_request_id uuid,
  p_handoff_reference text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_role text;
  v_profile_status text;
  v_status text;
  v_product_id uuid;
  v_owned boolean;
  v_reference text := nullif(btrim(coalesce(p_handoff_reference,'')), '');
begin
  if v_reference is null then
    raise exception 'HANDOFF_REFERENCE_REQUIRED';
  end if;

  select role, status into v_profile_role, v_profile_status
  from public.profiles
  where id = p_actor_user_id and deleted_at is null;

  if v_profile_role <> 'partner' or v_profile_status <> 'active' then
    raise exception 'PARTNER_HANDOFF_ACTOR_DENIED';
  end if;

  select status, product_id into v_status, v_product_id
  from public.marketplace_requests
  where id = p_request_id
  for update;

  if v_status is null then raise exception 'REQUEST_NOT_FOUND'; end if;

  select exists (
    select 1
    from public.product_availability pa
    where pa.product_id = v_product_id
      and pa.partner_id = p_actor_user_id
  ) into v_owned;

  if not v_owned then raise exception 'REQUEST_PARTNER_SCOPE_DENIED'; end if;

  if exists (
    select 1 from public.marketplace_request_handoff_events e
    where e.request_id = p_request_id
      and e.handoff_type = 'whatsapp'
  ) then
    raise exception 'REQUEST_HANDOFF_ALREADY_STARTED';
  end if;

  update public.marketplace_requests
  set handoff_type = 'whatsapp',
      fulfilment_method = 'whatsapp_handoff',
      handoff_reference = v_reference,
      handoff_started_at = coalesce(handoff_started_at, now()),
      next_action = 'await_partner_response',
      updated_at = now()
  where id = p_request_id;

  insert into public.marketplace_request_handoff_events(
    request_id, product_id, initiated_by_partner_user_id,
    handoff_type, handoff_reference, request_status_at_handoff
  ) values (
    p_request_id, v_product_id, p_actor_user_id,
    'whatsapp', v_reference, v_status
  );
end;
$$;

revoke all on function public.start_partner_marketplace_request_handoff(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.start_partner_marketplace_request_handoff(uuid,uuid,text) to service_role;
