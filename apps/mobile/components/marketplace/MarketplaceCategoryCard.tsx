import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '@/constants/theme';
import type { MarketplaceCategory } from '@/types/domain';

type MarketplaceCategoryCardProps = {
  category: MarketplaceCategory;
  onPress: () => void;
};

export function MarketplaceCategoryCard({ category, onPress }: MarketplaceCategoryCardProps) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`Open category ${category.nameEn}`}
      onPress={onPress}
      style={styles.card}
    >
      <View style={styles.row}>
        <Text style={styles.name}>{category.nameEn}</Text>
        {typeof category.itemCount === 'number' ? <Text style={styles.count}>{category.itemCount}</Text> : null}
      </View>
      <Text style={styles.nameAr}>{category.nameAr}</Text>
      <Text style={styles.linkText}>Browse category</Text>
    </TouchableOpacity>
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
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    color: colors.light,
    fontWeight: '700',
    fontSize: 16,
    flexShrink: 1,
  },
  nameAr: {
    color: colors.light,
    opacity: 0.8,
  },
  count: {
    color: colors.gold,
    fontWeight: '700',
  },
  linkText: {
    color: colors.gold,
    fontWeight: '700',
  },
});
