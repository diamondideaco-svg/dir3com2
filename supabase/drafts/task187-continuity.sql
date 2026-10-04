-- Task187 additive migration candidate. Not registered/applied to Production.
-- Configuration defaults disabled. Retention values are review proposals.
begin;
create table public.dabra_continuity_policy (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false,
 preferences_days integer not null default 180 check(preferences_days between 1 and 3650),
 trip_after_end_days integer not null default 30 check(trip_after_end_days between 1 and 365),
 undated_trip_days integer not null default 180 check(undated_trip_days between 1 and 3650),
 purge_target_hours integer not null default 24 check(purge_target_hours between 1 and 168)
);
insert into public.dabra_continuity_policy(singleton) values(true);
alter table public.dabra_continuity_policy enable row level security;
revoke all on public.dabra_continuity_policy from public,anon,authenticated;
create table public.dabra_account_continuity (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 revision bigint not null default 0 check(revision>=0),
 generation bigint not null default 0 check(generation>=0),
 consent_enabled boolean not null default false,
 consent_version text,
 confirmed_at timestamptz,
 preferences jsonb,
 preferences_expires_at timestamptz,
 trip jsonb,
 trip_expires_at timestamptz,
 updated_at timestamptz not null default now(),
 check((preferences is null)=(preferences_expires_at is null)),
 check((trip is null)=(trip_expires_at is null)),
 check(consent_enabled or (preferences is null and trip is null))
);
create table public.dabra_continuity_receipts (
 owner_id uuid not null references auth.users(id) on delete cascade,
 mutation_id uuid not null,
 generation bigint not null,
 request_hash text not null,
 result_revision bigint not null,
 created_at timestamptz not null default now(),
 primary key(owner_id,mutation_id)
);
alter table public.dabra_account_continuity enable row level security;
alter table public.dabra_continuity_receipts enable row level security;
revoke all on public.dabra_account_continuity,public.dabra_continuity_receipts from public,anon,authenticated;
-- Only the expiry-filtered RPC exposes content. Direct SELECT would reveal
-- expired payloads before maintenance physically clears them.
create policy dabra_continuity_owner_read on public.dabra_account_continuity for select to authenticated
using(owner_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and lower(p.role) in ('customer','client') and p.status='active' and p.deleted_at is null));

create function public.dabra_continuity_actor() returns uuid
language plpgsql security definer set search_path=pg_catalog as $$
declare actor uuid:=auth.uid();
begin
 if actor is null or not exists(select 1 from public.profiles p where p.id=actor and lower(p.role) in('customer','client') and p.status='active' and p.deleted_at is null)
 then raise exception 'CONTINUITY_AUTH_DENIED' using errcode='42501'; end if;
 if not exists(select 1 from public.dabra_continuity_policy where singleton and enabled)
 then raise exception 'CONTINUITY_DISABLED' using errcode='55000'; end if;
 return actor;
end $$;
revoke all on function public.dabra_continuity_actor() from public,anon,authenticated;

create function public.dabra_continuity_preferences_valid(p jsonb) returns boolean
language plpgsql immutable set search_path=pg_catalog as $$
begin
 return coalesce(jsonb_typeof(p)='object' and (select count(*) from jsonb_object_keys(p))=5
 and p ?& array['replyLanguage','displayCurrency','travelClass','lodgingStyle','itineraryPace']
 and p->>'replyLanguage' in('ar','en')
 and p->>'displayCurrency' in('SAR','EGP','USD','EUR','AED')
 and p->>'travelClass' in('economy','premium_economy','business','first')
 and p->>'lodgingStyle' in('hotel','apartment','resort','boutique')
 and p->>'itineraryPace' in('relaxed','balanced','active'),false);
exception when others then return false;
end $$;
-- Same explicit character ranges as CONTINUITY_PLACE_PATTERN. Collation C
-- avoids locale-dependent alphabetic classes; supported labels are AR/EN with
-- common Latin accents. Raw notes, identifiers, URLs and surrounding spaces fail.
create function public.dabra_continuity_place_valid(p text) returns boolean
language sql immutable set search_path=pg_catalog as $$
 select coalesce(length(p) between 1 and 80 and p=btrim(p)
 and (p collate "C") ~ U&'^[A-Za-zÀ-ÖØ-öø-ſء-غف-يٱ-ۓ][A-Za-zÀ-ÖØ-öø-ſء-غف-يٱ-ۓ\0300-\036f\064b-\065f\0670\06d6-\06dc\06df-\06e4\06e7-\06e8\06ea-\06ed0-9٠-٩۰-۹ .,''()-]*$',false)
$$;
revoke all on function public.dabra_continuity_place_valid(text) from public,anon,authenticated;
create function public.dabra_continuity_trip_valid(p jsonb) returns boolean
language plpgsql immutable set search_path=pg_catalog as $$
declare start_day date;end_day date;f text; seen text[]:='{}';
begin
 if jsonb_typeof(p)<>'object' or (select count(*) from jsonb_object_keys(p))<>11
 or not(p ?& array['id','origin','destination','startDate','endDate','adults','children','rooms','budget','currency','families'])
 or jsonb_typeof(p->'id')<>'string' or (p->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 or jsonb_typeof(p->'destination')<>'string' or not public.dabra_continuity_place_valid(p->>'destination')
 then return false;end if;
 if p->'origin'<>'null'::jsonb and (jsonb_typeof(p->'origin')<>'string' or not public.dabra_continuity_place_valid(p->>'origin')) then return false;end if;
 if (p->'startDate'='null'::jsonb)<>(p->'endDate'='null'::jsonb) then return false;end if;
 if p->'startDate'<>'null'::jsonb then
  if jsonb_typeof(p->'startDate')<>'string' or jsonb_typeof(p->'endDate')<>'string' or (p->>'startDate') !~ '^\d{4}-\d{2}-\d{2}$' or (p->>'endDate') !~ '^\d{4}-\d{2}-\d{2}$' then return false;end if;
  start_day:=(p->>'startDate')::date;end_day:=(p->>'endDate')::date;
  if start_day>end_day then return false;end if;
 end if;
 if jsonb_typeof(p->'adults')<>'number' or jsonb_typeof(p->'children')<>'number' or jsonb_typeof(p->'rooms')<>'number'
 or (p->>'adults')::numeric<>trunc((p->>'adults')::numeric) or (p->>'children')::numeric<>trunc((p->>'children')::numeric) or (p->>'rooms')::numeric<>trunc((p->>'rooms')::numeric)
 or (p->>'adults')::numeric not between 1 and 20 or (p->>'children')::numeric not between 0 and 19
 or (p->>'adults')::numeric+(p->>'children')::numeric>20 or (p->>'rooms')::numeric not between 1 and 8
 or (p->'budget'<>'null'::jsonb and (jsonb_typeof(p->'budget')<>'number' or (p->>'budget')::numeric<=0 or (p->>'budget')::numeric>1000000000))
 or jsonb_typeof(p->'currency')<>'string' or p->>'currency' not in('SAR','EGP','USD','EUR','AED') or jsonb_typeof(p->'families')<>'array'
 or jsonb_array_length(p->'families') not between 1 and 5 then return false;end if;
 for f in select jsonb_array_elements_text(p->'families') loop
  if f is null or f not in('drive','stay','fly','concierge','vip') or f=any(seen) then return false;end if; seen:=array_append(seen,f);
 end loop;
 return true;
exception when others then return false;
end $$;
revoke all on function public.dabra_continuity_preferences_valid(jsonb),public.dabra_continuity_trip_valid(jsonb) from public,anon,authenticated;

create function public.dabra_continuity_snapshot(r public.dabra_account_continuity) returns jsonb
language sql stable set search_path=pg_catalog as $$
 select jsonb_build_object('revision',coalesce(r.revision,0),'generation',coalesce(r.generation,0),
 'consentEnabled',coalesce(r.consent_enabled,false),'consentVersion',r.consent_version,
 'preferences',case when r.consent_enabled and r.preferences_expires_at>now() then r.preferences else null end,
 'preferencesExpiresAt',case when r.preferences_expires_at>now() then r.preferences_expires_at else null end,
 'trip',case when r.consent_enabled and r.trip_expires_at>now() then r.trip else null end,
 'tripExpiresAt',case when r.trip_expires_at>now() then r.trip_expires_at else null end,
 'updatedAt',r.updated_at)
$$;
revoke all on function public.dabra_continuity_snapshot(public.dabra_account_continuity) from public,anon,authenticated;
create function public.dabra_continuity_read() returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare actor uuid:=public.dabra_continuity_actor();r public.dabra_account_continuity;
begin select * into r from public.dabra_account_continuity where owner_id=actor;
 return public.dabra_continuity_snapshot(r);
end $$;

create function public.dabra_continuity_mutate(p_action text,p_revision bigint,p_generation bigint,p_mutation uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare actor uuid:=public.dabra_continuity_actor(); r public.dabra_account_continuity;
 receipt public.dabra_continuity_receipts; policy public.dabra_continuity_policy;
 fingerprint text; expiry timestamptz; new_trip jsonb;
begin
 if p_action is null or p_action not in('save','clear_preferences','delete_trip','revoke') or p_revision is null or p_revision<0 or p_generation is null or p_generation<0 or p_mutation is null or p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>4096
 then raise exception 'CONTINUITY_INVALID' using errcode='22023';end if;
 fingerprint:=encode(sha256(convert_to(jsonb_build_object('action',p_action,'revision',p_revision,'generation',p_generation,'payload',p_payload)::text,'UTF8')),'hex');
 insert into public.dabra_account_continuity(owner_id) values(actor) on conflict do nothing;
 select * into r from public.dabra_account_continuity where owner_id=actor for update;
 -- Receipt replay returns current owner state, never an old content snapshot.
 select * into receipt from public.dabra_continuity_receipts where owner_id=actor and mutation_id=p_mutation;
 if found then
  if receipt.request_hash<>fingerprint or receipt.generation<>r.generation then raise exception 'CONTINUITY_CONFLICT' using errcode='40001';end if;
  return public.dabra_continuity_snapshot(r)||jsonb_build_object('replayed',true);
 end if;
 if r.revision<>p_revision or r.generation<>p_generation then raise exception 'CONTINUITY_CONFLICT' using errcode='40001';end if;
 select * into policy from public.dabra_continuity_policy where singleton;
 -- Expired content is cleared by writes and the separately operated purge.
 if r.preferences_expires_at<=now() then r.preferences:=null;r.preferences_expires_at:=null;end if;
 if r.trip_expires_at<=now() then r.trip:=null;r.trip_expires_at:=null;end if;
 if p_action='save' then
  if not(p_payload ?& array['consent','preferences','trip']) or (select count(*) from jsonb_object_keys(p_payload))<>3
  or p_payload->'consent'<>'true'::jsonb
  or (p_payload->'preferences'<>'null'::jsonb and not public.dabra_continuity_preferences_valid(p_payload->'preferences'))
  or (p_payload->'trip'<>'null'::jsonb and not public.dabra_continuity_trip_valid(p_payload->'trip'))
  then raise exception 'CONTINUITY_INVALID' using errcode='22023';end if;
  r.consent_enabled:=true;r.consent_version:='task187-v1';r.confirmed_at:=now();
  r.preferences:=nullif(p_payload->'preferences','null'::jsonb);
  r.preferences_expires_at:=case when r.preferences is null then null else now()+make_interval(days=>policy.preferences_days) end;
  new_trip:=nullif(p_payload->'trip','null'::jsonb);
  -- An edit cannot replace the identity of an existing saved trip; delete explicitly first.
  if r.trip is not null and new_trip is not null and r.trip->>'id'<>new_trip->>'id' then raise exception 'CONTINUITY_CONFLICT' using errcode='40001';end if;
  r.trip:=new_trip;
  if r.trip is null then r.trip_expires_at:=null;
  elsif r.trip->'endDate'='null'::jsonb then r.trip_expires_at:=now()+make_interval(days=>policy.undated_trip_days);
  else r.trip_expires_at:=((r.trip->>'endDate')::date::timestamp at time zone 'UTC')+make_interval(days=>policy.trip_after_end_days);end if;
  if r.trip_expires_at<=now() then raise exception 'CONTINUITY_EXPIRED' using errcode='22023';end if;
 else
  if p_payload<>'{}'::jsonb then raise exception 'CONTINUITY_INVALID' using errcode='22023';end if;
  if p_action in('clear_preferences','revoke') then r.preferences:=null;r.preferences_expires_at:=null;end if;
  if p_action in('delete_trip','revoke') then r.trip:=null;r.trip_expires_at:=null;end if;
  if p_action='revoke' then r.consent_enabled:=false;r.consent_version:=null;r.confirmed_at:=null;r.generation:=r.generation+1;end if;
 end if;
 r.revision:=r.revision+1;r.updated_at:=now();
 update public.dabra_account_continuity set revision=r.revision,generation=r.generation,consent_enabled=r.consent_enabled,
 consent_version=r.consent_version,confirmed_at=r.confirmed_at,preferences=r.preferences,preferences_expires_at=r.preferences_expires_at,
 trip=r.trip,trip_expires_at=r.trip_expires_at,updated_at=r.updated_at where owner_id=actor;
 insert into public.dabra_continuity_receipts(owner_id,mutation_id,generation,request_hash,result_revision)
 values(actor,p_mutation,r.generation,fingerprint,r.revision);
 return public.dabra_continuity_snapshot(r)||jsonb_build_object('replayed',false);
end $$;

-- Privileged maintenance only. No scheduler is activated by this candidate.
create function public.dabra_continuity_purge() returns integer
language plpgsql security definer set search_path=pg_catalog as $$
declare touched integer;
begin
 update public.dabra_account_continuity set
 preferences=case when preferences_expires_at<=now() then null else preferences end,
 preferences_expires_at=case when preferences_expires_at<=now() then null else preferences_expires_at end,
 trip=case when trip_expires_at<=now() then null else trip end,
 trip_expires_at=case when trip_expires_at<=now() then null else trip_expires_at end,
 revision=revision+1,updated_at=now()
 where preferences_expires_at<=now() or trip_expires_at<=now();
 get diagnostics touched=row_count;
 delete from public.dabra_continuity_receipts where created_at<now()-interval '7 days';
 return touched;
end $$;
revoke all on function public.dabra_continuity_read(),public.dabra_continuity_mutate(text,bigint,bigint,uuid,jsonb),public.dabra_continuity_purge() from public,anon,authenticated;
grant execute on function public.dabra_continuity_read(),public.dabra_continuity_mutate(text,bigint,bigint,uuid,jsonb) to authenticated;
grant execute on function public.dabra_continuity_purge() to service_role;
commit;
