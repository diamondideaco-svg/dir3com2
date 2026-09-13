-- Server-only review transition. Serialize on the asset shared with upload
-- persistence so concurrent approvals cannot publish from stale snapshots.
create or replace function public.review_partner_portal_media(
  p_queue_id text, p_action text, p_actor_id uuid, p_reason text default ''
) returns jsonb
language plpgsql security invoker
set search_path = public, pg_temp
set statement_timeout = '10s'
as $$
declare
  q public.partner_portal_review_queue%rowtype;
  a public.partner_portal_assets%rowtype;
  m public.partner_portal_asset_media%rowtype;
  latest_catalog jsonb;
  reviewed jsonb;
  media_status text;
  queue_status text;
  ready boolean;
begin
  if p_action not in ('APPROVE','REJECT','REQUEST_REPLACEMENT') or p_actor_id is null then
    raise exception 'REVIEW_ACTION_INVALID';
  end if;
  select * into q from public.partner_portal_review_queue where id = p_queue_id;
  if not found then raise exception 'REVIEW_ITEM_NOT_FOUND'; end if;
  select * into a from public.partner_portal_assets where id = q.asset_id for update;
  if not found then raise exception 'REVIEW_ASSOCIATION_INVALID'; end if;
  -- Reload after obtaining the lock: another reviewer may have finished first.
  select * into q from public.partner_portal_review_queue where id = p_queue_id for update;
  if q.asset_id is distinct from a.id or q.owner_id is distinct from a.owner_id or q.owner_kind is distinct from a.owner_kind then
    raise exception 'REVIEW_ASSOCIATION_INVALID';
  end if;
  if q.record->>'status' is distinct from 'pending_review' or q.record->>'technicalValidationStatus' is distinct from 'pass' then
    raise exception 'REVIEW_ITEM_NOT_PENDING';
  end if;
  if q.media_id is null and q.id is distinct from (
    select id from public.partner_portal_review_queue where asset_id = a.id and media_id is null
    order by created_at desc, id desc limit 1
  ) then raise exception 'REVIEW_ITEM_NOT_PENDING'; end if;
  if q.media_id is not null then
    select * into m from public.partner_portal_asset_media where id = q.media_id for update;
    if not found then raise exception 'REVIEW_MEDIA_NOT_FOUND'; end if;
    if m.asset_id is distinct from a.id or m.owner_id is distinct from a.owner_id or m.owner_kind is distinct from a.owner_kind then
      raise exception 'REVIEW_ASSOCIATION_INVALID';
    end if;
    if m.record->>'status' is distinct from 'pending_review' then raise exception 'REVIEW_ITEM_NOT_PENDING'; end if;
  end if;
  queue_status := case p_action when 'APPROVE' then 'approved' when 'REJECT' then 'rejected' else 'needs_supplier_action' end;
  media_status := case p_action when 'APPROVE' then 'published' when 'REJECT' then 'rejected' else 'needs_supplier_action' end;
  reviewed := q.record || jsonb_build_object('status', queue_status, 'actionBy', p_actor_id, 'actionAt', now(), 'actionReason', left(p_reason,350));
  update public.partner_portal_review_queue set record = reviewed, updated_at = now() where id = q.id;
  if q.media_id is not null then
    update public.partner_portal_asset_media set record = record || jsonb_build_object('status', media_status, 'updatedAt', now()), updated_at = now() where id = m.id;
  end if;
  select record into latest_catalog from public.partner_portal_review_queue
    where asset_id = a.id and media_id is null
    order by created_at desc, id desc limit 1;
  ready := p_action = 'APPROVE'
    and (latest_catalog is not null and latest_catalog->>'status' = 'approved')
    and not exists (select 1 from public.partner_portal_asset_media where asset_id = a.id and record->>'status' is distinct from 'archived' and record->>'status' is distinct from 'published');
  update public.partner_portal_assets
    set record = record || jsonb_build_object(
      'dataStatus', case when ready then 'published' else 'needs_confirmation' end,
      'verificationStatus', case when ready then 'Approved' else 'Needs your confirmation' end,
      'updatedAt', now()), updated_at = now()
    where id = a.id;
  return reviewed;
end;
$$;
revoke all on function public.review_partner_portal_media(text,text,uuid,text) from public, anon, authenticated;
grant execute on function public.review_partner_portal_media(text,text,uuid,text) to service_role;
