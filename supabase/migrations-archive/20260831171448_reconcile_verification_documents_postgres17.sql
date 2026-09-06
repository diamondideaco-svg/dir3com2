begin;

-- DIR-120/Customer Hub follow-up: reconcile only the verification tables used by
-- the current application. Historical engine migrations stay immutable.

create or replace function pg_temp.assert_verification_columns(
  target_table regclass,
  expected_columns jsonb
)
returns void
language plpgsql
as $$
declare
  expected jsonb;
  actual_type text;
  actual_not_null boolean;
  actual_default text;
begin
  for expected in select value from jsonb_array_elements(expected_columns)
  loop
    select
      format_type(attribute.atttypid, attribute.atttypmod),
      attribute.attnotnull,
      pg_get_expr(attribute_default.adbin, attribute_default.adrelid)
      into actual_type, actual_not_null, actual_default
    from pg_attribute attribute
    left join pg_attrdef attribute_default
      on attribute_default.adrelid = attribute.attrelid
     and attribute_default.adnum = attribute.attnum
    where attribute.attrelid = target_table
      and attribute.attname = expected->>'name'
      and attribute.attnum > 0
      and not attribute.attisdropped;

    if not found then
      raise exception 'verification reconciliation refused: %.% is missing required column %',
        target_table::text,
        '',
        expected->>'name';
    end if;

    if actual_type <> expected->>'type'
      or actual_not_null <> (expected->>'not_null')::boolean
    then
      raise exception 'verification reconciliation refused: %.% has incompatible shape (expected % %, found % %)',
        target_table::text,
        expected->>'name',
        expected->>'type',
        case when (expected->>'not_null')::boolean then 'not null' else 'nullable' end,
        actual_type,
        case when actual_not_null then 'not null' else 'nullable' end;
    end if;

    if expected ? 'default_contains'
      and (
        actual_default is null
        or position(lower(expected->>'default_contains') in lower(actual_default)) = 0
      )
    then
      raise exception 'verification reconciliation refused: %.% has incompatible default (expected %, found %)',
        target_table::text,
        expected->>'name',
        expected->>'default_contains',
        coalesce(actual_default, 'none');
    end if;
  end loop;
end;
$$;

do $$
begin
  if to_regclass('public.profiles') is null then
    raise exception 'verification reconciliation refused: public.profiles is required';
  end if;

  perform pg_temp.assert_verification_columns(
    'public.profiles'::regclass,
    '[
      {"name":"id","type":"uuid","not_null":true},
      {"name":"role","type":"text","not_null":true},
      {"name":"status","type":"text","not_null":true},
      {"name":"deleted_at","type":"timestamp with time zone","not_null":false}
    ]'::jsonb
  );

  if to_regclass('public.verification_requests') is not null then
    perform pg_temp.assert_verification_columns(
      'public.verification_requests'::regclass,
      '[
        {"name":"id","type":"uuid","not_null":true,"default_contains":"gen_random_uuid"},
        {"name":"request_type","type":"text","not_null":true},
        {"name":"owner_type","type":"text","not_null":true},
        {"name":"owner_id","type":"text","not_null":true},
        {"name":"status","type":"text","not_null":true,"default_contains":"Pending"},
        {"name":"score","type":"integer","not_null":false,"default_contains":"0"},
        {"name":"verification_level","type":"text","not_null":false,"default_contains":"basic"},
        {"name":"notes","type":"text","not_null":false},
        {"name":"created_at","type":"timestamp with time zone","not_null":true,"default_contains":"now()"},
        {"name":"updated_at","type":"timestamp with time zone","not_null":true,"default_contains":"now()"}
      ]'::jsonb
    );
  end if;

  if to_regclass('public.verification_documents') is not null then
    perform pg_temp.assert_verification_columns(
      'public.verification_documents'::regclass,
      '[
        {"name":"id","type":"uuid","not_null":true,"default_contains":"gen_random_uuid"},
        {"name":"verification_request_id","type":"uuid","not_null":false},
        {"name":"document_type","type":"text","not_null":true},
        {"name":"owner_type","type":"text","not_null":true},
        {"name":"owner_id","type":"text","not_null":true},
        {"name":"file_url","type":"text","not_null":false},
        {"name":"issue_date","type":"date","not_null":false},
        {"name":"expiry_date","type":"date","not_null":false},
        {"name":"verification_status","type":"text","not_null":true,"default_contains":"Pending"},
        {"name":"verified_by","type":"text","not_null":false},
        {"name":"review_notes","type":"text","not_null":false},
        {"name":"created_at","type":"timestamp with time zone","not_null":true,"default_contains":"now()"},
        {"name":"updated_at","type":"timestamp with time zone","not_null":true,"default_contains":"now()"}
      ]'::jsonb
    );
  end if;

  if to_regclass('public.verification_reviews') is not null then
    perform pg_temp.assert_verification_columns(
      'public.verification_reviews'::regclass,
      '[
        {"name":"id","type":"uuid","not_null":true,"default_contains":"gen_random_uuid"},
        {"name":"verification_request_id","type":"uuid","not_null":false},
        {"name":"reviewer_id","type":"text","not_null":false},
        {"name":"decision","type":"text","not_null":true},
        {"name":"notes","type":"text","not_null":false},
        {"name":"created_at","type":"timestamp with time zone","not_null":true,"default_contains":"now()"}
      ]'::jsonb
    );
  end if;

  if to_regclass('public.verification_status_history') is not null then
    perform pg_temp.assert_verification_columns(
      'public.verification_status_history'::regclass,
      '[
        {"name":"id","type":"uuid","not_null":true,"default_contains":"gen_random_uuid"},
        {"name":"verification_request_id","type":"uuid","not_null":false},
        {"name":"status","type":"text","not_null":true},
        {"name":"changed_by","type":"text","not_null":false},
        {"name":"notes","type":"text","not_null":false},
        {"name":"created_at","type":"timestamp with time zone","not_null":true,"default_contains":"now()"}
      ]'::jsonb
    );
  end if;
end;
$$;

create table if not exists public.verification_requests (
  id uuid primary key default gen_random_uuid(),
  request_type text not null,
  owner_type text not null,
  owner_id text not null,
  status text not null default 'Pending'
    constraint verification_requests_status_check
    check (status in ('Pending', 'Under Review', 'Approved', 'Rejected', 'Expired', 'Suspended')),
  score integer default 0,
  verification_level text default 'basic',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.verification_documents (
  id uuid primary key default gen_random_uuid(),
  verification_request_id uuid references public.verification_requests(id) on delete cascade,
  document_type text not null,
  owner_type text not null,
  owner_id text not null,
  file_url text,
  issue_date date,
  expiry_date date,
  verification_status text not null default 'Pending'
    constraint verification_documents_verification_status_check
    check (verification_status in ('Pending', 'Under Review', 'Approved', 'Rejected', 'Expired', 'Suspended')),
  verified_by text,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.verification_reviews (
  id uuid primary key default gen_random_uuid(),
  verification_request_id uuid references public.verification_requests(id) on delete cascade,
  reviewer_id text,
  decision text not null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.verification_status_history (
  id uuid primary key default gen_random_uuid(),
  verification_request_id uuid references public.verification_requests(id) on delete cascade,
  status text not null,
  changed_by text,
  notes text,
  created_at timestamptz not null default now()
);

-- Validate newly created and pre-existing relations before any grants or policy changes.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'verification_requests',
    'verification_documents',
    'verification_reviews',
    'verification_status_history'
  ]
  loop
    if not exists (
      select 1
      from pg_constraint constraint_row
      join pg_attribute attribute
        on attribute.attrelid = constraint_row.conrelid
       and attribute.attnum = any (constraint_row.conkey)
      where constraint_row.conrelid = format('public.%I', table_name)::regclass
        and constraint_row.contype = 'p'
        and constraint_row.conkey = array[attribute.attnum]::smallint[]
        and attribute.attname = 'id'
    ) then
      raise exception 'verification reconciliation refused: public.% requires an id primary key', table_name;
    end if;
  end loop;

  if not exists (
    select 1
    from pg_constraint constraint_row
    join pg_attribute attribute
      on attribute.attrelid = constraint_row.conrelid
     and attribute.attnum = any (constraint_row.conkey)
    where constraint_row.conrelid = 'public.verification_documents'::regclass
      and constraint_row.contype = 'f'
      and constraint_row.confrelid = 'public.verification_requests'::regclass
      and constraint_row.confdeltype = 'c'
      and attribute.attname = 'verification_request_id'
  ) then
    raise exception 'verification reconciliation refused: verification_documents requires the canonical request foreign key';
  end if;

  foreach table_name in array array['verification_reviews', 'verification_status_history']
  loop
    if not exists (
      select 1
      from pg_constraint constraint_row
      join pg_attribute attribute
        on attribute.attrelid = constraint_row.conrelid
       and attribute.attnum = any (constraint_row.conkey)
      where constraint_row.conrelid = format('public.%I', table_name)::regclass
        and constraint_row.contype = 'f'
        and constraint_row.confrelid = 'public.verification_requests'::regclass
        and constraint_row.confdeltype = 'c'
        and attribute.attname = 'verification_request_id'
    ) then
      raise exception 'verification reconciliation refused: public.% requires the canonical request foreign key', table_name;
    end if;
  end loop;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.verification_requests'::regclass
      and conname = 'verification_requests_status_check'
      and contype = 'c'
      and pg_get_constraintdef(oid) = 'CHECK ((status = ANY (ARRAY[''Pending''::text, ''Under Review''::text, ''Approved''::text, ''Rejected''::text, ''Expired''::text, ''Suspended''::text])))'
  ) then
    raise exception 'verification reconciliation refused: verification_requests status contract is incompatible';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.verification_documents'::regclass
      and conname = 'verification_documents_verification_status_check'
      and contype = 'c'
      and pg_get_constraintdef(oid) = 'CHECK ((verification_status = ANY (ARRAY[''Pending''::text, ''Under Review''::text, ''Approved''::text, ''Rejected''::text, ''Expired''::text, ''Suspended''::text])))'
  ) then
    raise exception 'verification reconciliation refused: verification_documents status contract is incompatible';
  end if;
end;
$$;

create index if not exists idx_verification_requests_owner
  on public.verification_requests(owner_type, owner_id);
create index if not exists idx_verification_documents_owner
  on public.verification_documents(owner_type, owner_id);
create index if not exists idx_verification_documents_request
  on public.verification_documents(verification_request_id);
create index if not exists idx_verification_reviews_request
  on public.verification_reviews(verification_request_id);
create index if not exists idx_verification_status_history_request
  on public.verification_status_history(verification_request_id);

do $$
begin
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'verification_requests',
        'verification_documents',
        'verification_reviews',
        'verification_status_history'
      )
      and policyname not in (
        'admin_full_access',
        'service_role_full_access',
        'customer_read_own_verification_requests',
        'customer_read_own_verification_documents',
        'verification_requests_customer_select_own',
        'verification_requests_admin_all',
        'verification_documents_customer_select_own',
        'verification_documents_admin_all',
        'verification_reviews_admin_all',
        'verification_status_history_admin_all'
      )
  ) then
    raise exception 'verification reconciliation refused: unexpected verification RLS policy exists';
  end if;
end;
$$;

alter table public.verification_requests enable row level security;
alter table public.verification_documents enable row level security;
alter table public.verification_reviews enable row level security;
alter table public.verification_status_history enable row level security;

revoke all on table public.verification_requests from public, anon, authenticated, service_role;
revoke all on table public.verification_documents from public, anon, authenticated, service_role;
revoke all on table public.verification_reviews from public, anon, authenticated, service_role;
revoke all on table public.verification_status_history from public, anon, authenticated, service_role;

grant select, insert, update, delete on table public.verification_requests to authenticated;
grant select, insert, update, delete on table public.verification_documents to authenticated;
grant select, insert on table public.verification_reviews to authenticated;
grant select, insert on table public.verification_status_history to authenticated;

grant select, insert, update, delete on table public.verification_requests to service_role;
grant select, insert, update, delete on table public.verification_documents to service_role;
grant select, insert, update, delete on table public.verification_reviews to service_role;
grant select, insert, update, delete on table public.verification_status_history to service_role;

drop policy if exists admin_full_access on public.verification_requests;
drop policy if exists service_role_full_access on public.verification_requests;
drop policy if exists customer_read_own_verification_requests on public.verification_requests;
drop policy if exists verification_requests_customer_select_own on public.verification_requests;
drop policy if exists verification_requests_admin_all on public.verification_requests;

drop policy if exists admin_full_access on public.verification_documents;
drop policy if exists service_role_full_access on public.verification_documents;
drop policy if exists customer_read_own_verification_documents on public.verification_documents;
drop policy if exists verification_documents_customer_select_own on public.verification_documents;
drop policy if exists verification_documents_admin_all on public.verification_documents;

drop policy if exists admin_full_access on public.verification_reviews;
drop policy if exists service_role_full_access on public.verification_reviews;
drop policy if exists verification_reviews_admin_all on public.verification_reviews;

drop policy if exists admin_full_access on public.verification_status_history;
drop policy if exists service_role_full_access on public.verification_status_history;
drop policy if exists verification_status_history_admin_all on public.verification_status_history;

create policy verification_requests_customer_select_own
  on public.verification_requests
  for select
  to authenticated
  using (
    owner_type = 'customer'
    and owner_id = (select auth.uid())::text
  );

create policy verification_documents_customer_select_own
  on public.verification_documents
  for select
  to authenticated
  using (
    owner_type = 'customer'
    and owner_id = (select auth.uid())::text
  );

create policy verification_requests_admin_all
  on public.verification_requests
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles profile
      where profile.id = (select auth.uid())
        and lower(profile.role) = 'admin'
        and profile.status = 'active'
        and profile.deleted_at is null
    )
  )
  with check (
    exists (
      select 1
      from public.profiles profile
      where profile.id = (select auth.uid())
        and lower(profile.role) = 'admin'
        and profile.status = 'active'
        and profile.deleted_at is null
    )
  );

create policy verification_documents_admin_all
  on public.verification_documents
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles profile
      where profile.id = (select auth.uid())
        and lower(profile.role) = 'admin'
        and profile.status = 'active'
        and profile.deleted_at is null
    )
  )
  with check (
    exists (
      select 1
      from public.profiles profile
      where profile.id = (select auth.uid())
        and lower(profile.role) = 'admin'
        and profile.status = 'active'
        and profile.deleted_at is null
    )
  );

create policy verification_reviews_admin_all
  on public.verification_reviews
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles profile
      where profile.id = (select auth.uid())
        and lower(profile.role) = 'admin'
        and profile.status = 'active'
        and profile.deleted_at is null
    )
  )
  with check (
    exists (
      select 1
      from public.profiles profile
      where profile.id = (select auth.uid())
        and lower(profile.role) = 'admin'
        and profile.status = 'active'
        and profile.deleted_at is null
    )
  );

create policy verification_status_history_admin_all
  on public.verification_status_history
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles profile
      where profile.id = (select auth.uid())
        and lower(profile.role) = 'admin'
        and profile.status = 'active'
        and profile.deleted_at is null
    )
  )
  with check (
    exists (
      select 1
      from public.profiles profile
      where profile.id = (select auth.uid())
        and lower(profile.role) = 'admin'
        and profile.status = 'active'
        and profile.deleted_at is null
    )
  );

commit;
