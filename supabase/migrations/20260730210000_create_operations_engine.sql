create extension if not exists pgcrypto;

create table if not exists notification_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  channel text not null,
  subject_template text,
  body_template text not null,
  is_active boolean not null default true,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references notification_templates(id) on delete set null,
  recipient_type text not null default 'customer',
  recipient_id uuid,
  channel text not null,
  subject text,
  body text not null,
  status text not null default 'Pending' check (status in ('Pending','Queued','Sent','Delivered','Failed','Cancelled')),
  provider text not null default 'internal',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists notification_logs (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid references notifications(id) on delete cascade,
  provider text not null,
  status text not null default 'Queued' check (status in ('Pending','Queued','Sent','Delivered','Failed','Cancelled')),
  response text,
  created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id text not null,
  action text not null,
  old_values jsonb default '{}'::jsonb,
  new_values jsonb default '{}'::jsonb,
  performed_by text,
  timestamp timestamptz not null default now(),
  ip_address text
);

create table if not exists activity_timeline (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id text not null,
  event_type text not null,
  summary text,
  metadata jsonb default '{}'::jsonb,
  performed_by text,
  created_at timestamptz not null default now()
);

create table if not exists system_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  entity_type text,
  entity_id text,
  payload jsonb default '{}'::jsonb,
  source text,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_status on notifications(status);
create index if not exists idx_notification_logs_notification_id on notification_logs(notification_id);
create index if not exists idx_audit_logs_entity on audit_logs(entity_type, entity_id);
create index if not exists idx_activity_timeline_entity on activity_timeline(entity_type, entity_id);
create index if not exists idx_system_events_name on system_events(event_name);
