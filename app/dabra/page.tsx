import type { Metadata } from 'next';
import DabraChatCommerce from '@/components/dabra/DabraChatCommerce';

export const metadata: Metadata = {
  title: 'الدبرة | مساعد السفر الذكي',
  description: 'محادثة سفر واضحة مع الدبرة، من الفكرة إلى اختيار الرحلة.',
};

export default function DabraPage() {
  return <DabraChatCommerce />;
}
