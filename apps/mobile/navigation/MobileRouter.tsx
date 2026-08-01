import { useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocale } from '@/app/providers/LocaleProvider';
import { normalizeBookingIdentifier } from '@/lib/bookings';
import { normalizeMarketplaceIdentifier } from '@/lib/marketplace';
import { colors } from '@/constants/theme';
import { isProtectedRoute, resolveRouteForSession } from '@/navigation/guards';
import { AUTH_ROUTES, PUBLIC_ROUTES } from '@/navigation/routes';
import type { RouteDestination } from '@/navigation/types';
import { AccountScreen } from '@/screens/account/AccountScreen';
import { MyBookingsScreen } from '@/screens/account/MyBookingsScreen';
import { BookingDetailScreen } from '@/screens/bookings/BookingDetailScreen';
import { BookingIntentScreen } from '@/screens/bookings/BookingIntentScreen';
import { MarketplaceCategoryScreen } from '@/screens/marketplace/MarketplaceCategoryScreen';
import { MarketplaceItemDetailScreen } from '@/screens/marketplace/MarketplaceItemDetailScreen';
import { HomeScreen } from '@/screens/public/HomeScreen';
import { MarketplaceScreen } from '@/screens/public/MarketplaceScreen';
import { SignInScreen } from '@/screens/public/SignInScreen';
import { useSession } from '@/session/SessionProvider';

export function MobileRouter() {
  const { status, pendingRoute, setPendingRoute } = useSession();
  const { isRTL } = useLocale();
  const initialRoute = resolveRouteForSession(pendingRoute ?? { key: 'home' }, status);
  const [activeRoute, setActiveRoute] = useState<RouteDestination>(initialRoute);
  const suppressProtectedPendingRef = useRef(false);

  useEffect(() => {
    if (pendingRoute) {
      if (suppressProtectedPendingRef.current && isProtectedRoute(pendingRoute)) {
        return;
      }

      setActiveRoute(resolveRouteForSession(pendingRoute, status));

      if (status === 'authenticated' || !isProtectedRoute(pendingRoute)) {
        setPendingRoute(null);
      }

      return;
    }

    suppressProtectedPendingRef.current = false;

    setActiveRoute((previous) => resolveRouteForSession(previous, status));
  }, [pendingRoute, setPendingRoute, status]);

  const routes = useMemo(() => (status === 'authenticated' ? AUTH_ROUTES : PUBLIC_ROUTES), [status]);
  const resolvedActiveRoute = resolveRouteForSession(activeRoute, status);

  const navigateToRoute = (route: RouteDestination, options?: { clearProtectedPendingOnPublic?: boolean }) => {
    const isPublicRoute = !isProtectedRoute(route);
    const clearProtectedPendingOnPublic = options?.clearProtectedPendingOnPublic ?? isPublicRoute;

    if (clearProtectedPendingOnPublic && pendingRoute && isProtectedRoute(pendingRoute) && isPublicRoute) {
      suppressProtectedPendingRef.current = true;
      setPendingRoute(null);
    }

    setActiveRoute(resolveRouteForSession(route, status));
  };

  const navigateToBookingDetail = (bookingId: string) => {
    const normalizedBookingId = normalizeBookingIdentifier(bookingId);
    if (!normalizedBookingId) {
      navigateToRoute({ key: 'myBookings' });
      return;
    }

    navigateToRoute({ key: 'bookingDetail', bookingId: normalizedBookingId });
  };

  const navigateToMarketplaceCategory = (categorySlug: string) => {
    const normalizedCategory = normalizeMarketplaceIdentifier(categorySlug);
    if (!normalizedCategory) {
      navigateToRoute({ key: 'marketplace' });
      return;
    }

    navigateToRoute({ key: 'marketplaceCategory', categorySlug: normalizedCategory });
  };

  const navigateToMarketplaceItem = (itemSlug: string) => {
    const normalizedItemSlug = normalizeMarketplaceIdentifier(itemSlug);
    if (!normalizedItemSlug) {
      navigateToRoute({ key: 'marketplace' });
      return;
    }

    navigateToRoute({ key: 'marketplaceItem', itemSlug: normalizedItemSlug });
  };

  const navigateToBookingIntent = (itemSlug: string) => {
    const normalizedItemSlug = normalizeMarketplaceIdentifier(itemSlug);
    if (!normalizedItemSlug) {
      navigateToRoute({ key: 'marketplace' });
      return;
    }

    const destination: RouteDestination = { key: 'bookingIntent', itemSlug: normalizedItemSlug };

    if (status === 'authenticated') {
      navigateToRoute(destination);
      return;
    }

    setPendingRoute(destination);
    navigateToRoute({ key: 'signIn' }, { clearProtectedPendingOnPublic: false });
  };

  const content = useMemo(() => {
    if (resolvedActiveRoute.key === 'home') {
      return <HomeScreen />;
    }

    if (resolvedActiveRoute.key === 'marketplace') {
      return <MarketplaceScreen onOpenCategory={navigateToMarketplaceCategory} />;
    }

    if (resolvedActiveRoute.key === 'marketplaceCategory') {
      return (
        <MarketplaceCategoryScreen
          categorySlug={resolvedActiveRoute.categorySlug}
          onBack={() => navigateToRoute({ key: 'marketplace' })}
          onOpenItem={navigateToMarketplaceItem}
        />
      );
    }

    if (resolvedActiveRoute.key === 'marketplaceItem') {
      return (
        <MarketplaceItemDetailScreen
          itemSlug={resolvedActiveRoute.itemSlug}
          onBack={() => navigateToRoute({ key: 'marketplace' })}
          onStartBooking={navigateToBookingIntent}
        />
      );
    }

    if (resolvedActiveRoute.key === 'bookingIntent') {
      return (
        <BookingIntentScreen
          itemSlug={resolvedActiveRoute.itemSlug}
          onBack={() => navigateToRoute({ key: 'marketplaceItem', itemSlug: resolvedActiveRoute.itemSlug })}
          onOpenMyBookings={() => navigateToRoute({ key: 'myBookings' })}
        />
      );
    }

    if (resolvedActiveRoute.key === 'myBookings') {
      return <MyBookingsScreen onOpenBooking={navigateToBookingDetail} />;
    }

    if (resolvedActiveRoute.key === 'bookingDetail') {
      return <BookingDetailScreen bookingId={resolvedActiveRoute.bookingId} onBack={() => navigateToRoute({ key: 'myBookings' })} />;
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

      <View style={styles.content} pointerEvents="box-none">{content}</View>

      <View style={[styles.tabBar, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        {routes.map((route) => {
          const isActive =
            route.key === resolvedActiveRoute.key ||
            (resolvedActiveRoute.key === 'bookingDetail' && route.key === 'myBookings') ||
            (resolvedActiveRoute.key === 'bookingIntent' && route.key === 'marketplace') ||
            (resolvedActiveRoute.key === 'marketplaceCategory' && route.key === 'marketplace') ||
            (resolvedActiveRoute.key === 'marketplaceItem' && route.key === 'marketplace');

          return (
            <TouchableOpacity
              key={route.key}
              onPress={() => navigateToRoute({ key: route.key })}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
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
    zIndex: 20,
    elevation: 20,
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
