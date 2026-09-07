'use client';
import Link from 'next/link';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import { Chrome } from './Chrome';
import styles from './v6.module.css';

export default function LoginSuccess({ destination }: { destination: string }) {
  const { language } = useLanguage(); const ar = language === 'ar';
  return <Chrome scene><section className={styles.welcome}>
    <div className={styles.welcomeCopy}><h1>{ar ? 'حياك الله…' : 'Welcome…'}</h1><h2>{ar ? 'تم تسجيل دخولك بنجاح' : 'You are signed in'}</h2><p>{ar ? 'يا هلا ومسهلا' : 'It is good to have you here'}</p><p>{ar ? 'ابدأ رحلتك أو انتقل إلى حسابك' : 'Start your journey or go to your account'}</p><p className={styles.welcomeSignature}>{ar ? 'أزهلني…' : 'Count on me…'}</p></div>
    <div className={styles.welcomeActions}><Link className={styles.primary} href="/marketplace">{ar ? 'ابدأ رحلتك' : 'Start your journey'}</Link><Link className={styles.secondary} href={destination}>{ar ? 'اذهب إلى حسابي' : 'Go to my account'}</Link></div>
  </section></Chrome>;
}
