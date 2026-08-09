alter table public.webhook_idempotency_events
  add column if not exists status text,
  add column if not exists lease_owner text,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists retry_after timestamptz,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists outbound_message_id text,
  add column if not exists last_error_code text,
  add column if not exists updated_at timestamptz not null default now();

update public.webhook_idempotency_events
set status = coalesce(status, 'completed'),
    attempt_count = case when attempt_count > 0 then attempt_count else 1 end,
    updated_at = coalesce(updated_at, now())
where status is null
   or attempt_count = 0;

alter table public.webhook_idempotency_events
  alter column status set default 'completed';

create index if not exists webhook_idempotency_events_status_retry_idx
  on public.webhook_idempotency_events (status, retry_after, lease_expires_at);

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
set search_path = public
as $$
declare
  v_key text := trim(coalesce(p_event_key, ''));
  v_owner text := trim(coalesce(p_lease_owner, ''));
  v_now timestamptz := now();
  v_ttl integer := greatest(coalesce(p_ttl_seconds, 900), 1);
  v_lease integer := greatest(coalesce(p_lease_seconds, 60), 1);
  v_limit integer := greatest(coalesce(p_max_attempts, 3), 1);
  v_row public.webhook_idempotency_events%rowtype;
begin
  if v_key = '' or v_owner = '' then
    return jsonb_build_object('decision', 'retry_exhausted', 'state', 'processing', 'lease_owner', '', 'attempt_count', 0);
  end if;

  delete from public.webhook_idempotency_events
  where expires_at <= v_now;

  select *
  into v_row
  from public.webhook_idempotency_events
  where event_key = v_key
  for update;

  if not found then
    insert into public.webhook_idempotency_events (
      event_key, source, status, lease_owner, lease_expires_at, retry_after, attempt_count, outbound_message_id, last_error_code, expires_at, created_at, updated_at
    ) values (
      v_key, 'whatsapp', 'processing', v_owner, v_now + make_interval(secs => v_lease), null, 1, null, null, v_now + make_interval(secs => v_ttl), v_now, v_now
    );

    return jsonb_build_object('decision', 'acquired', 'state', 'processing', 'lease_owner', v_owner, 'attempt_count', 1);
  end if;

  if v_row.status = 'completed' then
    return jsonb_build_object('decision', 'duplicate_completed', 'state', v_row.status, 'lease_owner', coalesce(v_row.lease_owner, ''), 'attempt_count', v_row.attempt_count);
  end if;

  if v_row.status = 'permanent_failed' then
    return jsonb_build_object('decision', 'permanent_failed', 'state', v_row.status, 'lease_owner', coalesce(v_row.lease_owner, ''), 'attempt_count', v_row.attempt_count);
  end if;

  if v_row.status = 'processing' and v_row.lease_expires_at is not null and v_row.lease_expires_at > v_now then
    return jsonb_build_object('decision', 'duplicate_processing', 'state', v_row.status, 'lease_owner', coalesce(v_row.lease_owner, ''), 'attempt_count', v_row.attempt_count);
  end if;

  if v_row.status = 'retryable_failed' and v_row.retry_after is not null and v_row.retry_after > v_now then
    return jsonb_build_object('decision', 'retry_wait', 'state', v_row.status, 'lease_owner', coalesce(v_row.lease_owner, ''), 'attempt_count', v_row.attempt_count);
  end if;

  if v_row.status = 'unknown_outcome' and v_row.retry_after is not null and v_row.retry_after > v_now then
    return jsonb_build_object('decision', 'unknown_wait', 'state', v_row.status, 'lease_owner', coalesce(v_row.lease_owner, ''), 'attempt_count', v_row.attempt_count);
  end if;

  if v_row.attempt_count >= v_limit then
    return jsonb_build_object('decision', 'retry_exhausted', 'state', v_row.status, 'lease_owner', coalesce(v_row.lease_owner, ''), 'attempt_count', v_row.attempt_count);
  end if;

  update public.webhook_idempotency_events
  set status = 'processing',
      lease_owner = v_owner,
      lease_expires_at = v_now + make_interval(secs => v_lease),
      retry_after = null,
      attempt_count = v_row.attempt_count + 1,
      last_error_code = null,
      updated_at = v_now,
      expires_at = greatest(v_row.expires_at, v_now + make_interval(secs => v_ttl))
  where event_key = v_key;

  return jsonb_build_object('decision', 'acquired', 'state', 'processing', 'lease_owner', v_owner, 'attempt_count', v_row.attempt_count + 1);
end;
$$;

create or replace function public.complete_whatsapp_event_lease(
  p_event_key text,
  p_lease_owner text,
  p_outbound_message_id text,
  p_ttl_seconds integer default 900
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_ttl integer := greatest(coalesce(p_ttl_seconds, 900), 1);
  v_updated integer := 0;
begin
  update public.webhook_idempotency_events
  set status = 'completed',
      lease_owner = null,
      lease_expires_at = null,
      retry_after = null,
      outbound_message_id = trim(coalesce(p_outbound_message_id, '')),
      last_error_code = null,
      updated_at = v_now,
      expires_at = v_now + make_interval(secs => v_ttl)
  where event_key = trim(coalesce(p_event_key, ''))
    and lease_owner = trim(coalesce(p_lease_owner, ''))
    and status = 'processing';

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

create or replace function public.fail_whatsapp_event_lease(
  p_event_key text,
  p_lease_owner text,
  p_failure_state text,
  p_error_code text default null,
  p_ttl_seconds integer default 900,
  p_retry_after_seconds integer default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_ttl integer := greatest(coalesce(p_ttl_seconds, 900), 1);
  v_retry integer := greatest(coalesce(p_retry_after_seconds, 0), 0);
  v_state text := trim(coalesce(p_failure_state, ''));
  v_updated integer := 0;
begin
  if v_state not in ('retryable_failed', 'unknown_outcome', 'permanent_failed') then
    return false;
  end if;

  update public.webhook_idempotency_events
  set status = v_state,
      lease_owner = null,
      lease_expires_at = null,
      retry_after = case when v_state in ('retryable_failed', 'unknown_outcome') and v_retry > 0 then v_now + make_interval(secs => v_retry) else null end,
      last_error_code = nullif(trim(coalesce(p_error_code, '')), ''),
      updated_at = v_now,
      expires_at = v_now + make_interval(secs => v_ttl)
  where event_key = trim(coalesce(p_event_key, ''))
    and lease_owner = trim(coalesce(p_lease_owner, ''))
    and status = 'processing';

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function public.acquire_whatsapp_event_lease(text, text, integer, integer, integer) from public;
revoke all on function public.acquire_whatsapp_event_lease(text, text, integer, integer, integer) from anon;
revoke all on function public.acquire_whatsapp_event_lease(text, text, integer, integer, integer) from authenticated;
grant execute on function public.acquire_whatsapp_event_lease(text, text, integer, integer, integer) to service_role;

revoke all on function public.complete_whatsapp_event_lease(text, text, text, integer) from public;
revoke all on function public.complete_whatsapp_event_lease(text, text, text, integer) from anon;
revoke all on function public.complete_whatsapp_event_lease(text, text, text, integer) from authenticated;
grant execute on function public.complete_whatsapp_event_lease(text, text, text, integer) to service_role;

revoke all on function public.fail_whatsapp_event_lease(text, text, text, text, integer, integer) from public;
revoke all on function public.fail_whatsapp_event_lease(text, text, text, text, integer, integer) from anon;
revoke all on function public.fail_whatsapp_event_lease(text, text, text, text, integer, integer) from authenticated;
grant execute on function public.fail_whatsapp_event_lease(text, text, text, text, integer, integer) to service_role;