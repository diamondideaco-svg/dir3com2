'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { FiArrowUpLeft, FiCheckCircle, FiShield, FiUsers } from 'react-icons/fi';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import { localizeDabraPersona } from '@/lib/dabra/persona-copy';

type FamilyIdentity = {
  optional: true;
  activeRole: string | null;
  authenticated: boolean;
  autonomousTransactions: false;
};

const copy = {
  ar: {
    optional: 'الدبرة اختيارية',
    title: 'خطّط وقارن، والقرار الأخير لك.',
    description: 'تستخدم الدبرة نفس قوائم السوق المنشورة. لا تنفّذ حجزًا أو دفعًا أو إلغاءً أو استردادًا من تلقاء نفسها.',
    role: 'نمط المساعدة',
    authenticated: 'مساعدة الدبرة',
    signedOut: 'وضع الاستكشاف العام',
    flow: ['اكتشف', 'اسأل', 'قارن', 'خطّط', 'افتح السوق', 'راجع التفاصيل', 'وافق بنفسك'],
    approval: 'موافقتك الصريحة مطلوبة قبل أي خطوة مالية أو غير قابلة للعكس.',
    marketplace: 'تصفح السوق مباشرة',
    support: 'تواصل مع الدعم',
  },
  en: {
    optional: 'DABRA is optional',
    title: 'Plan and compare. You make the final decision.',
    description: 'DABRA uses the same published marketplace listings. It never books, pays, cancels, or refunds on its own.',
    role: 'Assistance mode',
    authenticated: 'DABRA assistance',
    signedOut: 'Public discovery mode',
    flow: ['Discover', 'Ask', 'Compare', 'Plan', 'Open marketplace', 'Review details', 'Approve yourself'],
    approval: 'Your explicit approval is required before any financial or irreversible step.',
    marketplace: 'Browse marketplace directly',
    support: 'Contact support',
  },
} as const;

export default function DabraFamilySafetyPanel() {
  const { language } = useLanguage();
  const t = copy[language];
  const [identity, setIdentity] = useState<FamilyIdentity | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/dabra/family', { cache: 'no-store', credentials: 'same-origin', signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<FamilyIdentity> : null)
      .then((payload) => setIdentity(payload))
      .catch(() => setIdentity(null));
    return () => controller.abort();
  }, []);

  return (
    <section className="mx-auto mb-4 w-full max-w-[1480px] rounded-[22px] border border-[#d8bf86] bg-[#fffaf0] p-4 text-[#13243a] shadow-[0_14px_36px_rgba(76,53,18,0.08)] sm:p-5" aria-labelledby="dabra-family-title">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-[#f0dfaf] px-3 py-1 text-xs font-bold text-[#725116]"><FiShield /> {t.optional}</span>
          <h2 id="dabra-family-title" className="mt-3 text-xl font-bold sm:text-2xl">{t.title}</h2>
          <p className="mt-2 text-sm leading-7 text-[#556274]">{t.description}</p>
        </div>
        <div className="min-w-64 rounded-2xl border border-[#dfcfaa] bg-white px-4 py-3">
          <span className="flex items-center gap-2 text-xs font-semibold text-[#7c6533]"><FiUsers /> {t.role}</span>
          <strong className="mt-1 block text-sm">{identity?.authenticated ? (localizeDabraPersona(identity.activeRole, language) ?? t.authenticated) : t.signedOut}</strong>
        </div>
      </div>
      <ol className="mt-4 flex gap-2 overflow-x-auto pb-2" aria-label={language === 'ar' ? 'مسار الدبرة الاختياري' : 'Optional DABRA journey'}>
        {t.flow.map((step) => <li key={step} className="flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-[#e5d5af] bg-white px-4 text-sm font-semibold"><FiCheckCircle className="text-[#b78421]" />{step}</li>)}
      </ol>
      <div className="mt-2 flex flex-col gap-3 rounded-2xl bg-[#13243a] px-4 py-3 text-sm text-white sm:flex-row sm:items-center sm:justify-between">
        <p className="font-medium">{t.approval}</p>
        <div className="flex flex-wrap gap-2">
          <Link href="/marketplace" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#d7ad38] px-4 font-bold text-[#13243a]">{t.marketplace}<FiArrowUpLeft /></Link>
          <Link href="/support" className="inline-flex min-h-11 items-center rounded-full border border-white/35 px-4 font-semibold text-white">{t.support}</Link>
        </div>
      </div>
    </section>
  );
}
