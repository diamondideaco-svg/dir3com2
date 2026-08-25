import type { PortalActor } from '@/lib/partner-portal/server';

type TenantOwnedRecord = {
  ownerId?: string;
};

export function isPrivilegedPortalActor(actor: Pick<PortalActor, 'authRole'>) {
  return actor.authRole === 'admin' || actor.authRole === 'staff';
}

export function canReadTenantRecord(
  actor: Pick<PortalActor, 'userId' | 'authRole'>,
  record: TenantOwnedRecord,
) {
  if (isPrivilegedPortalActor(actor)) return true;
  return actor.authRole === 'partner' && Boolean(record.ownerId) && record.ownerId === actor.userId;
}

export function hasValidTenantAssociation(...records: TenantOwnedRecord[]) {
  const ownerIds = records.map((record) => record.ownerId).filter(Boolean);
  return ownerIds.length === records.length && new Set(ownerIds).size === 1;
}

export function canReadTenantAssociation(
  actor: Pick<PortalActor, 'userId' | 'authRole'>,
  ...records: TenantOwnedRecord[]
) {
  if (isPrivilegedPortalActor(actor)) return true;
  return hasValidTenantAssociation(...records) && records.every((record) => canReadTenantRecord(actor, record));
}
