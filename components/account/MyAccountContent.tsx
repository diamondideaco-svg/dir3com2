'use client';

import Link from 'next/link';

import MarketplaceRequestsPanel from '@/components/account/MarketplaceRequestsPanel';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import type { SessionRole } from '@/lib/auth/identity-contract';
import {
  customerHubCopy,
  formatCustomerHubDate,
  getCustomerRoleLabel,
  getCustomerStatusLabel,
} from '@/lib/i18n/customer-hub';
import type { CustomerMarketplaceRequest } from '@/lib/marketplace/customer-requests';

type MyAccountContentProps = {
  displayName: string | null;
  displayEmail: string;
  role: SessionRole | null;
  roleRaw: string | null;
  accountStatus: string | null;
  joinedAt: string | null;
  requests: CustomerMarketplaceRequest[];
};

export default function MyAccountContent({
  displayName,
  displayEmail,
  role,
  roleRaw,
  accountStatus,
  joinedAt,
  requests,
}: MyAccountContentProps) {
  const { language, direction } = useLanguage();
  const t = customerHubCopy[language].account;

  return (
    <div className="min-h-screen bg-[#FAF8F4] px-4 py-8 text-[#334155]" dir={direction}>
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#D4AF37]">{t.eyebrow}</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">{t.title}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/my-bookings" className="rounded-full border border-[color:var(--color-border)] px-4 py-2 text-sm text-[var(--color-navy)]">{t.bookings}</Link>
            <Link href="/my-wallet" className="rounded-full border border-[color:var(--color-border)] px-4 py-2 text-sm text-[var(--color-navy)]">{t.wallet}</Link>
            <Link href="/my-documents" className="rounded-full border border-[color:var(--color-border)] px-4 py-2 text-sm text-[var(--color-navy)]">{t.documents}</Link>
            <Link href="/my-profile" className="rounded-full border border-[color:var(--color-border)] px-4 py-2 text-sm text-[var(--color-navy)]">{t.profile}</Link>
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-[color:var(--color-border)] bg-[var(--color-surface)] p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-lg font-semibold text-white">{displayName || t.defaultCustomer}</p>
              <p className="mt-2 text-sm text-[var(--color-muted)]">{displayEmail}</p>
            </div>
            <span className="rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/10 px-3 py-1 text-xs font-semibold text-[#D4AF37]">
              {getCustomerRoleLabel(role, roleRaw, language)}
            </span>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-[color:var(--color-border)] bg-white p-4">
              <p className="text-xs text-[var(--color-muted)]">{t.accountStatus}</p>
              <p className="mt-2 text-sm font-semibold text-white">{getCustomerStatusLabel(accountStatus, language)}</p>
            </div>
            <div className="rounded-2xl border border-[color:var(--color-border)] bg-white p-4">
              <p className="text-xs text-[var(--color-muted)]">{t.joinedAt}</p>
              <p className="mt-2 text-sm font-semibold text-white">{formatCustomerHubDate(joinedAt, language)}</p>
            </div>
            <div className="rounded-2xl border border-[color:var(--color-border)] bg-white p-4">
              <p className="text-xs text-[var(--color-muted)]">{t.manageBookings}</p>
              <Link href="/my-bookings" className="mt-2 inline-block text-sm font-semibold text-[#D4AF37]">{t.viewBookings}</Link>
            </div>
            <div className="rounded-2xl border border-[color:var(--color-border)] bg-white p-4">
              <p className="text-xs text-[var(--color-muted)]">{t.accountDocuments}</p>
              <Link href="/my-documents" className="mt-2 inline-block text-sm font-semibold text-[#D4AF37]">{t.viewDocuments}</Link>
            </div>
          </div>
        </div>
        <MarketplaceRequestsPanel requests={requests} />
      </div>
    </div>
  );
}
