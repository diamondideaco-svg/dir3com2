begin;

revoke all on table public.partners, public.partner_users, public.partner_documents,
  public.partner_services, public.partner_coverage from anon, authenticated;
grant select on table public.partners, public.partner_users, public.partner_documents to authenticated;
grant all on table public.partners, public.partner_users, public.partner_documents,
  public.partner_services, public.partner_coverage to service_role;

commit;
