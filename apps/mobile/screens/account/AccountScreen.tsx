import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocale } from '@/app/providers/LocaleProvider';
import { colors } from '@/constants/theme';
import { useSession } from '@/session/SessionProvider';

export function AccountScreen() {
  const { isRTL, locale, setLocale } = useLocale();
  const { signOut, authBusy, authActionError } = useSession();

  return (
    <View style={styles.card}>
      <Text style={[styles.title, { textAlign: isRTL ? 'right' : 'left' }]}>Account</Text>
      <Text style={[styles.body, { textAlign: isRTL ? 'right' : 'left' }]}>Locale and direction architecture is ready for Arabic/English expansion.</Text>

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
  row: {
    gap: 8,
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
