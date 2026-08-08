create table if not exists public.webhook_idempotency_events (
  event_key text primary key,
  source text not null default 'whatsapp',
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists webhook_idempotency_events_expires_at_idx
  on public.webhook_idempotency_events (expires_at);

revoke all on table public.webhook_idempotency_events from public;
revoke all on table public.webhook_idempotency_events from anon;
revoke all on table public.webhook_idempotency_events from authenticated;
grant select, insert, update, delete on table public.webhook_idempotency_events to service_role;

create or replace function public.reserve_whatsapp_event(p_event_key text, p_ttl_seconds integer default 900)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer := 0;
  v_ttl_seconds integer := greatest(coalesce(p_ttl_seconds, 900), 1);
begin
  if coalesce(trim(p_event_key), '') = '' then
    return false;
  end if;

  delete from public.webhook_idempotency_events
  where event_key in (
    select event_key
    from public.webhook_idempotency_events
    where expires_at <= now()
    order by expires_at asc
    limit 500
  );

  insert into public.webhook_idempotency_events (event_key, source, expires_at)
  values (trim(p_event_key), 'whatsapp', now() + make_interval(secs => v_ttl_seconds))
  on conflict (event_key) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted = 1;
end;
$$;

revoke all on function public.reserve_whatsapp_event(text, integer) from public;
revoke all on function public.reserve_whatsapp_event(text, integer) from anon;
revoke all on function public.reserve_whatsapp_event(text, integer) from authenticated;
grant execute on function public.reserve_whatsapp_event(text, integer) to service_role;