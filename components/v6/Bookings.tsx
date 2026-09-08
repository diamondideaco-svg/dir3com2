'use client';
import { useState } from 'react';
import Link from 'next/link';
import { FiCalendar } from 'react-icons/fi';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import type { BookingEngineRecord } from '@/lib/supabase/types';
import { normalizeBookingStatus } from '@/lib/booking/workflow-status';
import type { CustomerMarketplaceRequest } from '@/lib/marketplace/customer-requests';
import MarketplaceRequestsPanel from '@/components/account/MarketplaceRequestsPanel';
import { formatCustomerHubDate } from '@/lib/i18n/customer-hub';
import { PageHeading, LoadError } from './Chrome';
import CollaborativeTripCapabilities from './CollaborativeTripCapabilities';
import styles from './v6.module.css';

export default function Bookings({ bookings, requests, failed }: { bookings: BookingEngineRecord[]; requests: CustomerMarketplaceRequest[]; failed: boolean }) {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const [tab, setTab] = useState('upcoming');
  const [search, setSearch] = useState('');
  const group = (b: BookingEngineRecord) => { const status = normalizeBookingStatus(b.status); return status === 'Completed' ? 'past' : status === 'Cancelled' ? 'cancelled' : 'upcoming'; };
  const statuses: Record<string, [string, string]> = { Pending: ['بانتظار التأكيد', 'Awaiting confirmation'], Confirmed: ['مؤكد', 'Confirmed'], Assigned: ['تم التعيين', 'Assigned'], 'In Progress': ['قيد التنفيذ', 'In progress'], Completed: ['مكتمل', 'Completed'], Cancelled: ['ملغى', 'Cancelled'] };
  const visible = bookings.filter(b => group(b) === tab && [b.booking_reference, b.service_name, b.product_name].some(value => String(value || '').toLowerCase().includes(search.toLowerCase())));
  return <>
    <PageHeading title={ar ? 'حجوزاتي' : 'My bookings'} subtitle={ar ? 'إدارة جميع حجوزاتك ومتابعة حالتها بسهولة' : 'Manage your bookings and follow their current status'} icon={<FiCalendar />} />
    <div className={styles.tabs}>{[['upcoming', 'القادمة', 'Upcoming'], ['past', 'السابقة', 'Past'], ['cancelled', 'الملغاة', 'Cancelled']].map(([key, arabic, english]) => <button key={key} type="button" aria-pressed={tab === key} onClick={() => setTab(key)}>{ar ? arabic : english} ({bookings.filter(b => group(b) === key).length})</button>)}</div>
    <div className={styles.toolbar}><label>{ar ? 'البحث في الحجوزات' : 'Search bookings'}<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder={ar ? 'رقم الحجز أو الخدمة' : 'Booking reference or service'} /></label></div>
    {failed ? <LoadError /> : visible.length ? <div className={styles.list}>{visible.map(booking => {
      const status = normalizeBookingStatus(booking.status);
      const amount = booking.total_amount ?? booking.total_price;
      return <article key={booking.id} className={styles.booking}>
        <div><FiCalendar className={styles.cardIcon} /><h2>{booking.service_name || booking.product_name || '—'}</h2><p>{ar ? 'تاريخ الحجز' : 'Booking date'}: {formatCustomerHubDate(booking.created_at, language)}</p></div>
        <div><span className={styles.badge} data-confirmed={status === 'Confirmed'}>{(statuses[status] || statuses.Pending)[ar ? 0 : 1]}</span><p className={styles.amount}><strong>{amount == null ? '—' : amount} {booking.currency || ''}</strong></p><small>{ar ? 'المبلغ الإجمالي' : 'Total amount'}</small></div>
        <div className={styles.bookingActions}><small>{ar ? 'رقم الحجز' : 'Booking reference'}</small><strong dir="ltr">{booking.booking_reference || '—'}</strong><Link className={styles.secondary} href={'/my-bookings/' + booking.id}>{ar ? 'عرض التفاصيل' : 'View details'}</Link><Link href={'/my-bookings/' + booking.id + '/review'}>{ar ? 'تقييم الحجز' : 'Review booking'}</Link></div>
      </article>;
    })}</div> : <div className={styles.empty}><FiCalendar className={styles.bookingsEmptyIcon} aria-hidden="true" /><p>{ar ? 'لا توجد حجوزات تطابق هذا العرض.' : 'No bookings match this view.'}</p><Link href="/marketplace" className={styles.primary}>{ar ? 'استكشف الخدمات' : 'Explore services'}</Link></div>}
    <CollaborativeTripCapabilities phase="collection" />
    <div className={styles.requestSummary}><MarketplaceRequestsPanel requests={requests} /></div>
  </>;
}
