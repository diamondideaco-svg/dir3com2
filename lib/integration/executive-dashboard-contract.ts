export type ExecutiveMetric<T> =
  | { status: 'available'; value: T }
  | { status: 'unavailable' };

export type ExecutiveBookingRow = {
  id?: string | null;
  booking_reference?: string | null;
  status?: string | null;
  payment_status?: string | null;
  total_amount?: number | string | null;
  synthetic?: boolean | null;
  environment?: string | null;
  source_channel?: string | null;
};

export type ExecutiveBookingMetrics = {
  productionBookings: ExecutiveMetric<number>;
  confirmedProductionRevenue: ExecutiveMetric<number>;
};

export type ExecutiveDashboardData = ExecutiveBookingMetrics & {
  pendingSettlements: ExecutiveMetric<number>;
  pendingRefunds: ExecutiveMetric<number>;
  pendingVerifications: ExecutiveMetric<number>;
  failedNotifications: ExecutiveMetric<number>;
};

const productionBookingStatuses = new Set(['pending', 'confirmed', 'completed', 'cancelled', 'failed']);
const revenueBookingStatuses = new Set(['confirmed', 'completed']);
const confirmedPaymentStatuses = new Set(['paid', 'confirmed', 'settled', 'succeeded', 'completed']);
const nonLiveMarker = /(test|sandbox|preview|fixture|seed|demo|staging|development|\bdev\b|\bqa\b)/i;
const nonLiveReference = /^(test|sandbox|preview|fixture|seed|demo)[-_]/i;

function normalized(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? '';
}

export function isProductionBooking(row: ExecutiveBookingRow) {
  const environment = normalized(row.environment);
  const status = normalized(row.status);
  const reference = row.booking_reference?.trim() ?? '';
  const source = row.source_channel?.trim() ?? '';

  return row.synthetic === false
    && environment === 'production'
    && productionBookingStatuses.has(status)
    && !nonLiveReference.test(reference)
    && !nonLiveMarker.test(source);
}

export function isConfirmedProductionRevenue(row: ExecutiveBookingRow) {
  return isProductionBooking(row)
    && revenueBookingStatuses.has(normalized(row.status))
    && confirmedPaymentStatuses.has(normalized(row.payment_status));
}

export function resolveBookingMetrics(
  rows: ExecutiveBookingRow[] | null,
  error: unknown,
): ExecutiveBookingMetrics {
  if (error || !Array.isArray(rows)) {
    return {
      productionBookings: { status: 'unavailable' },
      confirmedProductionRevenue: { status: 'unavailable' },
    };
  }

  const productionRows = rows.filter(isProductionBooking);
  const revenueRows = productionRows.filter(isConfirmedProductionRevenue);
  const revenueAmounts = revenueRows.map((row) => (
    row.total_amount === null || row.total_amount === undefined || row.total_amount === ''
      ? Number.NaN
      : Number(row.total_amount)
  ));
  const confirmedProductionRevenue = revenueAmounts.every(Number.isFinite)
    ? { status: 'available' as const, value: revenueAmounts.reduce((sum, value) => sum + value, 0) }
    : { status: 'unavailable' as const };

  return {
    productionBookings: { status: 'available', value: productionRows.length },
    confirmedProductionRevenue,
  };
}

export function resolveCountMetric(count: number | null, error: unknown): ExecutiveMetric<number> {
  if (error || typeof count !== 'number' || !Number.isFinite(count)) {
    return { status: 'unavailable' };
  }

  return { status: 'available', value: count };
}
