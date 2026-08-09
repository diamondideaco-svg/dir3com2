alter table public.webhook_idempotency_events
  add column if not exists send_started_at timestamptz,
  add column if not exists destination_profile text,
  add column if not exists inbound_message_id text;

alter table public.webhook_idempotency_events enable row level security;

comment on column public.webhook_idempotency_events.destination_profile is
  'Non-sensitive routing profile identifier such as EG or SA.';

create index if not exists webhook_idempotency_events_send_started_idx
  on public.webhook_idempotency_events (status, send_started_at)
  where status = 'send_started';

create or replace function public.acquire_whatsapp_event_lease(
  p_event_key text,
  p_lease_owner text,
  p_ttl_seconds integer default 900,
  p_lease_seconds integer default 60,
  p_max_attempts integer default 3
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := pg_catalog.btrim(coalesce(p_event_key, ''));
  v_owner text := pg_catalog.btrim(coalesce(p_lease_owner, ''));
  v_now timestamptz := pg_catalog.now();
  v_ttl integer := greatest(coalesce(p_ttl_seconds, 900), 1);
  v_lease integer := greatest(coalesce(p_lease_seconds, 60), 1);
  v_started_grace integer := greatest(v_lease * 2, 120);
  v_limit integer := greatest(coalesce(p_max_attempts, 3), 1);
  v_row public.webhook_idempotency_events%rowtype;
begin
  if v_key = '' or v_owner = '' then
    return pg_catalog.jsonb_build_object('decision', 'retry_exhausted', 'state', 'processing', 'lease_owner', '', 'attempt_count', 0);
  end if;

  delete from public.webhook_idempotency_events
  where expires_at <= v_now
    and status not in ('send_started', 'unknown_outcome');

  select * into v_row
  from public.webhook_idempotency_events
  where event_key = v_key
  for update;

  if not found then
    insert into public.webhook_idempotency_events (
      event_key, source, status, lease_owner, lease_expires_at, retry_after,
      attempt_count, outbound_message_id, last_error_code, expires_at, created_at, updated_at
    ) values (
      v_key, 'whatsapp', 'processing', v_owner,
      v_now + pg_catalog.make_interval(secs => v_lease), null, 1, null, null,
      v_now + pg_catalog.make_interval(secs => v_ttl), v_now, v_now
    )
    on conflict (event_key) do nothing
    returning * into v_row;

    if found then
      return pg_catalog.jsonb_build_object('decision', 'acquired', 'state', 'processing', 'lease_owner', v_owner, 'attempt_count', 1);
    end if;

    select * into v_row
    from public.webhook_idempotency_events
    where event_key = v_key
    for update;
  end if;

  if v_row.status = 'completed' then
    return pg_catalog.jsonb_build_object('decision', 'duplicate_completed', 'state', v_row.status, 'lease_owner', '', 'attempt_count', v_row.attempt_count);
  end if;

  if v_row.status = 'permanent_failed' then
    return pg_catalog.jsonb_build_object('decision', 'permanent_failed', 'state', v_row.status, 'lease_owner', '', 'attempt_count', v_row.attempt_count);
  end if;

  if v_row.status = 'unknown_outcome' then
    return pg_catalog.jsonb_build_object('decision', 'unknown_wait', 'state', v_row.status, 'lease_owner', '', 'attempt_count', v_row.attempt_count);
  end if;

  if v_row.status = 'send_started' then
    if v_row.send_started_at is not null
       and v_row.send_started_at + pg_catalog.make_interval(secs => v_started_grace) <= v_now then
      update public.webhook_idempotency_events
      set status = 'unknown_outcome', lease_owner = null, lease_expires_at = null,
          retry_after = null, last_error_code = 'WORKER_LOST_AFTER_SEND_STARTED', updated_at = v_now
      where event_key = v_key
        and status = 'send_started'
        and lease_owner = v_row.lease_owner
        and attempt_count = v_row.attempt_count;

      return pg_catalog.jsonb_build_object('decision', 'unknown_wait', 'state', 'unknown_outcome', 'lease_owner', '', 'attempt_count', v_row.attempt_count);
    end if;

    return pg_catalog.jsonb_build_object('decision', 'send_in_progress', 'state', 'send_started', 'lease_owner', '', 'attempt_count', v_row.attempt_count);
  end if;

  if v_row.status = 'processing' and v_row.lease_expires_at is not null and v_row.lease_expires_at > v_now then
    return pg_catalog.jsonb_build_object('decision', 'duplicate_processing', 'state', v_row.status, 'lease_owner', '', 'attempt_count', v_row.attempt_count);
  end if;

  if v_row.status = 'retryable_failed' and v_row.retry_after is not null and v_row.retry_after > v_now then
    return pg_catalog.jsonb_build_object('decision', 'retry_wait', 'state', v_row.status, 'lease_owner', '', 'attempt_count', v_row.attempt_count);
  end if;

  if v_row.attempt_count >= v_limit then
    return pg_catalog.jsonb_build_object('decision', 'retry_exhausted', 'state', v_row.status, 'lease_owner', '', 'attempt_count', v_row.attempt_count);
  end if;

  update public.webhook_idempotency_events
  set status = 'processing', lease_owner = v_owner,
      lease_expires_at = v_now + pg_catalog.make_interval(secs => v_lease),
      retry_after = null, attempt_count = v_row.attempt_count + 1,
      send_started_at = null, destination_profile = null, inbound_message_id = null,
      last_error_code = null, updated_at = v_now,
      expires_at = greatest(v_row.expires_at, v_now + pg_catalog.make_interval(secs => v_ttl))
  where event_key = v_key
    and status in ('processing', 'retryable_failed')
    and attempt_count = v_row.attempt_count;

  return pg_catalog.jsonb_build_object('decision', 'acquired', 'state', 'processing', 'lease_owner', v_owner, 'attempt_count', v_row.attempt_count + 1);
end;
$$;

create or replace function public.begin_whatsapp_event_send(
  p_event_key text,
  p_lease_owner text,
  p_attempt_number integer,
  p_destination_profile text,
  p_inbound_message_id text,
  p_ttl_seconds integer default 900
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.now();
  v_updated integer := 0;
begin
  update public.webhook_idempotency_events
  set status = 'send_started',
      send_started_at = v_now,
      destination_profile = nullif(pg_catalog.btrim(coalesce(p_destination_profile, '')), ''),
      inbound_message_id = nullif(pg_catalog.btrim(coalesce(p_inbound_message_id, '')), ''),
      updated_at = v_now,
      expires_at = greatest(expires_at, v_now + pg_catalog.make_interval(secs => greatest(coalesce(p_ttl_seconds, 900), 1)))
  where event_key = pg_catalog.btrim(coalesce(p_event_key, ''))
    and lease_owner = pg_catalog.btrim(coalesce(p_lease_owner, ''))
    and attempt_count = p_attempt_number
    and status = 'processing'
    and lease_expires_at > v_now;

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

drop function if exists public.complete_whatsapp_event_lease(text, text, text, integer);
create function public.complete_whatsapp_event_lease(
  p_event_key text, p_lease_owner text, p_attempt_number integer,
  p_outbound_message_id text, p_ttl_seconds integer default 900
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.now();
  v_updated integer := 0;
begin
  update public.webhook_idempotency_events
  set status = 'completed', lease_owner = null, lease_expires_at = null, retry_after = null,
      outbound_message_id = pg_catalog.btrim(coalesce(p_outbound_message_id, '')),
      last_error_code = null, updated_at = v_now,
      expires_at = v_now + pg_catalog.make_interval(secs => greatest(coalesce(p_ttl_seconds, 900), 1))
  where event_key = pg_catalog.btrim(coalesce(p_event_key, ''))
    and lease_owner = pg_catalog.btrim(coalesce(p_lease_owner, ''))
    and attempt_count = p_attempt_number
    and status = 'send_started';

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

drop function if exists public.fail_whatsapp_event_lease(text, text, text, text, integer, integer);
create function public.fail_whatsapp_event_lease(
  p_event_key text, p_lease_owner text, p_attempt_number integer,
  p_failure_state text, p_error_code text default null,
  p_ttl_seconds integer default 900, p_retry_after_seconds integer default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.now();
  v_state text := pg_catalog.btrim(coalesce(p_failure_state, ''));
  v_updated integer := 0;
begin
  if v_state not in ('retryable_failed', 'unknown_outcome', 'permanent_failed') then
    return false;
  end if;

  update public.webhook_idempotency_events
  set status = v_state, lease_owner = null, lease_expires_at = null,
      retry_after = case
        when v_state = 'retryable_failed' and coalesce(p_retry_after_seconds, 0) > 0
          then v_now + pg_catalog.make_interval(secs => greatest(p_retry_after_seconds, 0))
        else null
      end,
      last_error_code = nullif(pg_catalog.btrim(coalesce(p_error_code, '')), ''),
      updated_at = v_now,
      expires_at = greatest(expires_at, v_now + pg_catalog.make_interval(secs => greatest(coalesce(p_ttl_seconds, 900), 1)))
  where event_key = pg_catalog.btrim(coalesce(p_event_key, ''))
    and lease_owner = pg_catalog.btrim(coalesce(p_lease_owner, ''))
    and attempt_count = p_attempt_number
    and status = 'send_started';

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function public.begin_whatsapp_event_send(text, text, integer, text, text, integer) from public, anon, authenticated;
revoke all on function public.complete_whatsapp_event_lease(text, text, integer, text, integer) from public, anon, authenticated;
revoke all on function public.fail_whatsapp_event_lease(text, text, integer, text, text, integer, integer) from public, anon, authenticated;

grant execute on function public.begin_whatsapp_event_send(text, text, integer, text, text, integer) to service_role;
grant execute on function public.complete_whatsapp_event_lease(text, text, integer, text, integer) to service_role;
grant execute on function public.fail_whatsapp_event_lease(text, text, integer, text, text, integer, integer) to service_role;
