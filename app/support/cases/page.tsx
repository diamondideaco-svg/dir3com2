import type { Metadata } from 'next';
import CustomerCasesPage from '@/components/public/CustomerCasesPage';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function Page() { return <CustomerCasesPage />; }
