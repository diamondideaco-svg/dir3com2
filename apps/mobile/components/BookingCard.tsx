import { StyleSheet, Text, View } from 'react-native';
import { colors } from '@/constants/theme';
import type { MobileBookingSummary } from '@/types/domain';

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

function getDateLabel(booking: MobileBookingSummary) {
  const startDate = formatDate(booking.startDate);
  const endDate = formatDate(booking.endDate);

  if (startDate && endDate) {
    return `${startDate} - ${endDate}`;
  }

  if (startDate) {
    return startDate;
  }

  if (booking.createdAt) {
    return formatDate(booking.createdAt) ?? '—';
  }

  return '—';
}

function getAmountLabel(booking: MobileBookingSummary) {
  if (typeof booking.totalAmount !== 'number') {
    return null;
  }

  return `${booking.totalAmount} ${booking.currency ?? 'SAR'}`;
}

export function BookingCard({ booking }: { booking: MobileBookingSummary }) {
  const amountLabel = getAmountLabel(booking);

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.block}>
          <Text style={styles.label}>Reference</Text>
          <Text style={styles.value}>{booking.bookingReference}</Text>
        </View>
        <View style={styles.statusBadge}>
          <Text style={styles.statusText}>{booking.status}</Text>
        </View>
      </View>

      <View style={styles.block}>
        <Text style={styles.label}>Service</Text>
        <Text style={styles.value}>{booking.serviceName ?? 'DIR3COM booking'}</Text>
      </View>

      <View style={styles.row}>
        <View style={styles.block}>
          <Text style={styles.label}>Dates</Text>
          <Text style={styles.value}>{getDateLabel(booking)}</Text>
        </View>
        {amountLabel ? (
          <View style={styles.block}>
            <Text style={styles.label}>Amount</Text>
            <Text style={styles.value}>{amountLabel}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.surface,
    padding: 16,
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  block: {
    flex: 1,
    gap: 4,
  },
  label: {
    color: colors.light,
    opacity: 0.7,
    fontSize: 12,
    textTransform: 'uppercase',
  },
  value: {
    color: colors.light,
    fontSize: 15,
    fontWeight: '600',
  },
  statusBadge: {
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
    fontSize: 12,
  },
});