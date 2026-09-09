// Physical database columns are authoritative; JSON is presentation data.
export type PersistedPortalRow<T> = {
  id: string;
  owner_id: string;
  owner_kind: string;
  asset_id?: string;
  media_id?: string | null;
  storage_path?: string;
  record: T;
};

export function readPersistedPortalRecord<T>(row: PersistedPortalRow<T>): T {
  const record = row.record as Record<string, unknown> | null;
  if (!record || typeof record !== 'object'
    || !row.id || !row.owner_id || !row.owner_kind
    || record.id !== row.id || record.ownerId !== row.owner_id || record.ownerKind !== row.owner_kind
    || ('asset_id' in row && record.assetId !== row.asset_id)
    || ('media_id' in row && record.mediaId !== (row.media_id || 'catalog-update'))
    || ('storage_path' in row && record.url !== row.storage_path)) {
    throw new Error('PARTNER_PORTAL_RECORD_IDENTITY_CONFLICT');
  }
  return row.record;
}
