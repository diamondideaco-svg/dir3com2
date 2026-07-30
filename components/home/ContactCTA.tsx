import Link from 'next/link';
import { FiMail, FiPhoneCall } from 'react-icons/fi';

export default function ContactCTA() {
  return (
    <section id="contact" className="px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
      <div className="mx-auto grid max-w-7xl gap-8 rounded-[2rem] border border-white/10 bg-[#07111D] p-8 text-right shadow-[0_25px_60px_rgba(0,0,0,0.24)] sm:p-10 lg:grid-cols-[0.9fr_1.1fr] lg:p-14">
        <div className="animate-fade-up">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#D4AF37]">تواصل معنا</p>
          <h2 className="mt-4 text-3xl font-semibold text-white sm:text-4xl">
            لنبدأ محادثة عن احتياجاتك القادمة.
          </h2>
          <p className="mt-4 text-lg leading-8 text-slate-300">
            راسلنا وسنعود إليك في أسرع وقت ممكن مع حلول مخصصة ومناسبة لك.
          </p>
        </div>

        <div className="rounded-[1.5rem] border border-[#D4AF37]/20 bg-white/5 p-6 transition-all duration-300 hover:-translate-y-1">
          <div className="space-y-4 text-sm text-slate-300">
            <a href="mailto:hello@dir3com.com" className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0D1B2A]/70 px-4 py-3 transition hover:border-[#D4AF37] hover:text-[#D4AF37]">
              <FiMail className="text-[#D4AF37]" />
              hello@dir3com.com
            </a>
            <a href="tel:+966500000000" className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0D1B2A]/70 px-4 py-3 transition hover:border-[#D4AF37] hover:text-[#D4AF37]">
              <FiPhoneCall className="text-[#D4AF37]" />
              +966 50 000 0000
            </a>
          </div>

          <Link
            href="mailto:hello@dir3com.com"
            className="mt-6 inline-flex items-center gap-2 rounded-full border border-[#D4AF37]/40 px-5 py-3 text-sm font-semibold text-[#D4AF37] transition hover:bg-[#D4AF37] hover:text-[#0D1B2A]"
          >
            أرسل رسالة
          </Link>
        </div>
      </div>
    </section>
  );
}
