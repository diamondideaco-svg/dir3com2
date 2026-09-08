'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { IconType } from 'react-icons';
import { FiCalendar, FiCreditCard, FiFileText, FiHeart, FiHome, FiStar, FiBriefcase, FiTruck, FiSend } from 'react-icons/fi';
import { LuCalendarDays, LuCarFront, LuConciergeBell, LuCrown, LuFileText, LuHotel, LuPlane, LuWalletCards } from 'react-icons/lu';
import MarketplaceRequestsPanel from '@/components/account/MarketplaceRequestsPanel';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import type { SessionRole } from '@/lib/auth/identity-contract';
import { customerHubCopy, formatCustomerHubDate, getAccountHeading, getCustomerRoleLabel, getCustomerStatusLabel, getVerificationStatusLabel } from '@/lib/i18n/customer-hub';
import { normalizeBookingStatus } from '@/lib/booking/workflow-status';
import type { CustomerMarketplaceRequest } from '@/lib/marketplace/customer-requests';
import styles from '@/components/v6/v6.module.css';
import { DabraIntroduction } from '@/components/v6/DabraIdentity';

type AccountSummaryState = 'empty' | 'populated' | 'error' | 'unavailable';

// Display labels only: unknown/missing statuses are not promoted to a booking state.
const bookingStatusLabels: Record<string, [string, string]> = {
  pending: ['بانتظار التأكيد', 'Awaiting confirmation'], confirmed: ['مؤكد', 'Confirmed'],
  assigned: ['تم التعيين', 'Assigned'], 'in progress': ['قيد التنفيذ', 'In progress'],
  in_progress: ['قيد التنفيذ', 'In progress'], completed: ['مكتمل', 'Completed'],
  cancelled: ['ملغى', 'Cancelled'], canceled: ['ملغى', 'Cancelled'],
};

function AccountSummaryCard({ title, state, icon: Icon, mobileIcon: MobileIcon, href, action, children }: {
  title: string; state: AccountSummaryState; icon: IconType; mobileIcon?: IconType;
  href: string; action: string; children: ReactNode;
}) {
  const iconForward = state === 'empty' || state === 'unavailable';
  return <section className={styles.card} data-summary-state={state}>
    <h2>
      {MobileIcon && <MobileIcon className={styles.accountSummaryMobileIcon} />}
      {!iconForward && <Icon className={styles.accountSummarySupportingIcon} strokeWidth={1.75} aria-hidden="true" />}
      {title}
    </h2>
    <div className={styles.summaryBody}>
      {iconForward && <Icon className={styles.accountSummaryEmptyIcon} strokeWidth={1.75} aria-hidden="true" />}
      {children}
    </div>
    <Link href={href}>{action} ←</Link>
  </section>;
}

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
      <AccountSummaryCard title={ar ? 'المستندات المهمة' : 'Important documents'} state={documents === null ? 'error' : documents.length ? 'populated' : 'empty'} icon={LuFileText} mobileIcon={FiFileText} href="/my-documents" action={t.viewDocuments}>
        {documents === null ? <p>{ar ? 'تعذّر تحميل المستندات.' : 'Could not load documents.'}</p> : documents.length ? documents.map(doc => <div className={styles.summaryRow} key={doc.id}><strong>{(documentNames[doc.document_type] || ['مستند', 'Document'])[ar ? 0 : 1]}</strong><span className={styles.badge}>{getVerificationStatusLabel(doc.verification_status, language)}</span>{doc.expiry_date && <small>{ar ? 'ينتهي' : 'Expires'}: {formatCustomerHubDate(doc.expiry_date, language)}</small>}</div>) : <p>{ar ? 'لا توجد مستندات محفوظة بعد.' : 'No documents saved yet.'}</p>}
      </AccountSummaryCard>
      {/* This route has no authoritative wallet summary prop; do not infer a zero balance or no activity. */}
      <AccountSummaryCard title={ar ? 'محفظة السفر' : 'Travel wallet'} state="unavailable" icon={LuWalletCards} href="/my-wallet" action={ar ? 'عرض المحفظة' : 'View wallet'}><p>{ar ? 'تفاصيل محفظتك وسجل رحلاتك' : 'Your wallet details and travel history'}</p><FiCreditCard className={styles.cardIcon} /></AccountSummaryCard>
      <AccountSummaryCard title={ar ? 'حجوزاتي القادمة' : 'Upcoming bookings'} state={bookingsFailed ? 'error' : booking ? 'populated' : 'empty'} icon={LuCalendarDays} mobileIcon={FiCalendar} href="/my-bookings" action={t.viewBookings}>
        {bookingsFailed ? <p>{ar ? 'تعذّر تحميل الحجوزات.' : 'Could not load bookings.'}</p> : booking ? <><strong dir="ltr">{booking.booking_reference || '—'}</strong><p>{ar ? 'تاريخ الحجز' : 'Booking date'}: {formatCustomerHubDate(booking.created_at, language)}</p><span className={styles.badge} data-confirmed={normalizeBookingStatus(booking.status) === 'Confirmed'}><span className={styles.accountSummaryMobileStatus}>{normalizeBookingStatus(booking.status) === 'Confirmed' ? (ar ? 'مؤكد' : 'Confirmed') : (ar ? 'تابع حالة الحجز' : 'View booking status')}</span><span className={styles.accountSummaryDesktopStatus}>{bookingStatusLabels[booking.status?.toLowerCase() || '']?.[ar ? 0 : 1] || booking.status || '—'}</span></span></> : <p>{ar ? 'لا توجد حجوزات قادمة.' : 'No upcoming bookings.'}</p>}
      </AccountSummaryCard>
    </div>
    <section className={styles.card}><h2><FiHeart /> {ar ? 'المفضلة' : 'Favorites'}</h2><div className={styles.familyGrid}>{[
      ['stay', 'Stay', FiHome, LuHotel], ['drive', 'Drive', FiTruck, LuCarFront], ['concierge', 'Concierge', FiBriefcase, LuConciergeBell], ['vip', 'VIP', FiStar, LuCrown], ['fly', 'Fly', FiSend, LuPlane],
    ].map(([key, label, Icon, DesktopIcon]) => { const Symbol = Icon as typeof FiHome; const DesktopSymbol = DesktopIcon as typeof LuHotel; return <Link key={String(key)} href={'/favorites?family=' + key}><Symbol className={styles.accountServiceMobileIcon} aria-hidden="true" /><DesktopSymbol className={styles.accountServiceDesktopIcon} strokeWidth={1.75} aria-hidden="true" />dir3 {String(label)}</Link>; })}</div></section>
    <DabraIntroduction ar={ar} />
    <div className={styles.requestSummary}><MarketplaceRequestsPanel requests={requests} /></div>
    <section className={styles.card}><h2>{ar ? 'رحلتك القادمة تبدأ هنا' : 'Your next journey starts here'}</h2><p>{ar ? 'اكتشف خدمات السفر واختر ما يناسبك.' : 'Explore travel services and find what suits you.'}</p><Link href="/marketplace" className={styles.primary}>{ar ? 'استكشف الخدمات' : 'Explore services'}</Link></section>
  </div>;
}
