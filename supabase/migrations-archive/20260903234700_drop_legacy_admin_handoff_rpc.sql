-- DIR3COM corrective cleanup.
-- The admin handoff helper added in the immediately preceding lifecycle migration
-- attempted to reuse the canonical status-transition audit ledger for a non-status
-- event. That ledger intentionally rejects no-op status rows. The helper is unused
-- by the application, so remove it and keep handoff recording in the dedicated
-- append-only marketplace_request_handoff_events ledger.

drop function if exists public.start_marketplace_request_handoff(uuid,text,uuid,text);
