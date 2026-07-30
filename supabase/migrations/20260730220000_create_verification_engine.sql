create extension if not exists pgcrypto;

create table if not exists verification_requests (
  id uuid primary key default gen_random_uuid(),
  request_type text not null,
  owner_type text not null,
  owner_id text not null,
  status text not null default 'Pending' check (status in ('Pending','Under Review','Approved','Rejected','Expired','Suspended')),
  score integer default 0,
  verification_level text default 'basic',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists verification_documents (
  id uuid primary key default gen_random_uuid(),
  verification_request_id uuid references verification_requests(id) on delete cascade,
  document_type text not null,
  owner_type text not null,
  owner_id text not null,
  file_url text,
  issue_date date,
  expiry_date date,
  verification_status text not null default 'Pending' check (verification_status in ('Pending','Under Review','Approved','Rejected','Expired','Suspended')),
  verified_by text,
  review_notes text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists verification_reviews (
  id uuid primary key default gen_random_uuid(),
  verification_request_id uuid references verification_requests(id) on delete cascade,
  reviewer_id text,
  decision text not null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists verification_status_history (
  id uuid primary key default gen_random_uuid(),
  verification_request_id uuid references verification_requests(id) on delete cascade,
  status text not null,
  changed_by text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists identity_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null,
  owner_id text not null,
  full_name text,
  email text,
  phone text,
  national_id text,
  passport_number text,
  date_of_birth date,
  verification_status text not null default 'Pending' check (verification_status in ('Pending','Under Review','Approved','Rejected','Expired','Suspended')),
  verification_score integer default 0,
  verification_expiry date,
  verification_level text default 'basic',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists company_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null,
  company_name text not null,
  commercial_registration text,
  tax_number text,
  tourism_license text,
  insurance_reference text,
  verification_status text not null default 'Pending' check (verification_status in ('Pending','Under Review','Approved','Rejected','Expired','Suspended')),
  verification_score integer default 0,
  verification_expiry date,
  verification_level text default 'basic',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists document_templates (
  id uuid primary key default gen_random_uuid(),
  document_type text not null,
  title text not null,
  description text,
  required boolean not null default true,
  validity_days integer default 365,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists document_expiry_tracking (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references verification_documents(id) on delete cascade,
  expiry_date date not null,
  reminder_sent boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_verification_requests_owner on verification_requests(owner_type, owner_id);
create index if not exists idx_verification_documents_owner on verification_documents(owner_type, owner_id);
create index if not exists idx_identity_profiles_owner on identity_profiles(owner_type, owner_id);
create index if not exists idx_company_profiles_owner on company_profiles(owner_id);
