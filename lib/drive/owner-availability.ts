/** A dated owner statement, not a live inventory feed or a reservation. */
export const DRIVE_OWNER_AVAILABILITY = Object.freeze({
  available: true,
  noBookingsAtObservation: true,
  observedAt: '2026-11-15T11:42:00.528725Z',
  source: 'owner-statement' as const,
  record: 'https://github.com/diamondideaco-svg/dir3com2/issues/248',
});

export function driveOwnerAvailabilityCopy(locale: 'ar' | 'en') {
  return locale === 'ar'
    ? 'حسب إفادة مالك المنصة في 15 نوفمبر 2026، 11:42 UTC: المنتجات متاحة ولم تكن هناك حجوزات قائمة حينها. يؤكد فريق العمليات توفر موعد طلبك.'
    : 'According to the platform owner on 15 November 2026 at 11:42 UTC, products were available and there were no existing bookings at that time. Operations confirms availability for your requested dates.';
}
