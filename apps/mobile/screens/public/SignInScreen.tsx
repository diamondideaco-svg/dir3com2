import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocale } from '@/app/providers/LocaleProvider';
import { colors } from '@/constants/theme';
import { useSession } from '@/session/SessionProvider';

export function SignInScreen() {
  const { isRTL } = useLocale();
  const { signInMock } = useSession();

  return (
    <View style={styles.card}>
      <Text style={[styles.title, { textAlign: isRTL ? 'right' : 'left' }]}>Sign In</Text>
      <Text style={[styles.body, { textAlign: isRTL ? 'right' : 'left' }]}>Authentication flow boundary is ready for Supabase session integration in B2 Batch 2.</Text>
      <TouchableOpacity onPress={signInMock} style={styles.button}>
        <Text style={styles.buttonText}>{isRTL ? 'دخول تجريبي' : 'Mock Sign In'}</Text>
      </TouchableOpacity>
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
  button: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: colors.gold,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  buttonText: {
    color: colors.navy,
    fontWeight: '700',
  },
});
