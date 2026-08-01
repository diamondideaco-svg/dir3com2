import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '@/constants/theme';

type MessageProps = {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function LoadingState({ title, body }: Omit<MessageProps, 'actionLabel' | 'onAction'>) {
  return (
    <View style={styles.card}>
      <ActivityIndicator color={colors.gold} size="large" />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
    </View>
  );
}

export function EmptyState({ title, body, actionLabel, onAction }: MessageProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {actionLabel && onAction ? (
        <TouchableOpacity onPress={onAction} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function ErrorState({ title, body, actionLabel, onAction }: MessageProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {actionLabel && onAction ? (
        <TouchableOpacity onPress={onAction} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
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
    gap: 10,
    alignItems: 'center',
  },
  title: {
    color: colors.gold,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  body: {
    color: colors.light,
    textAlign: 'center',
    lineHeight: 20,
  },
  primaryButton: {
    borderRadius: 999,
    backgroundColor: colors.gold,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primaryButtonText: {
    color: colors.navy,
    fontWeight: '700',
  },
  secondaryButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.gold,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  secondaryButtonText: {
    color: colors.gold,
    fontWeight: '700',
  },
});