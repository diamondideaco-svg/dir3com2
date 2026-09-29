-- Task #174: server-mediated inbox. No public table reads or RPC execution.
begin;
create table public.contact_enquiries (
  id uuid primary key default gen_random_uuid(),
  request_key uuid not null unique,
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  sender_hash text not null check (sender_hash ~ '^[a-f0-9]{64}$'),
  name text not null check (length(name) between 1 and 120),
  email text not null check (length(email) between 3 and 254),
  phone text not null default '' check (length(phone) <= 32),
  subject text not null check (subject in ('booking','service','partnership','other')),
  message text not null check (length(message) between 1 and 2000),
  country text not null check (country in ('EG','SA','AE','OTHER')),
  status text not null default 'received' check (status in ('received','in_progress','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index contact_enquiries_country_created on public.contact_enquiries(country, created_at desc);
create index contact_enquiries_created on public.contact_enquiries(created_at desc);
create index contact_enquiries_sender_created on public.contact_enquiries(sender_hash, created_at desc);
create table public.contact_enquiry_events (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null references public.contact_enquiries(id),
  actor_id uuid,
  status text not null check (status in ('received','in_progress','closed')),
  internal_note text not null default '' check (length(internal_note) <= 2000),
  created_at timestamptz not null default now()
);
create index contact_enquiry_events_parent on public.contact_enquiry_events(enquiry_id, created_at);
alter table public.contact_enquiries enable row level security;
alter table public.contact_enquiry_events enable row level security;
revoke all on public.contact_enquiries, public.contact_enquiry_events from public, anon, authenticated;
grant select, insert, update on public.contact_enquiries to service_role;
grant select, insert on public.contact_enquiry_events to service_role;

create function public.receive_contact_enquiry(p_key uuid, p_fingerprint text, p_sender_hash text, p_input jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare existing public.contact_enquiries; new_id uuid;
begin
  -- One database-wide lock bounds aggregate public intake across all instances.
  perform pg_catalog.pg_advisory_xact_lock(174, 1);
  select * into existing from public.contact_enquiries where request_key = p_key;
  if found then
    if existing.fingerprint <> p_fingerprint then return jsonb_build_object('kind','conflict'); end if;
    return jsonb_build_object('kind','saved','reference',existing.id,'replay',true);
  end if;
  if (select count(*) from public.contact_enquiries where created_at > now() - interval '1 hour') >= 100
     or (select count(*) from public.contact_enquiries where sender_hash = p_sender_hash and created_at > now() - interval '1 hour') >= 3 then
    return jsonb_build_object('kind','limited');
  end if;
  insert into public.contact_enquiries(request_key,fingerprint,sender_hash,name,email,phone,subject,message,country)
  values(p_key,p_fingerprint,p_sender_hash,p_input->>'name',p_input->>'email',coalesce(p_input->>'phone',''),p_input->>'subject',p_input->>'message',p_input->>'country') returning id into new_id;
  insert into public.contact_enquiry_events(enquiry_id,status) values(new_id,'received');
  return jsonb_build_object('kind','saved','reference',new_id,'replay',false);
end $$;
revoke all on function public.receive_contact_enquiry(uuid,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.receive_contact_enquiry(uuid,text,text,jsonb) to service_role;

-- Only the authenticated, freshly authorized server action may pass actor/scope.
create function public.progress_contact_enquiry(p_id uuid, p_actor uuid, p_countries text[], p_expected text, p_status text, p_note text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare item public.contact_enquiries;
begin
  if p_actor is null or p_expected is null or p_status is null or p_note is null or length(p_note) > 2000 then raise exception 'CONTACT_INVALID'; end if;
  select * into item from public.contact_enquiries where id = p_id and (p_countries is null or country = any(p_countries)) for update;
  if not found then raise exception 'CONTACT_UNAVAILABLE'; end if;
  -- Retry is a no-op, not another audit event or outbound delivery.
  if item.status = p_status then return false; end if;
  if item.status <> p_expected then raise exception 'CONTACT_STALE'; end if;
  if not ((item.status = 'received' and p_status = 'in_progress') or (item.status = 'in_progress' and p_status = 'closed')) then raise exception 'CONTACT_TRANSITION'; end if;
  update public.contact_enquiries set status = p_status, updated_at = now() where id = p_id;
  insert into public.contact_enquiry_events(enquiry_id,actor_id,status,internal_note) values(p_id,p_actor,p_status,p_note);
  return true;
end $$;
revoke all on function public.progress_contact_enquiry(uuid,uuid,text[],text,text,text) from public, anon, authenticated;
grant execute on function public.progress_contact_enquiry(uuid,uuid,text[],text,text,text) to service_role;
commit;
