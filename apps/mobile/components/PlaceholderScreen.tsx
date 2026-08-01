import { StyleSheet, Text, View } from 'react-native';
import { colors } from '@/constants/theme';

export function PlaceholderScreen() {
  return (
    <View style={styles.card}>
      <Text style={styles.heading}>Shared Contract Foundation</Text>
      <Text style={styles.text}>Auth boundary, API contracts, and domain adapters are prepared for B2.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.surfaceMuted,
    padding: 16,
  },
  heading: {
    color: colors.light,
    fontSize: 18,
    fontWeight: '700',
  },
  text: {
    marginTop: 8,
    color: colors.light,
    opacity: 0.88,
    lineHeight: 20,
  },
});
