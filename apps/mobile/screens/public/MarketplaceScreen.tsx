import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocale } from '@/app/providers/LocaleProvider';
import { MarketplaceCategoryCard } from '@/components/marketplace/MarketplaceCategoryCard';
import { EmptyState, ErrorState, LoadingState } from '@/components/ProtectedStates';
import { colors } from '@/constants/theme';
import { fetchMarketplaceCategories } from '@/services/api/public';
import { usePublicResource } from '@/services/api/public-resource';

type MarketplaceScreenProps = {
  onOpenCategory: (categorySlug: string) => void;
};

export function MarketplaceScreen({ onOpenCategory }: MarketplaceScreenProps) {
  const { isRTL } = useLocale();
  const { state, retry, refresh } = usePublicResource({
    load: (signal) => fetchMarketplaceCategories(signal),
    isEmpty: (data) => data.categories.length === 0,
  });

  const categories = state.data?.categories ?? [];

  const body = (() => {
    if (state.status === 'loading' || state.status === 'idle') {
      return (
        <LoadingState
          title={isRTL ? 'جارٍ تحميل الفئات' : 'Loading categories'}
          body={isRTL ? 'جاري تحميل فئات السوق العامة من منصة dir3com.' : 'Loading public marketplace categories from DIR3COM core APIs.'}
        />
      );
    }

    if (state.status === 'error') {
      return (
        <ErrorState
          title={isRTL ? 'تعذر تحميل الفئات' : 'Unable to load categories'}
          body={state.errorMessage ?? (isRTL ? 'حاول مرة أخرى بعد قليل.' : 'Please try again in a moment.')}
          actionLabel={isRTL ? 'إعادة المحاولة' : 'Retry'}
          onAction={retry}
        />
      );
    }

    if (state.status === 'empty') {
      return (
        <EmptyState
          title={isRTL ? 'لا توجد فئات حالياً' : 'No categories right now'}
          body={isRTL ? 'لا تتوفر فئات منشورة حالياً.' : 'No published marketplace categories are currently available.'}
          actionLabel={isRTL ? 'تحديث' : 'Refresh'}
          onAction={refresh}
        />
      );
    }

    return (
      <View style={styles.list}>
        {state.status === 'refreshing' ? <Text style={styles.refreshText}>{isRTL ? 'جارٍ التحديث...' : 'Refreshing...'}</Text> : null}
        {categories.map((category) => (
          <MarketplaceCategoryCard key={category.slug} category={category} onPress={() => onOpenCategory(category.slug)} />
        ))}
      </View>
    );
  })();

  return (
    <ScrollView
      contentContainerStyle={styles.card}
      refreshControl={<RefreshControl refreshing={state.status === 'refreshing'} onRefresh={refresh} tintColor={colors.gold} />}
    >
      <Text style={[styles.title, { textAlign: isRTL ? 'right' : 'left' }]}>Marketplace</Text>
      <Text style={[styles.body, { textAlign: isRTL ? 'right' : 'left' }]}>Browse public DIR3COM categories without sign-in and open customer-safe listings.</Text>
      {body}
    </ScrollView>
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
    paddingBottom: 24,
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
  list: {
    gap: 12,
  },
  refreshText: {
    color: colors.light,
    textAlign: 'center',
  },
});
