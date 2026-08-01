import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocale } from '@/app/providers/LocaleProvider';
import { BookingCard } from '@/components/BookingCard';
import { EmptyState, ErrorState, LoadingState } from '@/components/ProtectedStates';
import { colors } from '@/constants/theme';
import { fetchMyBookings } from '@/services/api/authenticated';
import { useProtectedResource } from '@/services/api/protected-resource';
import { useSession } from '@/session/SessionProvider';

export function MyBookingsScreen() {
  const { isRTL } = useLocale();
  const { getAccessToken, invalidateSession } = useSession();

  const { state, retry, refresh } = useProtectedResource({
    routeKey: 'myBookings',
    load: (signal) => fetchMyBookings(getAccessToken, signal),
    isEmpty: (data) => data.bookings.length === 0,
    onUnauthorized: (routeKey) => {
      void invalidateSession(routeKey);
    },
  });

  const bookings = state.data?.bookings ?? [];

  const body = (() => {
    if (state.status === 'loading' || state.status === 'idle') {
      return (
        <LoadingState
          title={isRTL ? 'جارٍ تحميل الحجوزات' : 'Loading bookings'}
          body={isRTL ? 'يتم الآن تحميل حجوزاتك من منصة dir3com الأساسية.' : 'We are loading your bookings from the shared DIR3COM core platform.'}
        />
      );
    }

    if (state.status === 'error') {
      return (
        <ErrorState
          title={isRTL ? 'تعذر تحميل الحجوزات' : 'Unable to load bookings'}
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
          title={isRTL ? 'لا توجد حجوزات حتى الآن' : 'No bookings yet'}
          body={isRTL ? 'ستظهر حجوزاتك المؤكدة هنا عند توفرها.' : 'Your DIR3COM bookings will appear here when they become available.'}
          actionLabel={isRTL ? 'تحديث' : 'Refresh'}
          onAction={refresh}
        />
      );
    }

    return (
      <View style={styles.list}>
        {state.status === 'refreshing' ? <Text style={styles.refreshText}>{isRTL ? 'جارٍ التحديث...' : 'Refreshing...'}</Text> : null}
        {bookings.map((booking) => (
          <BookingCard key={booking.id} booking={booking} />
        ))}
      </View>
    );
  })();

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={state.status === 'refreshing'} onRefresh={refresh} tintColor={colors.gold} />}
    >
      <Text style={[styles.title, { textAlign: isRTL ? 'right' : 'left' }]}>My Bookings</Text>
      <Text style={[styles.body, { textAlign: isRTL ? 'right' : 'left' }]}>
        {isRTL ? 'راجع حجوزاتك من خلال واجهات dir3com الأساسية المشتركة.' : 'Review your bookings through the shared DIR3COM core APIs.'}
      </Text>

      {body}
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
  list: {
    gap: 12,
  },
  refreshText: {
    color: colors.light,
    textAlign: 'center',
  },
});
