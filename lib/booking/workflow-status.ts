export const CANONICAL_BOOKING_STATUSES = ['Pending', 'Confirmed', 'Assigned', 'In Progress', 'Completed', 'Cancelled'] as const;

export type CanonicalBookingStatus = (typeof CANONICAL_BOOKING_STATUSES)[number];
export type CanonicalAssignmentStatus = 'assigned' | 'accepted' | 'declined';

const BOOKING_STATUS_ALIASES: Record<string, CanonicalBookingStatus> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  assigned: 'Assigned',
  'in progress': 'In Progress',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  canceled: 'Cancelled',
};

const ASSIGNMENT_STATUS_ALIASES: Record<string, CanonicalAssignmentStatus> = {
  assigned: 'assigned',
  accepted: 'accepted',
  declined: 'declined',
};

export function normalizeBookingStatus(status: string | null | undefined): CanonicalBookingStatus {
  if (!status) return 'Pending';
  const normalized = BOOKING_STATUS_ALIASES[status.toLowerCase()];
  return normalized ?? 'Pending';
}

export function normalizeAssignmentStatus(status: string | null | undefined): CanonicalAssignmentStatus | null {
  if (!status) return null;
  return ASSIGNMENT_STATUS_ALIASES[status.toLowerCase()] ?? null;
}

export function bookingStatusFromAssignmentStatus(status: string | null | undefined): CanonicalBookingStatus {
  const normalized = normalizeAssignmentStatus(status);
  if (normalized === 'accepted') return 'In Progress';
  if (normalized === 'declined') return 'Pending';
  return 'Assigned';
}

export function getLifecycleStatusContract(bookingStatus: string | null | undefined, assignmentStatus?: string | null) {
  const normalizedBookingStatus = normalizeBookingStatus(bookingStatus);
  const normalizedAssignmentStatus = normalizeAssignmentStatus(assignmentStatus);

  return {
    bookingStatus: normalizedBookingStatus,
    assignmentStatus: normalizedAssignmentStatus,
    operationsStatus: normalizedBookingStatus,
    customerVisibleStatus: normalizedBookingStatus,
  };
}
