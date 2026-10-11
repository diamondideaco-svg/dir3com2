'use client';

import Link from 'next/link';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import { languageDirection, type AppLanguage } from '@/lib/i18n/config';
import styles from './drive.module.css';

export default function DriveRequestReadError({ notificationLanguage }: { notificationLanguage?: AppLanguage }) {
  const preference = useLanguage();
  const language = notificationLanguage ?? preference.language;
  const ar = language === 'ar';
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return <section className={styles.page} lang={language} dir={languageDirection(language)}>
    <h1>{ar ? 'تعذر تحميل الطلب' : 'Unable to load your request'}</h1>
    <p role="alert">{ar
      ? 'لا يمكننا عرض حالة الطلب الآن. أعد المحاولة أو ارجع إلى طلباتك.'
      : 'We cannot show the request status right now. Try again or return to your requests.'}</p>
    <div className={styles.row} aria-busy={pending}>
      <button type="button" disabled={pending} onClick={() => startTransition(() => router.refresh())}>
        {pending ? (ar ? 'جارٍ تحميل الطلب…' : 'Loading your request…') : (ar ? 'إعادة المحاولة' : 'Try again')}
      </button>
      <Link href="/my-bookings" className={styles.button}>{ar ? 'العودة إلى طلباتي' : 'Back to my requests'}</Link>
    </div>
    {pending && <p role="status">{ar ? 'جارٍ تحميل الطلب…' : 'Loading your request…'}</p>}
  </section>;
}
