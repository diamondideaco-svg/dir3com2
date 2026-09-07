'use client';
import { useState } from 'react';
import Link from 'next/link';
import { FiArrowUp, FiArrowDown, FiPlus, FiCreditCard, FiGrid, FiPieChart, FiEye, FiEyeOff, FiSend, FiHome, FiTruck, FiBriefcase } from 'react-icons/fi';
import { walletSpending } from '@/lib/customer/wallet-spending';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import { formatCustomerHubDate } from '@/lib/i18n/customer-hub';
import { PageHeading, LoadError } from './Chrome';
import styles from './v6.module.css';
export type WalletView = { currency: string | null; balance: number; available: number; held: number; transactions: { id: string; type: string; amount: number; date: string; currency: string | null; status: string }[] };
export default function Wallet({ wallet, failed, currentMonth }: { wallet: WalletView | null; failed: boolean; currentMonth: string }) {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const [hidden, setHidden] = useState(false);
  const [period, setPeriod] = useState('month');
  const spending = walletSpending(failed ? null : wallet?.transactions || null, wallet?.currency || null, period === 'month' ? currentMonth : null);
  const money = (value: number | undefined) => hidden ? '••••' : value === undefined ? '—' : value.toFixed(2);
  const actions = [['إضافة أموال', 'Add Funds', FiPlus], ['تحويل بنكي', 'Bank Transfer', FiArrowUp], ['بطاقاتي', 'My Cards', FiCreditCard], ['استردادات', 'Refunds', FiArrowDown], ['الدفع', 'Pay', FiGrid]] as const;
  const types: Record<string, [string, string]> = { credit: ['إيداع', 'Credit'], debit: ['خصم', 'Debit'], hold: ['حجز مبلغ', 'Hold'], release: ['تحرير مبلغ', 'Release'] };
  return <>
    <PageHeading title={ar ? 'محفظة السفر' : 'Travel wallet'} icon={<FiCreditCard />} />
    {failed ? <LoadError /> : <div className={styles.walletHero}><div className={styles.walletArt} aria-hidden="true" /><section className={styles.balance} data-dabra-avoid>
      <p className={styles.walletQuote}>{ar ? 'محفظتك الذكية لسفر أكثر راحة' : 'Your smart wallet for a more comfortable journey'}</p>
      <h2>{ar ? 'الرصيد الإجمالي' : 'Total balance'} <button type="button" className={styles.balanceToggle} onClick={() => setHidden(!hidden)} aria-label={ar ? 'إظهار أو إخفاء الرصيد' : 'Show or hide balance'} aria-pressed={hidden}>{hidden ? <FiEyeOff /> : <FiEye />}</button></h2>
      <strong className={styles.amount}>{money(wallet?.balance)} {wallet?.currency || ''}</strong>
      <div className={styles.balanceRows}><div>{ar ? 'المتاح' : 'Available'}<p className={styles.amount}>{money(wallet?.available)}</p></div><div>{ar ? 'المعلق' : 'Held'}<p className={styles.amount}>{money(wallet?.held)}</p></div></div>
    </section></div>}
    <div className={styles.walletActions}>{actions.map(([arabic, english, Icon]) => <button key={english} type="button" disabled data-finance-rail="held"><Icon aria-hidden="true" />{ar ? arabic : english}</button>)}<a href="#wallet-transactions"><FiPieChart aria-hidden="true" />{ar ? 'التقارير' : 'Reports'}</a></div>
    <div className={styles.twoColumns}>
    <section className={styles.card} id="wallet-transactions"><h2>{ar ? 'آخر العمليات' : 'Recent transactions'}</h2>
      {!failed && wallet?.transactions.length ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr>{(ar ? ['العملية', 'التاريخ', 'المبلغ'] : ['Transaction', 'Date', 'Amount']).map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{wallet.transactions.map(tx => <tr key={tx.id}><td>{(types[tx.type] || ['عملية محفظة', 'Wallet transaction'])[ar ? 0 : 1]}</td><td>{formatCustomerHubDate(tx.date, language)}</td><td className={styles.amount}>{hidden ? '••••' : tx.amount.toFixed(2)} {tx.currency || ''}</td></tr>)}</tbody></table></div> : !failed && wallet ? <p>{ar ? 'لا توجد عمليات مسجلة.' : 'No transactions recorded.'}</p> : null}
    </section>
    <section className={styles.card} id="wallet-summary"><div className={styles.toolbar}><h2>{ar ? 'ملخص الإنفاق' : 'Spending summary'}</h2><label><span className="sr-only">{ar ? 'الفترة' : 'Period'}</span><select value={period} onChange={event => setPeriod(event.target.value)}><option value="month">{ar ? 'هذا الشهر' : 'This month'}</option><option value="all">{ar ? 'كل الفترات' : 'All time'}</option></select></label></div>
      <div className={styles.spendingSummary}><div className={styles.spendingRing}><strong className={styles.amount}>{money(spending === null ? undefined : spending)}</strong><span>{wallet?.currency || ''}</span></div><div><p>{ar ? 'إجمالي الإنفاق' : 'Total spending'}</p>{spending !== null && <small>{ar ? 'من سجل المحفظة' : 'From your wallet ledger'}</small>}<p><a href="#wallet-transactions">{ar ? 'عرض التفاصيل' : 'View details'} ←</a></p></div></div>
    </section></div>
    <nav className={styles.walletDestinations} aria-label={ar ? 'رحلاتي ومحفظتي' : 'My travel and wallet'}>{[
      ['/my-bookings', 'رحلاتي', 'My trips', FiSend], ['/favorites?family=stay', 'إقاماتي', 'My stays', FiHome], ['/favorites?family=drive', 'سياراتي', 'My cars', FiTruck], ['/favorites?family=concierge', 'تجاربي', 'My experiences', FiBriefcase], ['#wallet-summary', 'رصيدي', 'My balance', FiCreditCard],
    ].map(([href, arabic, english, Icon]) => { const Symbol = Icon as typeof FiHome; return <Link key={String(href)} href={String(href)}><Symbol aria-hidden="true" /><strong>{String(ar ? arabic : english)}</strong></Link>; })}</nav>
  </>;
}
