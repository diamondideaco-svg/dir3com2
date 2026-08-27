begin;

do $grants$
begin
  if to_regclass('public.partner_users') is not null then
    execute 'revoke all on table public.partner_users from anon, authenticated';
    execute 'grant all on table public.partner_users to service_role';
  end if;
end
$grants$;

commit;
