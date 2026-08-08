import { FiArrowLeft } from 'react-icons/fi';
import Reveal from '../shared/Reveal';

export default function Newsletter() {
  return (
    <section className="px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
      <Reveal>
        <div className="mx-auto flex max-w-7xl flex-col gap-6 rounded-[2rem] border border-[#D4AF37]/20 bg-[#D4AF37]/10 p-8 text-right shadow-[0_20px_60px_rgba(0,0,0,0.18)] lg:flex-row lg:items-center lg:justify-between lg:p-10">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#D4AF37]">النشرة البريدية</p>
            <h2 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">
              انضم إلى قائمة مستقبليّات dir3com
            </h2>
            <p className="mt-4 text-lg leading-8 text-slate-300">
              تابع أحدث العروض، الوجهات المميزة، وأفكار الرحلات الفاخرة التي نشاركها لك.
            </p>
          </div>

          <form className="flex w-full max-w-xl flex-col gap-3 sm:flex-row" aria-label="اشتراك في النشرة البريدية">
            <label className="sr-only" htmlFor="newsletter-email">البريد الإلكتروني</label>
            <input
              id="newsletter-email"
              type="email"
              placeholder="أدخل بريدك الإلكتروني"
              className="w-full rounded-full border border-white/15 bg-[#0D1B2A]/70 px-5 py-3 text-right text-white outline-none ring-0 placeholder:text-slate-400 focus:border-[#D4AF37]"
              required
            />
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#D4AF37] px-6 py-3 text-sm font-semibold text-[#0D1B2A] transition hover:-translate-y-1"
            >
              اشتراك
              <FiArrowLeft />
            </button>
          </form>
        </div>
      </Reveal>
    </section>
  );
}
