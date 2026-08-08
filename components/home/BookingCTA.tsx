import Link from 'next/link';
import { FiArrowLeft } from 'react-icons/fi';

export default function BookingCTA() {
  return (
    <section id="booking" className="px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-7xl rounded-[2rem] border border-[#D4AF37]/20 bg-[#D4AF37]/10 p-8 text-right shadow-[0_25px_60px_rgba(0,0,0,0.2)] sm:p-10 lg:p-14">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl animate-fade-up">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#D4AF37]">احجز الآن</p>
            <h2 className="mt-4 text-3xl font-semibold text-white sm:text-4xl">
              جاهز لتجربة تخدمك بلمسة فاخرة واحترافية؟
            </h2>
            <p className="mt-4 text-lg leading-8 text-slate-300">
              ابدأ رحلتك مع فريق dir3com اليوم، وسنرافقك خطوة بخطوة نحو أفضل نتيجة.
            </p>
          </div>

          <Link
            href="/services"
            className="inline-flex items-center gap-2 rounded-full bg-[#D4AF37] px-6 py-3.5 text-sm font-semibold text-[#0D1B2A] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_15px_35px_rgba(212,175,55,0.24)]"
          >
            ابدأ الآن
            <FiArrowLeft />
          </Link>
        </div>
      </div>
    </section>
  );
}
