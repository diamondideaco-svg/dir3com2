import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MobileRouter } from '@/navigation/MobileRouter';
import { colors } from '@/constants/theme';
import { useSession } from '@/session/SessionProvider';

export function SessionBoundary() {
  const { status, errorMessage, retry } = useSession();

  if (status === 'loading') {
    return (
      <View style={styles.stateContainer}>
        <ActivityIndicator color={colors.gold} size="large" />
        <Text style={styles.stateText}>Preparing your DIR3COM session...</Text>
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={styles.stateContainer}>
        <Text style={styles.stateTitle}>Session Error</Text>
        <Text style={styles.stateText}>{errorMessage ?? 'Unexpected session issue.'}</Text>
        <TouchableOpacity onPress={retry} style={styles.retryButton}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return <MobileRouter />;
}

const styles = StyleSheet.create({
  stateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 14,
    backgroundColor: colors.navy,
  },
  stateTitle: {
    color: colors.gold,
    fontSize: 22,
    fontWeight: '700',
  },
  stateText: {
    color: colors.light,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.gold,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryText: {
    color: colors.gold,
    fontWeight: '700',
  },
});
