import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useLocale } from '@/app/providers/LocaleProvider';
import { colors } from '@/constants/theme';
import { mobileApiClient } from '@/services/api/client';
import type { ServicesListResponse } from '@/services/api/contracts';

export function MarketplaceScreen() {
  const { isRTL } = useLocale();
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [count, setCount] = useState<number>(0);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const result = await mobileApiClient.get<ServicesListResponse>('/api/services?page=1&pageSize=6');
      if (!mounted) return;

      if (result.ok) {
        setCount(Array.isArray(result.data.services) ? result.data.services.length : 0);
        setStatus('ok');
        return;
      }

      setStatus('error');
    };

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <View style={styles.card}>
      <Text style={[styles.title, { textAlign: isRTL ? 'right' : 'left' }]}>Marketplace</Text>
      <Text style={[styles.body, { textAlign: isRTL ? 'right' : 'left' }]}>Consumes DIR3COM Core services endpoint using shared mobile API client contracts.</Text>
      {status === 'loading' ? <ActivityIndicator color={colors.gold} /> : null}
      {status === 'ok' ? <Text style={styles.metric}>{isRTL ? `نتائج مستلمة: ${count}` : `Fetched services: ${count}`}</Text> : null}
      {status === 'error' ? <Text style={styles.error}>{isRTL ? 'تعذر جلب الخدمات حالياً' : 'Unable to fetch services right now.'}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.surface,
    padding: 16,
    gap: 10,
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
  metric: {
    color: colors.light,
    fontWeight: '700',
  },
  error: {
    color: '#fca5a5',
    fontWeight: '600',
  },
});
