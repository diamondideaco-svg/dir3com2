import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  resolveBookingMetrics,
  resolveCountMetric,
  type ExecutiveBookingRow,
  type ExecutiveDashboardData,
} from '@/lib/integration/executive-dashboard-contract';

type QueryError = {
  code?: string;
  message: string;
};

function reportQueryFailure(query: string, error: QueryError | Error) {
  console.error('[executive-dashboard] authoritative query unavailable', {
    query,
    code: 'code' in error ? error.code : undefined,
    message: error.message,
  });
}

function reportMissingCount(query: string) {
  console.error('[executive-dashboard] authoritative count unavailable', { query });
}

export async function getExecutiveDashboardData(): Promise<ExecutiveDashboardData> {
  const supabase = await createSupabaseServerClient();

  const [bookingsRes, settlementsRes, refundsRes, verificationsRes, notificationsRes] = await Promise.all([
    supabase
      .from('bookings')
      .select('id, booking_reference, status, payment_status, total_amount, synthetic, environment, source_channel')
      .eq('synthetic', false)
      .eq('environment', 'production')
      .is('deleted_at', null),
    supabase
      .from('partner_settlements')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
    supabase
      .from('refund_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
    supabase
      .from('verification_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'Pending'),
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'failed'),
  ]);

  const queryResults = [
    ['production-bookings', bookingsRes],
    ['pending-settlements', settlementsRes],
    ['pending-refunds', refundsRes],
    ['pending-verifications', verificationsRes],
    ['failed-notifications', notificationsRes],
  ] as const;

  for (const [query, result] of queryResults) {
    if (result.error) reportQueryFailure(query, result.error);
  }

  for (const [query, result] of queryResults.slice(1)) {
    if (!result.error && typeof result.count !== 'number') reportMissingCount(query);
  }

  const bookingMetrics = resolveBookingMetrics(
    bookingsRes.data as ExecutiveBookingRow[] | null,
    bookingsRes.error,
  );

  return {
    ...bookingMetrics,
    pendingSettlements: resolveCountMetric(settlementsRes.count, settlementsRes.error),
    pendingRefunds: resolveCountMetric(refundsRes.count, refundsRes.error),
    pendingVerifications: resolveCountMetric(verificationsRes.count, verificationsRes.error),
    failedNotifications: resolveCountMetric(notificationsRes.count, notificationsRes.error),
  };
}
