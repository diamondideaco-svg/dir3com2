'use client';

import Link from 'next/link';
import { FiCalendar, FiCreditCard, FiFileText, FiHeart, FiHome, FiStar, FiBriefcase, FiTruck, FiSend } from 'react-icons/fi';
import MarketplaceRequestsPanel from '@/components/account/MarketplaceRequestsPanel';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import type { SessionRole } from '@/lib/auth/identity-contract';
import { customerHubCopy, formatCustomerHubDate, getAccountHeading, getCustomerRoleLabel, getCustomerStatusLabel, getVerificationStatusLabel } from '@/lib/i18n/customer-hub';
import { normalizeBookingStatus } from '@/lib/booking/workflow-status';
import type { CustomerMarketplaceRequest } from '@/lib/marketplace/customer-requests';
import styles from '@/components/v6/v6.module.css';
import { DabraIntroduction } from '@/components/v6/DabraIdentity';

type MyAccountContentProps = {
  displayName: string | null; displayEmail: string; role: SessionRole | null; roleRaw: string | null;
  accountStatus: string | null; joinedAt: string | null; requests: CustomerMarketplaceRequest[];
  documents?: { id: string; document_type: string; verification_status: string | null; expiry_date: string | null }[] | null;
  booking?: { id: string; booking_reference: string | null; status: string | null; created_at: string | null } | null;
  bookingsFailed?: boolean;
};
export default function MyAccountContent({ displayName, displayEmail, role, roleRaw, accountStatus, joinedAt, requests, documents = null, booking = null, bookingsFailed = false }: MyAccountContentProps) {
  const { language, direction } = useLanguage();
  const ar = language === 'ar';
  const t = customerHubCopy[language].account;
  const documentNames: Record<string, [string, string]> = { passport: ['جواز السفر', 'Passport'], visa: ['التأشيرة', 'Visa'], insurance: ['التأمين', 'Insurance'], id: ['الهوية', 'Identity'], national_id: ['الهوية', 'Identity'], other: ['مستند', 'Document'] };
  return <div dir={direction} className={styles.accountDashboard}>
    <div className={styles.accountHero} role="img" aria-label={ar ? 'أفق الرياض' : 'Riyadh skyline'} />
    <h1 className="sr-only">{getAccountHeading(role, language)}</h1>
    <div className={styles.accountIdentity}><strong>{displayName || t.defaultCustomer}</strong><span>{getCustomerRoleLabel(role, roleRaw, language)}</span><span>{getCustomerStatusLabel(accountStatus, language)}</span><span>{displayEmail}</span><small>{t.joinedAt}: {formatCustomerHubDate(joinedAt, language)}</small><Link href="/my-profile">{t.profile}</Link></div>
    <div className={`${styles.grid} ${styles.accountCards}`}>
      <section className={styles.card}><h2><FiFileText />{ar ? 'المستندات المهمة' : 'Important documents'}</h2><div className={styles.summaryBody}>
        {documents === null ? <p>{ar ? 'تعذّر تحميل المستندات.' : 'Could not load documents.'}</p> : documents.length ? documents.map(doc => <div className={styles.summaryRow} key={doc.id}><strong>{(documentNames[doc.document_type] || ['مستند', 'Document'])[ar ? 0 : 1]}</strong><span className={styles.badge}>{getVerificationStatusLabel(doc.verification_status, language)}</span>{doc.expiry_date && <small>{ar ? 'ينتهي' : 'Expires'}: {formatCustomerHubDate(doc.expiry_date, language)}</small>}</div>) : <p>{ar ? 'لا توجد مستندات محفوظة بعد.' : 'No documents saved yet.'}</p>}
      </div><Link href="/my-documents">{t.viewDocuments} ←</Link></section>
      <section className={styles.card}><h2>{ar ? 'محفظة السفر' : 'Travel wallet'}</h2><div className={styles.summaryBody}><p>{ar ? 'تفاصيل محفظتك وسجل رحلاتك' : 'Your wallet details and travel history'}</p><FiCreditCard className={styles.cardIcon} /></div><Link href="/my-wallet">{ar ? 'عرض المحفظة' : 'View wallet'} ←</Link></section>
      <section className={styles.card}><h2><FiCalendar />{ar ? 'حجوزاتي القادمة' : 'Upcoming bookings'}</h2><div className={styles.summaryBody}>
        {bookingsFailed ? <p>{ar ? 'تعذّر تحميل الحجوزات.' : 'Could not load bookings.'}</p> : booking ? <><strong dir="ltr">{booking.booking_reference || '—'}</strong><p>{ar ? 'تاريخ الحجز' : 'Booking date'}: {formatCustomerHubDate(booking.created_at, language)}</p><span className={styles.badge} data-confirmed={normalizeBookingStatus(booking.status) === 'Confirmed'}>{normalizeBookingStatus(booking.status) === 'Confirmed' ? (ar ? 'مؤكد' : 'Confirmed') : (ar ? 'تابع حالة الحجز' : 'View booking status')}</span></> : <p>{ar ? 'لا توجد حجوزات قادمة.' : 'No upcoming bookings.'}</p>}
      </div><Link href="/my-bookings">{t.viewBookings} ←</Link></section>
    </div>
    <section className={styles.card}><h2><FiHeart /> {ar ? 'المفضلة' : 'Favorites'}</h2><div className={styles.familyGrid}>{[
      ['stay', 'Stay', FiHome], ['drive', 'Drive', FiTruck], ['concierge', 'Concierge', FiBriefcase], ['vip', 'VIP', FiStar], ['fly', 'Fly', FiSend],
    ].map(([key, label, Icon]) => { const Symbol = Icon as typeof FiHome; return <Link key={String(key)} href={'/favorites?family=' + key}><Symbol />dir3 {String(label)}</Link>; })}</div></section>
    <DabraIntroduction ar={ar} />
    <div className={styles.requestSummary}><MarketplaceRequestsPanel requests={requests} /></div>
    <section className={styles.card}><h2>{ar ? 'رحلتك القادمة تبدأ هنا' : 'Your next journey starts here'}</h2><p>{ar ? 'اكتشف خدمات السفر واختر ما يناسبك.' : 'Explore travel services and find what suits you.'}</p><Link href="/marketplace" className={styles.primary}>{ar ? 'استكشف الخدمات' : 'Explore services'}</Link></section>
  </div>;
}
