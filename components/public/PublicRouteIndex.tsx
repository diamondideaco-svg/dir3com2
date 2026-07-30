import Link from 'next/link';
import { publicQuickLinks } from '@/components/public/public-page-data';

export default function PublicRouteIndex() {
  return (
    <section className="px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl rounded-[32px] border border-[color:var(--color-border)] bg-white/80 p-6 shadow-[0_18px_40px_rgba(13,27,42,0.06)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-medium tracking-[0.18em] text-[var(--color-gold)]">PUBLIC PLATFORM</p>
            <h2 className="mt-3 text-2xl font-semibold text-[var(--color-navy)] sm:text-3xl">كل صفحات المنصة العامة مرتبطة بنفس النظام البصري.</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {publicQuickLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-full border border-[color:var(--color-border)] bg-[var(--color-shell)] px-4 py-2 text-sm font-medium text-[var(--color-navy)] transition hover:border-[var(--color-gold)] hover:text-[var(--color-gold)]"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}