import { supabaseAdmin } from '@/lib/supabase/server';
import type { ContractAssociation, PortalAssetMedia, PortalAssetRecord, PortalOnboardingStore, ReviewQueueItem } from '@/lib/partner-portal/onboarding-types';
import type { PortalActor } from '@/lib/partner-portal/server';

type PersistedRow<T> = { record: T };

function repository() {
  if (!supabaseAdmin) throw new Error('PARTNER_PORTAL_REPOSITORY_UNAVAILABLE');
  return supabaseAdmin;
}

function records<T>(rows: PersistedRow<T>[] | null) {
  return (rows || []).map((row) => row.record);
}

export async function readOnboardingStore(actor: PortalActor): Promise<PortalOnboardingStore> {
  const db = repository();
  const privileged = actor.authRole === 'admin' || actor.authRole === 'staff';
  const assetQuery = db.from('partner_portal_assets').select('record');
  const mediaQuery = db.from('partner_portal_asset_media').select('record');
  const reviewQuery = db.from('partner_portal_review_queue').select('record');
  const contractQuery = db.from('partner_portal_contracts').select('record');
  const [assets, media, reviewQueue, contracts] = await Promise.all([
    privileged ? assetQuery : assetQuery.eq('owner_id', actor.userId),
    privileged ? mediaQuery : mediaQuery.eq('owner_id', actor.userId),
    privileged ? reviewQuery : reviewQuery.eq('owner_id', actor.userId),
    privileged ? contractQuery : contractQuery.eq('owner_id', actor.userId),
  ]);
  const failure = assets.error || media.error || reviewQueue.error || contracts.error;
  if (failure) throw failure;
  return {
    assets: records<PortalAssetRecord>(assets.data as PersistedRow<PortalAssetRecord>[] | null),
    media: records<PortalAssetMedia>(media.data as PersistedRow<PortalAssetMedia>[] | null),
    reviewQueue: records<ReviewQueueItem>(reviewQueue.data as PersistedRow<ReviewQueueItem>[] | null),
    contracts: records<ContractAssociation>(contracts.data as PersistedRow<ContractAssociation>[] | null),
  };
}

function ownerId(record: { id: string; ownerId?: string }) {
  const value = String(record.ownerId || '').trim();
  if (!value) throw new Error(`PARTNER_PORTAL_OWNER_REQUIRED:${record.id}`);
  return value;
}

export async function writeOnboardingStore(store: Partial<PortalOnboardingStore>, actor: PortalActor) {
  const db = repository();
  const privileged = actor.authRole === 'admin' || actor.authRole === 'staff';
  const owned = <T extends { ownerId?: string }>(records: T[]) => privileged ? records : records.filter((record) => record.ownerId === actor.userId);
  const assets = owned(store.assets || []);
  const media = owned(store.media || []);
  const reviewQueue = owned(store.reviewQueue || []);
  const contracts = owned(store.contracts || []);
  const { error } = await db.rpc('persist_partner_portal_state', {
    p_assets: assets.map((record) => ({ id: record.id, owner_id: ownerId(record), owner_kind: record.ownerKind, record, updated_at: record.updatedAt })),
    p_media: media.map((record) => ({ id: record.id, owner_id: ownerId(record), asset_id: record.assetId, owner_kind: record.ownerKind, storage_path: record.url, record, updated_at: record.updatedAt })),
    p_reviews: reviewQueue.map((record) => ({ id: record.id, owner_id: ownerId(record), asset_id: record.assetId, media_id: record.mediaId === 'catalog-update' ? '' : record.mediaId, owner_kind: record.ownerKind, record, updated_at: record.actionAt || record.submittedAt })),
    p_contracts: contracts.map((record) => ({ id: record.id, owner_id: ownerId(record), owner_kind: record.ownerKind, record })),
  });
  if (error) throw error;
}
