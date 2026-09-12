import Link from 'next/link';
import type { MarketplaceCard } from '@/lib/marketplace/cards';
import type { ProviderProofEnvironment } from '@/lib/marketplace/provider-proof-mode';
import { formatPreviewRetrievedAt } from '@/lib/marketplace/real-preview-contract';

export default function ProviderProofDetail({ card, provider, providerItemId, environment, language }: { card: MarketplaceCard | null; provider: string; providerItemId: string; environment: ProviderProofEnvironment; language: 'ar' | 'en' }) {
  const ar = language === 'ar';
  const providerLabel = provider === 'duffel' ? 'Duffel' : provider === 'sabre' ? 'Sabre' : 'LiteAPI';
  return (
    <main className="min-h-screen bg-[var(--color-shell)] px-4 py-8 sm:px-6 sm:py-12" dir={ar ? 'rtl' : 'ltr'} lang={language}>
      <div className="mx-auto max-w-4xl">
        <Link href="/marketplace/provider-proof" className="inline-flex min-h-11 items-center text-sm font-bold text-[var(--color-navy)]">{ar ? 'العودة إلى إثبات المزوّد' : 'Back to provider proof'}</Link>
        <article className="mt-4 rounded-[30px] border border-[var(--color-gold)]/25 bg-white p-6 shadow-[0_24px_65px_rgba(13,27,42,0.1)] sm:p-9">
          <div className="flex flex-wrap gap-2"><span className="rounded-full bg-[var(--color-gold)]/14 px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-navy)]">{providerLabel}</span><span className="rounded-full border border-[var(--color-gold)]/35 px-3 py-1 text-xs font-bold uppercase text-[var(--color-navy)]">{environment}</span></div>
          {card ? <>
            <h1 className="mt-5 text-3xl font-semibold text-[var(--color-navy)] sm:text-5xl">{card.title}</h1>
            <p className="mt-3 leading-7 text-[var(--color-muted)]">{card.subtitle} · {card.location}</p>
            <dl className="mt-7 grid gap-4 rounded-2xl bg-[var(--color-shell)] p-5 text-sm sm:grid-cols-2"><div><dt className="text-[var(--color-muted)]">{ar ? 'المعرّف لدى المزوّد' : 'Provider item ID'}</dt><dd className="mt-1 break-all font-mono text-xs text-[var(--color-navy)]">{card.providerItemId ?? providerItemId}</dd></div><div><dt className="text-[var(--color-muted)]">{ar ? 'وقت الاسترجاع' : 'Retrieved at'}</dt><dd className="mt-1 text-[var(--color-navy)]">{card.retrievedAt ? formatPreviewRetrievedAt(card.retrievedAt, language) : '—'}</dd></div><div><dt className="text-[var(--color-muted)]">{ar ? 'التوفر' : 'Availability'}</dt><dd className="mt-1 font-semibold text-[var(--color-navy)]">{card.availabilityStatus}</dd></div><div><dt className="text-[var(--color-muted)]">{ar ? 'السعر والعملة' : 'Price and currency'}</dt><dd className="mt-1 font-semibold text-[var(--color-navy)]">{card.totalPrice !== null ? `${card.totalPrice} ${card.currency}` : (ar ? 'لم يزوّد المزوّد بسعر' : 'Not supplied by provider')}</dd></div></dl>
            <div className="mt-6 rounded-2xl border border-[var(--color-gold)]/30 bg-[var(--color-gold)]/8 p-5 text-sm leading-7 text-[var(--color-navy)]">{environment === 'sandbox' ? (ar ? 'نتيجة مزوّد في بيئة اختبار — الحجز والدفع غير مفعّلين في هذه البيئة.' : 'Sandbox result — booking/payment is not enabled in this environment.') : (ar ? 'هذه تفاصيل من استجابة المزوّد. لا يوجد ادعاء حجز أو دفع داخل DIR3COM.' : 'These details come from the provider response. No booking or payment is claimed inside DIR3COM.')}</div>
            <span aria-disabled="true" className="mt-7 inline-flex min-h-11 cursor-not-allowed items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-shell)] px-6 py-3 text-sm font-bold text-[var(--color-muted)]">{ar ? 'لا يوجد إجراء حجز في مساحة الإثبات' : 'No booking action in proof mode'}</span>
          </> : <>
            <h1 className="mt-5 text-3xl font-semibold text-[var(--color-navy)] sm:text-5xl">{ar ? 'تعذر إعادة التحقق من نتيجة المزوّد' : 'Provider result could not be revalidated'}</h1>
            <p className="mt-4 leading-7 text-[var(--color-muted)]">{ar ? 'لم نعرض سعرًا أو توفرًا قديمًا، ولا يوجد إجراء حجز أو دفع.' : 'No stale price or availability is shown, and there is no booking or payment action.'}</p>
            <p className="mt-5 break-all rounded-2xl bg-[var(--color-shell)] p-5 font-mono text-xs text-[var(--color-navy)]">{providerLabel} · {providerItemId}</p>
          </>}
        </article>
      </div>
    </main>
  );
}
