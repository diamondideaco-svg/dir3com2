import { useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '@/constants/theme';
import { normalizeMarketplaceIdentifier } from '@/lib/marketplace';
import type { MarketplaceItemSummary } from '@/types/domain';

type MarketplaceItemCardProps = {
  item: MarketplaceItemSummary;
  onPress?: () => void;
};

function formatPrice(item: MarketplaceItemSummary) {
  if (typeof item.startingPrice !== 'number') {
    return null;
  }

  if (!item.currency) {
    return String(item.startingPrice);
  }

  return `${item.startingPrice} ${item.currency}`;
}

export function MarketplaceItemCard({ item, onPress }: MarketplaceItemCardProps) {
  const [imageHidden, setImageHidden] = useState(false);
  const priceLabel = formatPrice(item);
  const normalizedSlug = normalizeMarketplaceIdentifier(item.slug);

  const content = (
    <>
      {item.imageUrl && !imageHidden ? (
        <Image
          source={{ uri: item.imageUrl }}
          style={styles.image}
          onError={() => setImageHidden(true)}
          accessibilityLabel={`Image for ${item.nameEn}`}
        />
      ) : (
        <View style={styles.imagePlaceholder}>
          <Text style={styles.imagePlaceholderText}>DIR3COM</Text>
        </View>
      )}

      <View style={styles.content}>
        <Text style={styles.name}>{item.nameEn}</Text>
        <Text style={styles.nameAr}>{item.nameAr}</Text>
        {item.description ? <Text style={styles.description}>{item.description}</Text> : null}
        <Text style={styles.category}>{item.categoryNameEn}</Text>
        {priceLabel ? <Text style={styles.price}>From {priceLabel}</Text> : null}
        {onPress && normalizedSlug ? <Text style={styles.viewDetails}>View details</Text> : null}
      </View>
    </>
  );

  if (onPress && normalizedSlug) {
    return (
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={`View details for ${item.nameEn}`}
        onPress={onPress}
        style={styles.card}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.card}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: 170,
    backgroundColor: colors.surfaceMuted,
  },
  imagePlaceholder: {
    width: '100%',
    height: 170,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  imagePlaceholderText: {
    color: colors.gold,
    fontWeight: '700',
    letterSpacing: 1,
  },
  content: {
    padding: 14,
    gap: 6,
  },
  name: {
    color: colors.light,
    fontWeight: '700',
    fontSize: 16,
  },
  nameAr: {
    color: colors.light,
    opacity: 0.8,
  },
  description: {
    color: colors.light,
    lineHeight: 20,
  },
  category: {
    color: colors.gold,
    fontWeight: '600',
  },
  price: {
    color: colors.light,
    fontWeight: '700',
  },
  viewDetails: {
    color: colors.gold,
    fontWeight: '700',
  },
});
