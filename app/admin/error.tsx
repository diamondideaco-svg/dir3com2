'use client';

import { useEffect } from 'react';
import { AdminText } from '@/components/admin/AdminLocale';

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('admin.route.error', error); }, [error]);

  return (
    <section className="mx-auto my-6 w-full max-w-3xl rounded-[1.5rem] border border-red-200 bg-red-50 p-5 text-red-900 shadow-sm" role="alert">
      <h1 className="text-lg font-semibold"><AdminText ar="تعذر إكمال الإجراء" en="The admin action could not be completed" /></h1>
      <p className="mt-2 text-sm leading-6 text-red-800"><AdminText ar="لم نعرض نجاحًا أو بيانات بديلة. راجع الرسالة الظاهرة في الصفحة أو حاول مرة أخرى." en="No success or fallback data is shown. Review the page feedback or try again." /></p>
      <button type="button" onClick={reset} className="mt-4 min-h-11 rounded-full border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-900">
        <AdminText ar="إعادة المحاولة" en="Try again" />
      </button>
    </section>
  );
}
