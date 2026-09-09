-- P1: prevent caller-writable JSON from becoming service-role tenant authority.
-- No row changes, no deletes, no RLS disablement, no policy broadening.
begin;

revoke insert, update, delete, truncate, references, trigger on table
  public.partner_portal_assets, public.partner_portal_asset_media,
  public.partner_portal_contracts, public.partner_portal_review_queue
  from anon, authenticated;

create or replace function public.guard_partner_portal_record_identity()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if TG_OP = 'UPDATE' and (new.id is distinct from old.id or new.owner_id is distinct from old.owner_id) then
    raise exception 'PARTNER_PORTAL_IMMUTABLE_OWNER' using errcode = '42501';
  end if;
  if new.record->>'id' is distinct from new.id::text
     or new.record->>'ownerId' is distinct from new.owner_id::text
     or new.record->>'ownerKind' is distinct from new.owner_kind then
    raise exception 'PARTNER_PORTAL_RECORD_IDENTITY_CONFLICT' using errcode = '23514';
  end if;
  if TG_TABLE_NAME in ('partner_portal_asset_media', 'partner_portal_review_queue') then
    if new.record->>'assetId' is distinct from new.asset_id::text
       or not exists (select 1 from public.partner_portal_assets a where a.id = new.asset_id and a.owner_id = new.owner_id and a.owner_kind = new.owner_kind) then
      raise exception 'PARTNER_PORTAL_ASSOCIATION_CONFLICT' using errcode = '23514';
    end if;
  end if;
  if TG_TABLE_NAME = 'partner_portal_asset_media' then
    if new.record->>'url' is distinct from new.storage_path then
      raise exception 'PARTNER_PORTAL_STORAGE_CONFLICT' using errcode = '23514';
    end if;
  elsif TG_TABLE_NAME = 'partner_portal_review_queue' then
    if new.record->>'mediaId' is distinct from coalesce(new.media_id::text, 'catalog-update') then
      raise exception 'PARTNER_PORTAL_MEDIA_CONFLICT' using errcode = '23514';
    end if;
    if new.media_id is not null and not exists (
      select 1 from public.partner_portal_asset_media m
      where m.id = new.media_id and m.asset_id = new.asset_id and m.owner_id = new.owner_id and m.owner_kind = new.owner_kind
    ) then
      -- Rejected validation attempts already have an attempt UUID but no stored
      -- media. Preserve this truthful audit contract, never a foreign media link.
      if exists (select 1 from public.partner_portal_asset_media m where m.id = new.media_id)
         or not (coalesce(new.record->>'technicalValidationStatus', '') = 'fail'
                 and coalesce(new.record->>'status', '') = 'needs_supplier_action'
                 and coalesce(new.record->>'oldImageUrl', '') = ''
                 and coalesce(new.record->>'newImageUrl', '') = '') then
        raise exception 'PARTNER_PORTAL_MEDIA_ASSOCIATION_CONFLICT' using errcode = '23514';
      end if;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_partner_portal_record_identity() from public, anon, authenticated;

create trigger partner_assets_identity before insert or update on public.partner_portal_assets
for each row execute function public.guard_partner_portal_record_identity();
create trigger partner_media_identity before insert or update on public.partner_portal_asset_media
for each row execute function public.guard_partner_portal_record_identity();
create trigger partner_contracts_identity before insert or update on public.partner_portal_contracts
for each row execute function public.guard_partner_portal_record_identity();
create trigger partner_reviews_identity before insert or update on public.partner_portal_review_queue
for each row execute function public.guard_partner_portal_record_identity();

commit;
