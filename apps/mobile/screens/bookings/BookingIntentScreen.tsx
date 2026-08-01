import { useMemo } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocale } from '@/app/providers/LocaleProvider';
import { EmptyState, ErrorState, LoadingState } from '@/components/ProtectedStates';
import { colors } from '@/constants/theme';
import { normalizeMarketplaceIdentifier } from '@/lib/marketplace';
import { fetchMarketplaceItemDetail } from '@/services/api/public';
import { usePublicResource } from '@/services/api/public-resource';
import { useSession } from '@/session/SessionProvider';
import type { MarketplaceItemDetail } from '@/types/domain';

type BookingIntentScreenProps = {
  itemSlug: string;
  onBack: () => void;
  onOpenMyBookings: () => void;
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

export function BookingIntentScreen({ itemSlug, onBack, onOpenMyBookings }: BookingIntentScreenProps) {
  const { isRTL } = useLocale();
  const { status, invalidateSession } = useSession();
  const normalizedItemSlug = normalizeMarketplaceIdentifier(itemSlug);

  const { state, retry, refresh } = usePublicResource({
    load: (signal) => fetchMarketplaceItemDetail(normalizedItemSlug ?? itemSlug, signal),
    isEmpty: () => false,
    reloadKey: normalizedItemSlug ?? itemSlug,
  });

  if (!normalizedItemSlug) {
    return (
      <View style={styles.container}>
        <EmptyState
          title={isRTL ? 'العنصر غير متاح' : 'Item unavailable'}
          body={isRTL ? 'تعذر فتح نية الحجز لهذا العنصر.' : 'Booking intent is unavailable for this item.'}
          actionLabel={isRTL ? 'العودة للسوق' : 'Back to Marketplace'}
          onAction={onBack}
        />
      </View>
    );
  }

  if (status !== 'authenticated') {
    return (
      <View style={styles.container}>
        <ErrorState
          title={isRTL ? 'انتهت الجلسة' : 'Session expired'}
          body={isRTL ? 'يرجى تسجيل الدخول مرة أخرى لمتابعة نية الحجز.' : 'Please sign in again to continue booking intent.'}
          actionLabel={isRTL ? 'تسجيل الدخول' : 'Sign In'}
          onAction={() => void invalidateSession({ key: 'bookingIntent', itemSlug: normalizedItemSlug })}
        />
      </View>
    );
  }

  const item = state.data?.item ?? null;
  const title = useMemo(() => item?.nameEn ?? item?.nameAr ?? normalizedItemSlug, [item, normalizedItemSlug]);
  const categoryLabel = useMemo(() => item?.categoryNameEn ?? item?.categoryNameAr ?? null, [item]);
  const priceLabel = useMemo(() => (item ? formatPrice(item) : null), [item]);

  const body = (() => {
    if (state.status === 'loading' || state.status === 'idle') {
      return (
        <LoadingState
          title={isRTL ? 'جارٍ تحميل نية الحجز' : 'Loading booking intent'}
          body={
            isRTL
              ? 'جاري تحميل تفاصيل العنصر من واجهات DIR3COM Core العامة.'
              : 'Loading item detail from public DIR3COM Core APIs.'
          }
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
          title={isRTL ? 'تعذر تحميل نية الحجز' : 'Unable to load booking intent'}
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
          body={isRTL ? 'لا تتوفر بيانات كافية لعرض نية الحجز.' : 'Not enough item data is available for booking intent.'}
          actionLabel={isRTL ? 'العودة للسوق' : 'Back to Marketplace'}
          onAction={onBack}
        />
      );
    }

    return (
      <View style={styles.contentList}>
        {state.status === 'refreshing' ? <Text style={styles.refreshText}>{isRTL ? 'جارٍ التحديث...' : 'Refreshing...'}</Text> : null}

        <View style={styles.card}>
          <Text style={styles.heading}>{isRTL ? 'نية الحجز' : 'Booking Intent'}</Text>
          <Text style={styles.itemName}>{title}</Text>
          {categoryLabel ? <Text style={styles.metaText}>{isRTL ? `الفئة: ${categoryLabel}` : `Category: ${categoryLabel}`}</Text> : null}
          {item.city ? <Text style={styles.metaText}>{isRTL ? `المدينة: ${item.city}` : `City: ${item.city}`}</Text> : null}
          {priceLabel ? <Text style={styles.metaText}>{isRTL ? `السعر يبدأ من: ${priceLabel}` : `Starting price: ${priceLabel}`}</Text> : null}
        </View>

        <View style={styles.noticeCard}>
          <Text style={styles.noticeTitle}>{isRTL ? 'ملاحظة مهمة' : 'Important boundary notice'}</Text>
          <Text style={styles.noticeText}>
            {isRTL
              ? 'السعر المعروض معلوماتي فقط وقد يتغير عند التأكيد النهائي من DIR3COM Core.'
              : 'Displayed price is informational only and may change after final DIR3COM Core confirmation.'}
          </Text>
          <Text style={styles.noticeText}>
            {isRTL
              ? 'التوفر لم يتم تأكيده بعد، ولم يتم إرسال أي طلب إنشاء حجز.'
              : 'Availability is not confirmed yet, and no booking creation request has been submitted.'}
          </Text>
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity accessibilityRole="button" onPress={onBack} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>{isRTL ? 'العودة للعنصر' : 'Back to Item'}</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" onPress={onOpenMyBookings} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>{isRTL ? 'حجوزاتي' : 'My Bookings'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  })();

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={state.status === 'refreshing'} onRefresh={refresh} tintColor={colors.gold} />}
    >
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={styles.backButton}>
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
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.surface,
    padding: 16,
    gap: 8,
  },
  heading: {
    color: colors.gold,
    fontSize: 20,
    fontWeight: '700',
  },
  itemName: {
    color: colors.light,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
  },
  metaText: {
    color: colors.light,
    lineHeight: 20,
  },
  noticeCard: {
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: 16,
    backgroundColor: colors.surface,
    padding: 16,
    gap: 8,
  },
  noticeTitle: {
    color: colors.gold,
    fontSize: 16,
    fontWeight: '700',
  },
  noticeText: {
    color: colors.light,
    lineHeight: 20,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
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
