import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PlaceholderScreen } from '@/components/PlaceholderScreen';
import { colors } from '@/constants/theme';

export default function RootApp() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>dir3com Mobile</Text>
          <Text style={styles.subtitle}>DEV-B foundation is ready for auth, marketplace, booking, and account flows.</Text>
        </View>
        <PlaceholderScreen />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.navy,
  },
  content: {
    padding: 24,
    gap: 18,
  },
  header: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.surface,
    padding: 16,
  },
  title: {
    color: colors.gold,
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 8,
    color: colors.light,
    fontSize: 14,
    lineHeight: 20,
  },
});
