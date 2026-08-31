'use client';

import Link from 'next/link';

import { useLanguage } from '@/components/i18n/LanguageProvider';
import { normalizeSessionRole } from '@/lib/auth/identity-contract';
import {
  customerHubCopy,
  formatCustomerHubDate,
  getCustomerRoleLabel,
  getCustomerStatusLabel,
} from '@/lib/i18n/customer-hub';

export type CustomerProfile = {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  status: string | null;
  updated_at: string | null;
};

export default function MyProfileContent({ customer }: { customer: CustomerProfile | null }) {
  const { language, direction } = useLanguage();
  const t = customerHubCopy[language].profile;

  return (
    <div className="min-h-screen bg-[#FAF8F4] px-4 py-8 text-[#334155]" dir={direction}>
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#D4AF37]">{t.eyebrow}</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">{t.title}</h1>
          </div>
          <Link href="/my-account" className="rounded-full border border-[color:var(--color-border)] px-4 py-2 text-sm text-[var(--color-navy)]">{t.back}</Link>
        </div>

        {customer ? (
          <div className="rounded-[1.5rem] border border-[color:var(--color-border)] bg-[var(--color-surface)] p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-[var(--color-muted)]">{t.name}</p>
                <p className="mt-2 text-sm font-semibold text-white">{customer.full_name || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--color-muted)]">{t.email}</p>
                <p className="mt-2 text-sm font-semibold text-white">{customer.email || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--color-muted)]">{t.phone}</p>
                <p className="mt-2 text-sm font-semibold text-white">{customer.phone || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--color-muted)]">{t.role}</p>
                <p className="mt-2 text-sm font-semibold text-white">
                  {getCustomerRoleLabel(normalizeSessionRole(customer.role), customer.role, language)}
                </p>
              </div>
              <div>
                <p className="text-xs text-[var(--color-muted)]">{t.status}</p>
                <p className="mt-2 text-sm font-semibold text-white">{getCustomerStatusLabel(customer.status, language)}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--color-muted)]">{t.updatedAt}</p>
                <p className="mt-2 text-sm font-semibold text-white">{formatCustomerHubDate(customer.updated_at, language)}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-[1.5rem] border border-dashed border-white/20 bg-[var(--color-surface)] p-6 text-sm text-[var(--color-muted)]">
            {t.empty}
          </div>
        )}
      </div>
    </div>
  );
}
