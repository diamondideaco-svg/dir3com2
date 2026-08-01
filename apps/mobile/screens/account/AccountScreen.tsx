import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocale } from '@/app/providers/LocaleProvider';
import { AccountSummaryCard } from '@/components/AccountSummaryCard';
import { EmptyState, ErrorState, LoadingState } from '@/components/ProtectedStates';
import { colors } from '@/constants/theme';
import { fetchMyAccount } from '@/services/api/authenticated';
import { useProtectedResource } from '@/services/api/protected-resource';
import { useSession } from '@/session/SessionProvider';

export function AccountScreen() {
  const { isRTL, locale, setLocale } = useLocale();
  const { signOut, authBusy, authActionError, getAccessToken, invalidateSession } = useSession();

  const { state, retry, refresh } = useProtectedResource({
    routeKey: 'account',
    load: (signal) => fetchMyAccount(getAccessToken, signal),
    isEmpty: (data) => !data.account || (!data.account.fullName && !data.account.email && !data.account.phone),
    onUnauthorized: (routeKey) => {
      void invalidateSession(routeKey);
    },
  });

  const summary = (() => {
    if (state.status === 'loading' || state.status === 'idle') {
      return (
        <LoadingState
          title={isRTL ? 'جارٍ تحميل الحساب' : 'Loading account'}
          body={isRTL ? 'يتم الآن تحميل بيانات حسابك الآمنة.' : 'We are loading your customer-safe account details.'}
        />
      );
    }

    if (state.status === 'error') {
      return (
        <ErrorState
          title={isRTL ? 'تعذر تحميل الحساب' : 'Unable to load account'}
          body={state.errorMessage ?? (isRTL ? 'حاول مرة أخرى بعد قليل.' : 'Please try again in a moment.')}
          actionLabel={isRTL ? 'إعادة المحاولة' : 'Retry'}
          onAction={retry}
        />
      );
    }

    if (state.status === 'unauthorized') {
      return (
        <ErrorState
          title={isRTL ? 'انتهت الجلسة' : 'Session expired'}
          body={state.errorMessage ?? (isRTL ? 'يرجى تسجيل الدخول من جديد.' : 'Please sign in again to continue.')}
        />
      );
    }

    if (state.status === 'empty') {
      return (
        <EmptyState
          title={isRTL ? 'الملف غير مكتمل' : 'Profile incomplete'}
          body={isRTL ? 'لم نجد بعد بيانات حساب كافية لعرضها هنا.' : 'We could not find enough customer profile data to show here yet.'}
          actionLabel={isRTL ? 'تحديث' : 'Refresh'}
          onAction={refresh}
        />
      );
    }

    return (
      <View style={styles.summaryWrap}>
        {state.status === 'refreshing' ? <Text style={styles.refreshText}>{isRTL ? 'جارٍ التحديث...' : 'Refreshing...'}</Text> : null}
        {state.data?.account ? <AccountSummaryCard account={state.data.account} /> : null}
      </View>
    );
  })();

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={state.status === 'refreshing'} onRefresh={refresh} tintColor={colors.gold} />}
    >
      <Text style={[styles.title, { textAlign: isRTL ? 'right' : 'left' }]}>Account</Text>
      <Text style={[styles.body, { textAlign: isRTL ? 'right' : 'left' }]}>Locale and direction architecture remains ready for Arabic and English expansion.</Text>

      {summary}

      <View style={[styles.row, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <TouchableOpacity
          style={[styles.secondaryButton, locale === 'ar' && styles.secondaryButtonActive]}
          onPress={() => setLocale('ar')}
        >
          <Text style={[styles.secondaryButtonText, locale === 'ar' && styles.secondaryButtonTextActive]}>AR</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.secondaryButton, locale === 'en' && styles.secondaryButtonActive]}
          onPress={() => setLocale('en')}
        >
          <Text style={[styles.secondaryButtonText, locale === 'en' && styles.secondaryButtonTextActive]}>EN</Text>
        </TouchableOpacity>
      </View>

      {authActionError ? <Text style={styles.errorText}>{authActionError}</Text> : null}

      <TouchableOpacity onPress={() => void signOut()} style={styles.primaryButton} disabled={authBusy}>
        <Text style={styles.primaryButtonText}>{authBusy ? (isRTL ? 'جارٍ الخروج...' : 'Signing out...') : (isRTL ? 'تسجيل الخروج' : 'Sign Out')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
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
  row: {
    gap: 8,
  },
  summaryWrap: {
    gap: 8,
  },
  refreshText: {
    color: colors.light,
    textAlign: 'center',
  },
  secondaryButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.surfaceMuted,
  },
  secondaryButtonActive: {
    backgroundColor: colors.gold,
    borderColor: colors.gold,
  },
  secondaryButtonText: {
    color: colors.light,
    fontWeight: '700',
  },
  secondaryButtonTextActive: {
    color: colors.navy,
  },
  errorText: {
    color: '#fca5a5',
    fontWeight: '600',
  },
  primaryButton: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: colors.gold,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primaryButtonText: {
    color: colors.navy,
    fontWeight: '700',
  },
});
