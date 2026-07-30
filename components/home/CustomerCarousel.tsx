'use client';

import { useEffect, useState } from 'react';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import Reveal from '../shared/Reveal';

const testimonials = [
  {
    name: 'سارة المنيع',
    role: 'عميلة مميزة',
    quote: 'كل التفاصيل كانت مصممة بعناية، والرحلة كانت أروع مما توقعته.',
  },
  {
    name: 'عبدالله الشامسي',
    role: 'شريك أعمال',
    quote: 'الخدمة فاخرة، والاحترافية كانت ملحوظة من أول لحظة.',
  },
  {
    name: 'ليلى الحربي',
    role: 'عميلة متكررة',
    quote: 'تجربة سلسة ومريحة، والنتيجة تجاوزت كل التوقعات.',
  },
];

export default function CustomerCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % testimonials.length);
    }, 5000);

    return () => window.clearInterval(timer);
  }, []);

  const current = testimonials[activeIndex];

  return (
    <section id="testimonials" className="px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-7xl rounded-[2rem] border border-white/10 bg-gradient-to-br from-[#10253d] to-[#0B1524] p-8 shadow-[0_20px_60px_rgba(0,0,0,0.2)] sm:p-10 lg:p-14">
        <Reveal>
          <div className="flex flex-col gap-6 text-right lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#D4AF37]">التقييمات</p>
              <h2 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">
                ما يقوله عملاؤنا عن تجربتهم معنا
              </h2>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setActiveIndex((prev) => (prev - 1 + testimonials.length) % testimonials.length)}
                className="rounded-full border border-white/10 bg-white/5 p-3 text-white transition hover:border-[#D4AF37] hover:text-[#D4AF37]"
                aria-label="التقييم السابق"
              >
                <FiChevronRight />
              </button>
              <button
                type="button"
                onClick={() => setActiveIndex((prev) => (prev + 1) % testimonials.length)}
                className="rounded-full border border-white/10 bg-white/5 p-3 text-white transition hover:border-[#D4AF37] hover:text-[#D4AF37]"
                aria-label="التقييم التالي"
              >
                <FiChevronLeft />
              </button>
            </div>
          </div>
        </Reveal>

        <Reveal delay={120}>
          <div className="mt-10 rounded-[1.5rem] border border-[#D4AF37]/20 bg-[#0D1B2A]/70 p-8 text-right">
            <p className="text-lg leading-8 text-slate-300">“{current.quote}”</p>
            <div className="mt-6 flex items-center justify-between">
              <div>
                <p className="font-semibold text-white">{current.name}</p>
                <p className="text-sm text-[#D4AF37]">{current.role}</p>
              </div>
              <div className="flex gap-2">
                {testimonials.map((_, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => setActiveIndex(index)}
                    className={`h-2.5 rounded-full transition-all ${activeIndex === index ? 'w-8 bg-[#D4AF37]' : 'w-2.5 bg-white/30'}`}
                    aria-label={`الانتقال إلى التقييم ${index + 1}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
