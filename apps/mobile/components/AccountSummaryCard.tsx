import { StyleSheet, Text, View } from 'react-native';
import { colors } from '@/constants/theme';
import type { MobileAccountSummary } from '@/types/domain';

function AccountRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value || '—'}</Text>
    </View>
  );
}

export function AccountSummaryCard({ account }: { account: MobileAccountSummary }) {
  return (
    <View style={styles.card}>
      <AccountRow label="Name" value={account.fullName} />
      <AccountRow label="Email" value={account.email} />
      <AccountRow label="Phone" value={account.phone} />
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
});