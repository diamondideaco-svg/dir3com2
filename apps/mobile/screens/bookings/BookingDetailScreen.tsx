import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocale } from '@/app/providers/LocaleProvider';
import { EmptyState, ErrorState, LoadingState } from '@/components/ProtectedStates';
import { colors } from '@/constants/theme';
import { normalizeBookingIdentifier } from '@/lib/bookings';
import { fetchBookingDetail } from '@/services/api/authenticated';
import { useProtectedResource } from '@/services/api/protected-resource';
import { useSession } from '@/session/SessionProvider';
import type { MobileBookingDetail } from '@/types/domain';

type BookingDetailScreenProps = {
  bookingId: string;
  onBack: () => void;
};

function formatDate(value?: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleDateString();
}

function formatDateRange(booking: MobileBookingDetail) {
  const startDate = formatDate(booking.startDate);
  const endDate = formatDate(booking.endDate);

  if (startDate && endDate) {
    return `${startDate} - ${endDate}`;
  }

  return startDate ?? endDate ?? null;
}

function formatAmount(booking: MobileBookingDetail) {
  if (typeof booking.totalAmount !== 'number') {
    return null;
  }

  return `${booking.totalAmount} ${booking.currency ?? 'SAR'}`;
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) {
    return null;
  }

  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

export function BookingDetailScreen({ bookingId, onBack }: BookingDetailScreenProps) {
  const { isRTL } = useLocale();
  const { getAccessToken, invalidateSession } = useSession();
  const normalizedBookingId = normalizeBookingIdentifier(bookingId);

  const { state, retry, refresh } = useProtectedResource({
    routeKey: 'bookingDetail',
    load: (signal) => fetchBookingDetail(getAccessToken, normalizedBookingId ?? bookingId, signal),
    isEmpty: () => false,
    onUnauthorized: (routeKey) => {
      void invalidateSession({ key: routeKey, bookingId: normalizedBookingId ?? bookingId });
    },
  });

  if (!normalizedBookingId) {
    return (
      <View style={styles.container}>
        <EmptyState
          title={isRTL ? 'الحجز غير متاح' : 'Booking unavailable'}
          body={isRTL ? 'تعذر فتح هذا الحجز من هذا الرابط.' : 'This booking could not be opened from the requested route.'}
          actionLabel={isRTL ? 'العودة إلى حجوزاتي' : 'Back to My Bookings'}
          onAction={onBack}
        />
      </View>
    );
  }

  const booking = state.data?.booking ?? null;
  const dateRange = booking ? formatDateRange(booking) : null;
  const amountLabel = booking ? formatAmount(booking) : null;
  const createdAt = booking ? formatDate(booking.createdAt) : null;
  const guestCount = typeof booking?.guests === 'number' ? String(booking.guests) : null;

  const body = (() => {
    if (state.status === 'loading' || state.status === 'idle') {
      return (
        <LoadingState
          title={isRTL ? 'جارٍ تحميل تفاصيل الحجز' : 'Loading booking details'}
          body={isRTL ? 'يتم الآن تحميل تفاصيل الحجز من منصة dir3com الأساسية.' : 'We are loading this booking from the shared DIR3COM core platform.'}
        />
      );
    }

    if (state.status === 'unauthorized') {
      return (
        <ErrorState
          title={isRTL ? 'انتهت الجلسة' : 'Session expired'}
          body={state.errorMessage ?? (isRTL ? 'يرجى تسجيل الدخول من جديد.' : 'Please sign in again to continue.')}
        />
      );
    }

    if (state.status === 'empty' && state.errorStatus === 404) {
      return (
        <EmptyState
          title={isRTL ? 'الحجز غير متاح' : 'Booking unavailable'}
          body={state.errorMessage ?? (isRTL ? 'هذا الحجز غير متاح حالياً.' : 'This booking is unavailable right now.')}
          actionLabel={isRTL ? 'العودة إلى حجوزاتي' : 'Back to My Bookings'}
          onAction={onBack}
        />
      );
    }

    if (state.status === 'error') {
      return (
        <ErrorState
          title={isRTL ? 'تعذر تحميل الحجز' : 'Unable to load booking'}
          body={state.errorMessage ?? (isRTL ? 'حاول مرة أخرى بعد قليل.' : 'Please try again in a moment.')}
          actionLabel={isRTL ? 'إعادة المحاولة' : 'Retry'}
          onAction={retry}
        />
      );
    }

    if (!booking) {
      return (
        <EmptyState
          title={isRTL ? 'الحجز غير متاح' : 'Booking unavailable'}
          body={isRTL ? 'لا تتوفر تفاصيل لهذا الحجز حالياً.' : 'Details are not available for this booking right now.'}
          actionLabel={isRTL ? 'العودة إلى حجوزاتي' : 'Back to My Bookings'}
          onAction={onBack}
        />
      );
    }

    return (
      <View style={styles.sectionList}>
        {state.status === 'refreshing' ? <Text style={styles.refreshText}>{isRTL ? 'جارٍ التحديث...' : 'Refreshing...'}</Text> : null}

        <View style={styles.summaryCard}>
          <Text style={styles.referenceLabel}>Reference</Text>
          <Text style={styles.referenceValue}>{booking.bookingReference}</Text>
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>{booking.status}</Text>
          </View>
        </View>

        <View style={styles.detailCard}>
          <DetailRow label="Service" value={booking.serviceName} />
          <DetailRow label="Dates" value={dateRange} />
          <DetailRow label="City" value={booking.city} />
          <DetailRow label="Guests" value={guestCount} />
          <DetailRow label="Total" value={amountLabel} />
          <DetailRow label="Payment" value={booking.paymentStatus ?? null} />
          <DetailRow label="Guest Name" value={booking.guestName} />
          <DetailRow label="Guest Phone" value={booking.guestPhone} />
          <DetailRow label="Guest Email" value={booking.guestEmail} />
          <DetailRow label="Notes" value={booking.notes} />
          <DetailRow label="Created" value={createdAt} />
        </View>
      </View>
    );
  })();

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={state.status === 'refreshing'} onRefresh={refresh} tintColor={colors.gold} />}
    >
      <View style={styles.headerRow}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to My Bookings" onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>{isRTL ? 'العودة' : 'Back'}</Text>
        </TouchableOpacity>
        <View style={styles.headerTextWrap}>
          <Text style={[styles.title, { textAlign: isRTL ? 'right' : 'left' }]}>Booking Detail</Text>
          <Text style={[styles.body, { textAlign: isRTL ? 'right' : 'left' }]}>
            {isRTL ? 'تفاصيل الحجز المعروضة هنا تأتي من واجهات dir3com المحمية فقط.' : 'This booking view only shows customer-safe data from protected DIR3COM APIs.'}
          </Text>
        </View>
      </View>

      {body}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
    paddingBottom: 24,
  },
  headerRow: {
    gap: 12,
  },
  headerTextWrap: {
    gap: 6,
  },
  backButton: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  backButtonText: {
    color: colors.light,
    fontWeight: '700',
  },
  title: {
    color: colors.gold,
    fontSize: 20,
    fontWeight: '700',
  },
  body: {
    color: colors.light,
    lineHeight: 20,
  },
  sectionList: {
    gap: 12,
  },
  refreshText: {
    color: colors.light,
    textAlign: 'center',
  },
  summaryCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.surface,
    padding: 16,
    gap: 8,
  },
  referenceLabel: {
    color: colors.light,
    opacity: 0.7,
    fontSize: 12,
    textTransform: 'uppercase',
  },
  referenceValue: {
    color: colors.light,
    fontSize: 20,
    fontWeight: '700',
  },
  statusBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusText: {
    color: colors.gold,
    fontWeight: '700',
  },
  detailCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.surface,
    padding: 16,
    gap: 12,
  },
  detailRow: {
    gap: 4,
  },
  detailLabel: {
    color: colors.light,
    opacity: 0.7,
    fontSize: 12,
    textTransform: 'uppercase',
  },
  detailValue: {
    color: colors.light,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
});