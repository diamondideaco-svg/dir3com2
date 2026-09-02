export type AdminBookingCustomerRow = {
  user_id?: string | null;
  guest_name?: string | null;
  guest_email?: string | null;
  customer_name?: string | null;
  booking_reference?: string | null;
  product_name?: string | null;
  service_name?: string | null;
  status?: string | null;
  created_at?: string | null;
};

export type AdminBookingSearch = {
  query?: string;
  status?: string;
  sort?: 'newest' | 'oldest' | 'customer_asc' | 'customer_desc';
};

function normalized(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase() ?? '';
}

export function attachAuthoritativeCustomerName<T extends AdminBookingCustomerRow>(booking: T, profileNames: ReadonlyMap<string, string>): T & { customer_name: string | null } {
  const profileName = booking.user_id ? profileNames.get(booking.user_id)?.trim() : '';
  return {
    ...booking,
    customer_name:
      profileName
      || booking.guest_name?.trim()
      || booking.guest_email?.trim()
      || booking.user_id?.trim()
      || null,
  };
}

export function filterAndSortAdminBookings<T extends AdminBookingCustomerRow>(bookings: readonly T[], search: AdminBookingSearch) {
  const query = normalized(search.query);
  const status = normalized(search.status);
  const filtered = bookings.filter((booking) => {
    if (status && status !== 'all' && normalized(booking.status) !== status) return false;
    if (!query) return true;
    return [booking.customer_name, booking.guest_name, booking.guest_email, booking.booking_reference, booking.product_name]
      .some((value) => normalized(value).includes(query));
  });

  const sort = search.sort ?? 'newest';
  return [...filtered].sort((left, right) => {
    if (sort === 'customer_asc' || sort === 'customer_desc') {
      const comparison = normalized(left.customer_name).localeCompare(normalized(right.customer_name));
      return sort === 'customer_asc' ? comparison : -comparison;
    }
    const leftTime = Date.parse(left.created_at ?? '') || 0;
    const rightTime = Date.parse(right.created_at ?? '') || 0;
    return sort === 'oldest' ? leftTime - rightTime : rightTime - leftTime;
  });
}
