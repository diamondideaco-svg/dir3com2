'use client';

import { useEffect } from 'react';
import { AdminText } from '@/components/admin/AdminLocale';

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('admin.route.error', error); }, [error]);
  return <section className="rounded-2xl border border-red-400/35 bg-red-500/10 p-6 text-red-100" role="alert"><h1 className="text-lg font-semibold"><AdminText ar="تعذر تحميل صفحة الإدارة" en="The admin page could not be loaded" /></h1><p className="mt-2 text-sm"><AdminText ar="لم نعرض بيانات فارغة بديلة. حاول مرة أخرى." en="No fallback empty data is shown. Please try again." /></p><button type="button" onClick={reset} className="mt-4 rounded-full border border-current px-4 py-2 text-sm font-semibold"><AdminText ar="إعادة المحاولة" en="Try again" /></button></section>;
}
