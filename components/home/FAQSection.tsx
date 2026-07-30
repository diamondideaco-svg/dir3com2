'use client';

import { useState } from 'react';
import { FiChevronDown } from 'react-icons/fi';
import SectionTitle from '../shared/SectionTitle';
import Reveal from '../shared/Reveal';

const faqs = [
  {
    question: 'كيف تبدأ رحلتك مع DIR3COM؟',
    answer: 'يمكنك البدء عبر الصفحة الرئيسية أو التواصل مباشرة معنا، وسنرشدك خطوة بخطوة نحو اختيار الحل الأنسب لك.',
  },
  {
    question: 'هل تتوفر خدمات مخصصة؟',
    answer: 'نعم، جميع خدماتنا قابلة للتخصيص بما يتناسب مع احتياجاتك وذوقك وميزانيتك.',
  },
  {
    question: 'ما مدى سرعة الاستجابة؟',
    answer: 'نحرص على الاستجابة السريعة والدعم المستمر على مدار الساعة.',
  },
];

export default function FAQSection() {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <section className="px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-7xl rounded-[2rem] border border-white/10 bg-white/5 p-8 shadow-[0_20px_60px_rgba(0,0,0,0.16)] sm:p-10 lg:p-14">
        <SectionTitle
          eyebrow="الأسئلة الشائعة"
          title="كل ما تريد معرفته عن خدماتنا"
          description="نقدّم لك إجابات واضحة ومباشرة لتعزز ثقتك بالرحلة التي تبدأها معنا."
        />

        <div className="mt-10 space-y-4">
          {faqs.map((faq, index) => {
            const isOpen = openIndex === index;
            return (
              <Reveal key={faq.question} delay={index * 80}>
                <div className="rounded-[1.25rem] border border-white/10 bg-[#0D1B2A]/70 p-5 text-right">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-4 text-right"
                    onClick={() => setOpenIndex(isOpen ? -1 : index)}
                    aria-expanded={isOpen}
                  >
                    <span className="text-lg font-semibold text-white">{faq.question}</span>
                    <FiChevronDown className={`shrink-0 text-[#D4AF37] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isOpen && <p className="mt-4 text-sm leading-8 text-slate-300">{faq.answer}</p>}
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
