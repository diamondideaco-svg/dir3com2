begin;

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

commit;
