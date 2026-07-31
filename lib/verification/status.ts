export const VERIFICATION_STATUSES = {
  PENDING: 'Pending',
  UNDER_REVIEW: 'Under Review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  EXPIRED: 'Expired',
  SUSPENDED: 'Suspended',
} as const;

export type CanonicalVerificationStatus = (typeof VERIFICATION_STATUSES)[keyof typeof VERIFICATION_STATUSES];

const STATUS_ALIAS_MAP: Record<string, CanonicalVerificationStatus> = {
  pending: VERIFICATION_STATUSES.PENDING,
  'under review': VERIFICATION_STATUSES.UNDER_REVIEW,
  under_review: VERIFICATION_STATUSES.UNDER_REVIEW,
  approved: VERIFICATION_STATUSES.APPROVED,
  rejected: VERIFICATION_STATUSES.REJECTED,
  expired: VERIFICATION_STATUSES.EXPIRED,
  suspended: VERIFICATION_STATUSES.SUSPENDED,
};

export function normalizeVerificationStatus(status: string | null | undefined): CanonicalVerificationStatus {
  if (!status) return VERIFICATION_STATUSES.PENDING;
  const normalized = STATUS_ALIAS_MAP[status.trim().toLowerCase()];
  return normalized ?? VERIFICATION_STATUSES.PENDING;
}
