import Link from 'next/link';
import { FiArrowLeft, FiCheckCircle, FiShield, FiStar } from 'react-icons/fi';

const highlights = [
  'استشارات شخصية ومخصصة',
  'تنفيذ سريع واحترافي',
  'تجربة عملاء فاخرة',
];

export default function Hero() {
  return (
    <section id="home" className="relative overflow-hidden px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(212,175,55,0.16),_transparent_35%)]" />
      <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="relative z-10 animate-fade-up">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/10 px-4 py-2 text-sm font-medium text-[#D4AF37]">
            <FiStar />
            تجربة DIR3COM الراقية
          </div>
          <h1 className="mt-6 text-4xl font-semibold leading-[1.15] tracking-tight text-white sm:text-5xl lg:text-6xl">
            رحلتك إلى الراحة والتميز تبدأ من هنا.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300 sm:text-xl">
            نُقدّم لك خدمات مميزة تجمع بين الاحترافية العالية، اللمسات الفاخرة، والتجربة التي تعكس قيمك وتناسب طابعك.
          </p>

          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              href="/services"
              className="inline-flex items-center gap-2 rounded-full bg-[#D4AF37] px-6 py-3.5 text-sm font-semibold text-[#0D1B2A] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_15px_35px_rgba(212,175,55,0.25)]"
            >
              احجز الآن
              <FiArrowLeft />
            </Link>
            <Link
              href="#services"
              className="rounded-full border border-white/20 px-6 py-3.5 text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-1 hover:border-[#D4AF37] hover:text-[#D4AF37]"
            >
              استكشف خدماتنا
            </Link>
          </div>

          <ul className="mt-8 space-y-3 text-sm text-slate-300 sm:text-base">
            {highlights.map((item) => (
              <li key={item} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <FiCheckCircle className="shrink-0 text-[#D4AF37]" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative animate-fade-up">
          <div className="rounded-[2rem] border border-white/10 bg-white/5 p-4 shadow-2xl shadow-black/30 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1">
            <div className="rounded-[1.5rem] border border-[#D4AF37]/20 bg-gradient-to-br from-[#10253d] to-[#0B1524] p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">حالة الخدمة</p>
                  <p className="text-2xl font-semibold text-white">مخصصة بالكامل</p>
                </div>
                <div className="rounded-full bg-[#D4AF37]/15 p-3 text-[#D4AF37]">
                  <FiShield size={24} />
                </div>
              </div>

              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-sm text-slate-400">السرعة</p>
                  <p className="mt-2 text-3xl font-semibold text-white">24/7</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-sm text-slate-400">التقييم</p>
                  <p className="mt-2 text-3xl font-semibold text-white">4.9/5</p>
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-[#D4AF37]/20 bg-[#D4AF37]/10 p-4 text-right text-sm leading-7 text-slate-300">
                “نحن نجمع بين البساطة، الكفاءة، واللمسة الراقية التي تجعل كل تجربة تترك أثرًا إيجابيًا.”
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
