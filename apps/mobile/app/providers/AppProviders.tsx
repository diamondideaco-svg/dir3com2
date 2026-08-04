import { ReactNode } from 'react';
import { LocaleProvider } from './LocaleProvider';
import { SessionProvider } from '../../session/SessionProvider';

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <LocaleProvider>
      <SessionProvider>{children}</SessionProvider>
    </LocaleProvider>
  );
}
