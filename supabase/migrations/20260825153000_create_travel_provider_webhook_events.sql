create table if not exists public.travel_provider_webhook_events (
  id bigint generated always as identity primary key,
  provider text not null,
  event_id text not null,
  event_type text not null,
  received_at timestamptz not null default now(),
  constraint travel_provider_webhook_events_provider_event_unique unique (provider, event_id)
);

alter table public.travel_provider_webhook_events enable row level security;
revoke all on table public.travel_provider_webhook_events from anon, authenticated;
grant select, insert on table public.travel_provider_webhook_events to service_role;
