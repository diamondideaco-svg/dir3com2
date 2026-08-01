import { useEffect, useMemo, useState } from 'react';
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocale } from '@/app/providers/LocaleProvider';
import { normalizeBookingIdentifier } from '@/lib/bookings';
import { colors } from '@/constants/theme';
import { isProtectedRoute, resolveRouteForSession } from '@/navigation/guards';
import { AUTH_ROUTES, PUBLIC_ROUTES } from '@/navigation/routes';
import type { RouteDestination } from '@/navigation/types';
import { AccountScreen } from '@/screens/account/AccountScreen';
import { MyBookingsScreen } from '@/screens/account/MyBookingsScreen';
import { BookingDetailScreen } from '@/screens/bookings/BookingDetailScreen';
import { HomeScreen } from '@/screens/public/HomeScreen';
import { MarketplaceScreen } from '@/screens/public/MarketplaceScreen';
import { SignInScreen } from '@/screens/public/SignInScreen';
import { useSession } from '@/session/SessionProvider';

export function MobileRouter() {
  const { status, pendingRoute, setPendingRoute } = useSession();
  const { isRTL } = useLocale();
  const initialRoute = resolveRouteForSession(pendingRoute ?? { key: status === 'authenticated' ? 'home' : 'signIn' }, status);
  const [activeRoute, setActiveRoute] = useState<RouteDestination>(initialRoute);

  useEffect(() => {
    if (pendingRoute) {
      setActiveRoute(resolveRouteForSession(pendingRoute, status));

      if (status === 'authenticated' || !isProtectedRoute(pendingRoute)) {
        setPendingRoute(null);
      }

      return;
    }

    setActiveRoute((previous) => resolveRouteForSession(previous, status));
  }, [pendingRoute, setPendingRoute, status]);

  const routes = useMemo(() => (status === 'authenticated' ? AUTH_ROUTES : PUBLIC_ROUTES), [status]);
  const resolvedActiveRoute = resolveRouteForSession(activeRoute, status);

  const navigateToBookingDetail = (bookingId: string) => {
    const normalizedBookingId = normalizeBookingIdentifier(bookingId);
    if (!normalizedBookingId) {
      setActiveRoute({ key: 'myBookings' });
      return;
    }

    setActiveRoute(resolveRouteForSession({ key: 'bookingDetail', bookingId: normalizedBookingId }, status));
  };

  const content = useMemo(() => {
    if (resolvedActiveRoute.key === 'home') {
      return <HomeScreen />;
    }

    if (resolvedActiveRoute.key === 'marketplace') {
      return <MarketplaceScreen />;
    }

    if (resolvedActiveRoute.key === 'myBookings') {
      return <MyBookingsScreen onOpenBooking={navigateToBookingDetail} />;
    }

    if (resolvedActiveRoute.key === 'bookingDetail') {
      return <BookingDetailScreen bookingId={resolvedActiveRoute.bookingId} onBack={() => setActiveRoute({ key: 'myBookings' })} />;
    }

    if (resolvedActiveRoute.key === 'account') {
      return <AccountScreen />;
    }

    return <SignInScreen />;
  }, [resolvedActiveRoute, status]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={[styles.title, { textAlign: isRTL ? 'right' : 'left' }]}>DIR3COM Mobile Shell</Text>
        <Text style={[styles.subtitle, { textAlign: isRTL ? 'right' : 'left' }]}>Session-aware navigation wired to shared core contracts.</Text>
      </View>

      <View style={styles.content}>{content}</View>

      <View style={[styles.tabBar, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        {routes.map((route) => {
          const isActive = route.key === resolvedActiveRoute.key || (resolvedActiveRoute.key === 'bookingDetail' && route.key === 'myBookings');

          return (
            <TouchableOpacity
              key={route.key}
              onPress={() => setActiveRoute(resolveRouteForSession({ key: route.key }, status))}
              style={[styles.tab, isActive && styles.tabActive]}
            >
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{isRTL ? route.labelAr : route.labelEn}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.navy,
  },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
  },
  title: {
    color: colors.gold,
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 6,
    color: colors.light,
    opacity: 0.9,
    fontSize: 13,
    lineHeight: 18,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  tabBar: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  tab: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  tabActive: {
    backgroundColor: colors.gold,
    borderColor: colors.gold,
  },
  tabText: {
    color: colors.light,
    fontSize: 12,
    fontWeight: '600',
  },
  tabTextActive: {
    color: colors.navy,
  },
});
