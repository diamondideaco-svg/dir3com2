import { type ReactNode, useMemo, useState } from 'react';
import { Image, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocale } from '@/app/providers/LocaleProvider';
import { EmptyState, ErrorState, LoadingState } from '@/components/ProtectedStates';
import { colors } from '@/constants/theme';
import { normalizeMarketplaceIdentifier } from '@/lib/marketplace';
import { fetchMarketplaceItemDetail } from '@/services/api/public';
import { usePublicResource } from '@/services/api/public-resource';
import type { MarketplaceItemDetail } from '@/types/domain';

type MarketplaceItemDetailScreenProps = {
  itemSlug: string;
  onBack: () => void;
  onStartBooking: (itemSlug: string) => void;
};

function formatPrice(item: MarketplaceItemDetail) {
  if (typeof item.startingPrice !== 'number') {
    return null;
  }

  if (!item.currency) {
    return String(item.startingPrice);
  }

  return `${item.startingPrice} ${item.currency}`;
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export function MarketplaceItemDetailScreen({ itemSlug, onBack, onStartBooking }: MarketplaceItemDetailScreenProps) {
  const { isRTL } = useLocale();
  const normalizedItemSlug = normalizeMarketplaceIdentifier(itemSlug);
  const [hidePrimaryImage, setHidePrimaryImage] = useState(false);

  const { state, retry, refresh } = usePublicResource({
    load: (signal) => fetchMarketplaceItemDetail(normalizedItemSlug ?? itemSlug, signal),
    isEmpty: () => false,
  });

  if (!normalizedItemSlug) {
    return (
      <View style={styles.container}>
        <EmptyState
          title={isRTL ? 'العنصر غير متاح' : 'Item unavailable'}
          body={isRTL ? 'تعذر فتح هذا العنصر.' : 'This item could not be opened.'}
          actionLabel={isRTL ? 'العودة للسوق' : 'Back to Marketplace'}
          onAction={onBack}
        />
      </View>
    );
  }

  const item = state.data?.item ?? null;
  const galleryPreview = useMemo(() => item?.galleryImageUrls.slice(0, 4) ?? [], [item]);

  const body = (() => {
    if (state.status === 'loading' || state.status === 'idle') {
      return (
        <LoadingState
          title={isRTL ? 'جارٍ تحميل التفاصيل' : 'Loading details'}
          body={isRTL ? 'جاري تحميل تفاصيل العنصر من واجهات dir3com العامة.' : 'Loading item detail from public DIR3COM core APIs.'}
        />
      );
    }

    if (state.status === 'empty' && state.errorStatus === 404) {
      return (
        <EmptyState
          title={isRTL ? 'العنصر غير متاح' : 'Item unavailable'}
          body={state.errorMessage ?? (isRTL ? 'هذا العنصر غير متاح حالياً.' : 'This marketplace item is unavailable right now.')}
          actionLabel={isRTL ? 'العودة للسوق' : 'Back to Marketplace'}
          onAction={onBack}
        />
      );
    }

    if (state.status === 'error') {
      return (
        <ErrorState
          title={isRTL ? 'تعذر تحميل التفاصيل' : 'Unable to load details'}
          body={state.errorMessage ?? (isRTL ? 'حاول مرة أخرى بعد قليل.' : 'Please try again in a moment.')}
          actionLabel={isRTL ? 'إعادة المحاولة' : 'Retry'}
          onAction={retry}
        />
      );
    }

    if (!item) {
      return (
        <EmptyState
          title={isRTL ? 'العنصر غير متاح' : 'Item unavailable'}
          body={isRTL ? 'لا تتوفر تفاصيل لهذا العنصر حالياً.' : 'Details are not available for this item right now.'}
          actionLabel={isRTL ? 'العودة للسوق' : 'Back to Marketplace'}
          onAction={onBack}
        />
      );
    }

    const displayName = item.nameEn ?? item.nameAr ?? item.slug;
    const priceLabel = formatPrice(item);

    return (
      <View style={styles.contentList}>
        {state.status === 'refreshing' ? <Text style={styles.refreshText}>{isRTL ? 'جارٍ التحديث...' : 'Refreshing...'}</Text> : null}

        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>{displayName}</Text>
          {item.nameAr && item.nameEn ? <Text style={styles.heroSubtitle}>{item.nameAr}</Text> : null}
          <Text style={styles.categoryLabel}>{item.categoryNameEn}</Text>
          {item.badge ? <Text style={styles.badge}>{item.badge}</Text> : null}
        </View>

        {item.primaryImageUrl && !hidePrimaryImage ? (
          <Image
            source={{ uri: item.primaryImageUrl }}
            style={styles.primaryImage}
            onError={() => setHidePrimaryImage(true)}
            accessibilityLabel={`Primary image for ${displayName}`}
          />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Text style={styles.imagePlaceholderText}>DIR3COM</Text>
          </View>
        )}

        {item.shortDescription ? (
          <DetailSection title={isRTL ? 'نبذة' : 'Overview'}>
            <Text style={styles.sectionText}>{item.shortDescription}</Text>
          </DetailSection>
        ) : null}

        {item.longDescription ? (
          <DetailSection title={isRTL ? 'تفاصيل' : 'Details'}>
            <Text style={styles.sectionText}>{item.longDescription}</Text>
          </DetailSection>
        ) : null}

        {(priceLabel || item.city) ? (
          <DetailSection title={isRTL ? 'معلومات الخدمة' : 'Service Info'}>
            {priceLabel ? <Text style={styles.sectionText}>{isRTL ? `السعر يبدأ من ${priceLabel}` : `Starting from ${priceLabel}`}</Text> : null}
            {item.city ? <Text style={styles.sectionText}>{isRTL ? `المدينة: ${item.city}` : `City: ${item.city}`}</Text> : null}
          </DetailSection>
        ) : null}

        {item.features.length > 0 ? (
          <DetailSection title={isRTL ? 'المميزات' : 'Features'}>
            {item.features.map((feature) => (
              <Text key={feature} style={styles.sectionText}>• {feature}</Text>
            ))}
          </DetailSection>
        ) : null}

        {galleryPreview.length > 0 ? (
          <DetailSection title={isRTL ? 'الصور' : 'Gallery'}>
            <View style={styles.galleryGrid}>
              {galleryPreview.map((url, index) => (
                <Image key={`${url}-${index}`} source={{ uri: url }} style={styles.galleryImage} accessibilityLabel={`Gallery image ${index + 1}`} />
              ))}
            </View>
            {item.galleryImageUrls.length > galleryPreview.length ? (
              <Text style={styles.sectionText}>
                {isRTL
                  ? `صور إضافية متاحة: ${item.galleryImageUrls.length - galleryPreview.length}`
                  : `More images available: ${item.galleryImageUrls.length - galleryPreview.length}`}
              </Text>
            ) : null}
          </DetailSection>
        ) : null}

        <DetailSection title={isRTL ? 'بدء نية الحجز' : 'Start Booking Intent'}>
          <Text style={styles.sectionText}>
            {isRTL
              ? 'سيتم تأكيد السعر النهائي والتوفر من DIR3COM Core لاحقاً. لم يتم إنشاء أي حجز بعد.'
              : 'Final price and availability will be confirmed by DIR3COM Core later. No booking has been submitted yet.'}
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={isRTL ? 'ابدأ الحجز' : 'Start booking'}
            onPress={() => onStartBooking(normalizedItemSlug)}
            style={styles.startBookingButton}
          >
            <Text style={styles.startBookingButtonText}>{isRTL ? 'ابدأ الحجز' : 'Start booking'}</Text>
          </TouchableOpacity>
        </DetailSection>
      </View>
    );
  })();

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={state.status === 'refreshing'} onRefresh={refresh} tintColor={colors.gold} />}
    >
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to Marketplace" onPress={onBack} style={styles.backButton}>
        <Text style={styles.backButtonText}>{isRTL ? 'العودة' : 'Back'}</Text>
      </TouchableOpacity>

      {body}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
    paddingBottom: 24,
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
  contentList: {
    gap: 12,
  },
  refreshText: {
    color: colors.light,
    textAlign: 'center',
  },
  heroCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.surface,
    padding: 16,
    gap: 8,
  },
  heroTitle: {
    color: colors.gold,
    fontSize: 22,
    fontWeight: '700',
  },
  heroSubtitle: {
    color: colors.light,
  },
  categoryLabel: {
    color: colors.light,
    opacity: 0.85,
    fontWeight: '600',
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.gold,
    color: colors.gold,
    paddingHorizontal: 10,
    paddingVertical: 5,
    overflow: 'hidden',
    fontWeight: '700',
  },
  imagePlaceholder: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.surfaceMuted,
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryImage: {
    width: '100%',
    height: 220,
    borderRadius: 16,
    backgroundColor: colors.surfaceMuted,
  },
  imagePlaceholderText: {
    color: colors.light,
    textAlign: 'center',
  },
  sectionCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.surface,
    padding: 16,
    gap: 8,
  },
  sectionTitle: {
    color: colors.gold,
    fontWeight: '700',
    fontSize: 16,
  },
  sectionText: {
    color: colors.light,
    lineHeight: 20,
  },
  galleryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  galleryImage: {
    width: 92,
    height: 92,
    borderRadius: 10,
    backgroundColor: colors.surfaceMuted,
  },
  startBookingButton: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: colors.gold,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 6,
  },
  startBookingButtonText: {
    color: colors.navy,
    fontWeight: '700',
  },
});
