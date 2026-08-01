import 'react-native-url-polyfill/auto';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { AppProviders } from '@/app/providers/AppProviders';
import { SessionBoundary } from '@/session/SessionBoundary';
import { colors } from '@/constants/theme';

export default function App() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.navy }}>
      <StatusBar style="light" />
      <AppErrorBoundary>
        <AppProviders>
          <SessionBoundary />
        </AppProviders>
      </AppErrorBoundary>
    </View>
  );
}
