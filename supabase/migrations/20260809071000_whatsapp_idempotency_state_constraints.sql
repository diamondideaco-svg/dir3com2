alter table public.webhook_idempotency_events
  alter column status set not null;

alter table public.webhook_idempotency_events
  drop constraint if exists webhook_idempotency_events_status_check;

alter table public.webhook_idempotency_events
  add constraint webhook_idempotency_events_status_check
  check (status in (
    'processing',
    'send_started',
    'completed',
    'retryable_failed',
    'unknown_outcome',
    'permanent_failed'
  ));

alter table public.webhook_idempotency_events
  drop constraint if exists webhook_idempotency_events_attempt_count_check;

alter table public.webhook_idempotency_events
  add constraint webhook_idempotency_events_attempt_count_check
  check (attempt_count >= 1);
