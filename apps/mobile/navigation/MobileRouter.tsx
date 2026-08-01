import { useMemo, useState } from 'react';
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocale } from '@/app/providers/LocaleProvider';
import { colors } from '@/constants/theme';
import { AUTH_ROUTES, PUBLIC_ROUTES } from '@/navigation/routes';
import type { RouteKey } from '@/navigation/types';
import { AccountScreen } from '@/screens/account/AccountScreen';
import { MyBookingsScreen } from '@/screens/account/MyBookingsScreen';
import { HomeScreen } from '@/screens/public/HomeScreen';
import { MarketplaceScreen } from '@/screens/public/MarketplaceScreen';
import { SignInScreen } from '@/screens/public/SignInScreen';
import { useSession } from '@/session/SessionProvider';

export function MobileRouter() {
  const { status, signOut } = useSession();
  const { isRTL } = useLocale();
  const initialRoute: RouteKey = status === 'authenticated' ? 'home' : 'signIn';
  const [activeRoute, setActiveRoute] = useState<RouteKey>(initialRoute);

  const routes = useMemo(() => (status === 'authenticated' ? AUTH_ROUTES : PUBLIC_ROUTES), [status]);

  const content = useMemo(() => {
    if (activeRoute === 'home') {
      return <HomeScreen />;
    }

    if (activeRoute === 'marketplace') {
      return <MarketplaceScreen />;
    }

    if (activeRoute === 'myBookings') {
      return <MyBookingsScreen />;
    }

    if (activeRoute === 'account') {
      return <AccountScreen onSignOut={signOut} />;
    }

    return <SignInScreen />;
  }, [activeRoute, signOut]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={[styles.title, { textAlign: isRTL ? 'right' : 'left' }]}>DIR3COM Mobile Shell</Text>
        <Text style={[styles.subtitle, { textAlign: isRTL ? 'right' : 'left' }]}>Session-aware navigation wired to shared core contracts.</Text>
      </View>

      <View style={styles.content}>{content}</View>

      <View style={[styles.tabBar, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        {routes.map((route) => {
          const isActive = route.key === activeRoute;

          return (
            <TouchableOpacity
              key={route.key}
              onPress={() => setActiveRoute(route.key)}
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
