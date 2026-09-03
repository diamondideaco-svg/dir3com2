-- DIR3COM Partner Request Handoff
-- Service-role-only atomic command invoked after authenticated partner ownership checks.

create or replace function public.start_partner_marketplace_request_handoff(
  p_actor_user_id uuid,
  p_request_id uuid,
  p_handoff_reference text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_role text;
  v_profile_status text;
  v_status text;
  v_product_id uuid;
  v_owned boolean;
begin
  select role, status into v_profile_role, v_profile_status
  from public.profiles
  where id = p_actor_user_id and deleted_at is null;

  if v_profile_role <> 'partner' or v_profile_status <> 'active' then
    raise exception 'PARTNER_HANDOFF_ACTOR_DENIED';
  end if;

  select status, product_id into v_status, v_product_id
  from public.marketplace_requests
  where id = p_request_id
  for update;

  if v_status is null then raise exception 'REQUEST_NOT_FOUND'; end if;

  select exists (
    select 1
    from public.product_availability pa
    where pa.product_id = v_product_id
      and pa.partner_id = p_actor_user_id
  ) into v_owned;

  if not v_owned then raise exception 'REQUEST_PARTNER_SCOPE_DENIED'; end if;

  update public.marketplace_requests
  set handoff_type = 'whatsapp',
      fulfilment_method = 'whatsapp_handoff',
      handoff_reference = nullif(btrim(coalesce(p_handoff_reference,'')), ''),
      handoff_started_at = coalesce(handoff_started_at, now()),
      next_action = 'await_partner_response',
      updated_at = now()
  where id = p_request_id;

  insert into public.marketplace_request_audit_logs(
    request_id, actor_user_id, actor_identity, actor_role, actor_source,
    previous_status, new_status, event_type, metadata
  ) values (
    p_request_id,
    null,
    'partner:' || p_actor_user_id::text,
    'service_role',
    'system_service',
    v_status,
    v_status,
    'request_status_updated',
    jsonb_build_object(
      'operation', 'whatsapp_handoff_started',
      'initiated_by_partner_user_id', p_actor_user_id,
      'handoff_reference', nullif(btrim(coalesce(p_handoff_reference,'')), ''),
      'product_id', v_product_id
    )
  );
end;
$$;

revoke all on function public.start_partner_marketplace_request_handoff(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.start_partner_marketplace_request_handoff(uuid,uuid,text) to service_role;
