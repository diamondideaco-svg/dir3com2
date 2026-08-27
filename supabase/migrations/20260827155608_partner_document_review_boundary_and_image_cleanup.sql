begin;

-- Remediate targets where the earlier migration was already applied.
drop policy if exists partner_documents_owner_update on public.partner_documents;
drop policy if exists partner_documents_owner_delete on public.partner_documents;
revoke update, delete on table public.partner_documents from authenticated;

revoke all on table public.partners, public.partner_documents from anon, authenticated;
grant select on table public.partner_documents to authenticated;
grant all on table public.partners, public.partner_documents to service_role;

do $grants$
begin
  if to_regclass('public.partner_users') is not null then
    execute 'revoke all on table public.partner_users from anon, authenticated';
    execute 'grant select on table public.partner_users to authenticated';
    execute 'grant all on table public.partner_users to service_role';
  end if;
  if to_regclass('public.partner_services') is not null then
    execute 'revoke all on table public.partner_services from anon, authenticated';
    execute 'grant all on table public.partner_services to service_role';
  end if;
  if to_regclass('public.partner_coverage') is not null then
    execute 'revoke all on table public.partner_coverage from anon, authenticated';
    execute 'grant all on table public.partner_coverage to service_role';
  end if;
end
$grants$;

create table if not exists public.partner_image_cleanup_queue (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.partners(id) on delete cascade,
  product_image_id uuid not null,
  bucket text not null,
  storage_path text not null,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  unique (bucket, storage_path)
);

create index if not exists idx_partner_image_cleanup_owner
  on public.partner_image_cleanup_queue(owner_id);

alter table public.partner_image_cleanup_queue enable row level security;
revoke all on table public.partner_image_cleanup_queue from anon, authenticated;
grant all on table public.partner_image_cleanup_queue to service_role;

commit;
