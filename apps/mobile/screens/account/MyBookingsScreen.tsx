import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocale } from '@/app/providers/LocaleProvider';
import { colors } from '@/constants/theme';
import { createSessionApiClient } from '@/services/api/authenticated';
import { useSession } from '@/session/SessionProvider';

export function MyBookingsScreen() {
  const { isRTL } = useLocale();
  const { getAccessToken } = useSession();

  const authApiClientReady = useMemo(() => {
    const client = createSessionApiClient(getAccessToken);
    return Boolean(client);
  }, [getAccessToken]);

  return (
    <View style={styles.card}>
      <Text style={[styles.title, { textAlign: isRTL ? 'right' : 'left' }]}>My Bookings</Text>
      <Text style={[styles.body, { textAlign: isRTL ? 'right' : 'left' }]}>
        {authApiClientReady
          ? 'Authenticated route boundary is active. Session token wiring for protected API calls is now established for the next booking integration batch.'
          : 'Preparing authenticated booking API boundary.'}
      </Text>
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
    gap: 8,
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
});
