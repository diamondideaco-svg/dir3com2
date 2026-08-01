import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useLocale } from '@/app/providers/LocaleProvider';
import { MarketplaceItemCard } from '@/components/marketplace/MarketplaceItemCard';
import { EmptyState, ErrorState, LoadingState } from '@/components/ProtectedStates';
import { colors } from '@/constants/theme';
import { normalizeMarketplaceIdentifier, normalizeMarketplaceSearchQuery } from '@/lib/marketplace';
import { fetchMarketplaceItems } from '@/services/api/public';
import { usePublicResource } from '@/services/api/public-resource';

type MarketplaceCategoryScreenProps = {
  categorySlug: string;
  onBack: () => void;
  onOpenItem: (itemSlug: string) => void;
};

export function MarketplaceCategoryScreen({ categorySlug, onBack, onOpenItem }: MarketplaceCategoryScreenProps) {
  const { isRTL } = useLocale();
  const normalizedCategory = normalizeMarketplaceIdentifier(categorySlug);
  const [searchDraft, setSearchDraft] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState<string | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);

  const normalizedSubmittedSearch = useMemo(() => normalizeMarketplaceSearchQuery(submittedSearch).value, [submittedSearch]);
  const reloadKey = `${normalizedCategory ?? categorySlug}|${normalizedSubmittedSearch ?? ''}`;

  const { state, retry, refresh } = usePublicResource({
    load: (signal) =>
      fetchMarketplaceItems(
        {
          category: normalizedCategory ?? categorySlug,
          query: normalizedSubmittedSearch,
        },
        signal
      ),
    isEmpty: (data) => data.items.length === 0,
    reloadKey,
  });

  if (!normalizedCategory) {
    return (
      <View style={styles.container}>
        <EmptyState
          title={isRTL ? 'فئة غير متاحة' : 'Category unavailable'}
          body={isRTL ? 'تعذر فتح هذه الفئة.' : 'This category could not be opened.'}
          actionLabel={isRTL ? 'العودة للسوق' : 'Back to Marketplace'}
          onAction={onBack}
        />
      </View>
    );
  }

  const items = state.data?.items ?? [];
  const categoryLabel = state.data?.category?.nameEn ?? normalizedCategory;

  const submitSearch = () => {
    const normalized = normalizeMarketplaceSearchQuery(searchDraft);

    if (normalized.error) {
      setInputError(normalized.error);
      return;
    }

    setInputError(null);
    setSubmittedSearch(normalized.value);
    setSearchDraft(normalized.value ?? '');
  };

  const resetSearch = () => {
    setInputError(null);
    setSearchDraft('');
    setSubmittedSearch(null);
  };

  const body = (() => {
    if (state.status === 'loading' || state.status === 'idle') {
      return (
        <LoadingState
          title={isRTL ? 'جارٍ تحميل العناصر' : 'Loading items'}
          body={isRTL ? 'جاري تحميل عناصر هذه الفئة من واجهات dir3com العامة.' : 'Loading public marketplace items from DIR3COM core APIs.'}
        />
      );
    }

    if (state.status === 'error') {
      return (
        <ErrorState
          title={isRTL ? 'تعذر تحميل العناصر' : 'Unable to load items'}
          body={state.errorMessage ?? (isRTL ? 'حاول مرة أخرى بعد قليل.' : 'Please try again in a moment.')}
          actionLabel={isRTL ? 'إعادة المحاولة' : 'Retry'}
          onAction={retry}
        />
      );
    }

    if (state.status === 'empty') {
      return (
        <EmptyState
          title={isRTL ? 'لا توجد عناصر حالياً' : 'No items right now'}
          body={isRTL ? 'لا تتوفر عناصر منشورة في هذه الفئة حالياً.' : 'No published items are currently available in this category.'}
          actionLabel={isRTL ? 'تحديث' : 'Refresh'}
          onAction={refresh}
        />
      );
    }

    return (
      <View style={styles.list}>
        {state.status === 'refreshing' ? <Text style={styles.refreshText}>{isRTL ? 'جارٍ التحديث...' : 'Refreshing...'}</Text> : null}
        {items.map((item) => (
          <MarketplaceItemCard key={item.id} item={item} onPress={() => onOpenItem(item.slug)} />
        ))}
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

      <Text style={[styles.title, { textAlign: isRTL ? 'right' : 'left' }]}>{categoryLabel}</Text>
      <Text style={[styles.body, { textAlign: isRTL ? 'right' : 'left' }]}>
        {isRTL ? 'تصفح العناصر المتاحة للنشر العام فقط.' : 'Browse items that are available for public marketplace listing.'}
      </Text>

      <View style={styles.searchPanel}>
        <TextInput
          accessibilityLabel="Search marketplace items"
          placeholder={isRTL ? 'ابحث باسم الخدمة' : 'Search by item name'}
          placeholderTextColor={colors.light}
          value={searchDraft}
          onChangeText={setSearchDraft}
          style={styles.searchInput}
          returnKeyType="search"
          onSubmitEditing={submitSearch}
        />
        <View style={styles.searchActions}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Submit search" onPress={submitSearch} style={styles.searchButton}>
            <Text style={styles.searchButtonText}>{isRTL ? 'بحث' : 'Search'}</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Reset search" onPress={resetSearch} style={styles.resetButton}>
            <Text style={styles.resetButtonText}>{isRTL ? 'إعادة ضبط' : 'Reset'}</Text>
          </TouchableOpacity>
        </View>
        {normalizedSubmittedSearch ? (
          <Text style={styles.searchIndicator}>{isRTL ? `تصفية فعالة: ${normalizedSubmittedSearch}` : `Active filter: ${normalizedSubmittedSearch}`}</Text>
        ) : null}
        {inputError ? <Text style={styles.searchError}>{inputError}</Text> : null}
      </View>

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
  searchPanel: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.surface,
    padding: 12,
    gap: 10,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
    color: colors.light,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchActions: {
    flexDirection: 'row',
    gap: 8,
  },
  searchButton: {
    borderRadius: 999,
    backgroundColor: colors.gold,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchButtonText: {
    color: colors.navy,
    fontWeight: '700',
  },
  resetButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.gold,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  resetButtonText: {
    color: colors.gold,
    fontWeight: '700',
  },
  searchIndicator: {
    color: colors.light,
    fontWeight: '600',
  },
  searchError: {
    color: '#fca5a5',
    fontWeight: '600',
  },
});
