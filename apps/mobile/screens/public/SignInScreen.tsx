import { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useLocale } from '@/app/providers/LocaleProvider';
import { colors } from '@/constants/theme';
import { useSession } from '@/session/SessionProvider';

export function SignInScreen() {
  const { isRTL } = useLocale();
  const { signIn, authBusy, authActionError } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSignIn = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail.includes('@') || trimmedEmail.length < 5) {
      setLocalError(isRTL ? 'يرجى إدخال بريد إلكتروني صالح.' : 'Please enter a valid email address.');
      return;
    }

    if (password.length < 6) {
      setLocalError(isRTL ? 'كلمة المرور يجب أن تكون 6 أحرف على الأقل.' : 'Password must be at least 6 characters.');
      return;
    }

    setLocalError(null);
    await signIn({ email: trimmedEmail, password });
  };

  return (
    <View style={styles.card}>
      <Text style={[styles.title, { textAlign: isRTL ? 'right' : 'left' }]}>Sign In</Text>
      <Text style={[styles.body, { textAlign: isRTL ? 'right' : 'left' }]}>Use your DIR3COM account to open authenticated mobile routes.</Text>

      <TextInput
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        textAlign={isRTL ? 'right' : 'left'}
        placeholder={isRTL ? 'البريد الإلكتروني' : 'Email'}
        placeholderTextColor="rgba(244,241,232,0.55)"
        style={styles.input}
      />

      <TextInput
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textAlign={isRTL ? 'right' : 'left'}
        placeholder={isRTL ? 'كلمة المرور' : 'Password'}
        placeholderTextColor="rgba(244,241,232,0.55)"
        style={styles.input}
      />

      {localError ? <Text style={styles.errorText}>{localError}</Text> : null}
      {authActionError ? <Text style={styles.errorText}>{authActionError}</Text> : null}

      <TouchableOpacity onPress={() => void handleSignIn()} style={styles.button} disabled={authBusy}>
        <Text style={styles.buttonText}>{authBusy ? (isRTL ? 'جارٍ الدخول...' : 'Signing in...') : (isRTL ? 'تسجيل الدخول' : 'Sign In')}</Text>
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
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.light,
    backgroundColor: colors.surfaceMuted,
  },
  errorText: {
    color: '#fca5a5',
    fontWeight: '600',
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
