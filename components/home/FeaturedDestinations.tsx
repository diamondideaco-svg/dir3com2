import SectionTitle from '../shared/SectionTitle';
import Reveal from '../shared/Reveal';

const destinations = [
  {
    title: 'الدوحة',
    subtitle: 'فخامة المدينة والراحة الراقية',
    tag: 'وجهة مميزة',
  },
  {
    title: 'دبي',
    subtitle: 'تصاميم راقية وتجارب استثنائية',
    tag: 'عطلة فاخرة',
  },
  {
    title: 'الرياض',
    subtitle: 'توازن بين التميز والرفاه',
    tag: 'الأسلوب الجديد',
  },
];

export default function FeaturedDestinations() {
  return (
    <section className="px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-7xl">
        <SectionTitle
          eyebrow="الوجهات المميزة"
          title="استكشف أماكن تجمع بين الراحة والتميز"
          description="اختيارنا يركز على الرفاهية، التفاصيل، والخبرة التي تترك انطباعًا لا يُنسى."
        />

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {destinations.map((destination, index) => (
            <Reveal key={destination.title} delay={index * 120}>
              <div className="group overflow-hidden rounded-[1.75rem] border border-white/10 bg-gradient-to-br from-[#10253d] to-[#0B1524] shadow-[0_20px_60px_rgba(0,0,0,0.2)] transition-all duration-300 hover:-translate-y-2 hover:border-[#D4AF37]/40">
                <div className="h-44 bg-[radial-gradient(circle_at_top,_rgba(212,175,55,0.3),_transparent_60%)]" />
                <div className="p-6 text-right">
                  <p className="text-sm font-semibold text-[#D4AF37]">{destination.tag}</p>
                  <h3 className="mt-3 text-2xl font-semibold text-white">{destination.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-300">{destination.subtitle}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
