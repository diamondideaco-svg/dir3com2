import SectionTitle from '../shared/SectionTitle';

const testimonials = [
  {
    name: 'سارة المنيع',
    role: 'عميلة مميزة',
    quote: 'الاحترافية والتفاصيل كانت متناهية، وكل شيء كان مصممًا ليراعي راحتنا.',
  },
  {
    name: 'عبدالله الشامسي',
    role: 'شريك أعمال',
    quote: 'تجربة استثنائية من البداية إلى النهاية، مع دعم سريع ونتائج ممتازة.',
  },
  {
    name: 'ليلى الحربي',
    role: 'عميلة متكررة',
    quote: 'لم أتوقع أن تكون الخدمة بهذا الرفاه، وكانت كل لحظة فيها مميزة.',
  },
];

export default function Testimonials() {
  return (
    <section id="testimonials" className="px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-7xl">
        <SectionTitle
          eyebrow="التقييمات"
          title="ما يقوله عملاؤنا عن تجربتهم معنا"
          description="الرضا والاعتماد هما أبرز ما يميز خدماتنا على مرّ السنوات."
        />

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {testimonials.map((item) => (
            <div key={item.name} className="rounded-[1.5rem] border border-white/10 bg-white/5 p-6 text-right transition-all duration-300 hover:-translate-y-2 hover:border-[#D4AF37]/40 hover:bg-[#D4AF37]/10">
              <p className="text-lg leading-8 text-slate-300">“{item.quote}”</p>
              <div className="mt-6">
                <p className="font-semibold text-white">{item.name}</p>
                <p className="text-sm text-[#D4AF37]">{item.role}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
