import { FiBriefcase, FiHeadphones, FiShield, FiTrendingUp } from 'react-icons/fi';
import SectionTitle from '../shared/SectionTitle';

const services = [
  {
    title: 'استشارات مهنية',
    description: 'حلول مبنية على احتياجاتك الدقيقة مع متابعة دقيقة وتوجيه واضح.',
    icon: FiBriefcase,
  },
  {
    title: 'خدمة العملاء الفاخرة',
    description: 'تجربة مريحة من أول لحظة حتى إتمام الطلب بكل سلاسة.',
    icon: FiHeadphones,
  },
  {
    title: 'الحماية والموثوقية',
    description: 'نضمن لك بيئة آمنة واحترافية في كل خطوة من رحلتك.',
    icon: FiShield,
  },
  {
    title: 'التطوير المستمر',
    description: 'نُحسّن خدماتنا باستمرار لتواكب تطلعاتك وتقدمًا دائمًا.',
    icon: FiTrendingUp,
  },
];

export default function ServicesSection() {
  return (
    <section id="services" className="px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-7xl">
        <SectionTitle
          eyebrow="خدماتنا"
          title="نقدّم لك تجربة متكاملة تجمع بين الفخامة والاحتراف"
          description="من الاستشارة إلى التنفيذ، نعمل على خلق تجربة سلسة تعكس جودة العمل واهتمامنا بالتفاصيل."
        />

        <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {services.map((service) => {
            const Icon = service.icon;
            return (
              <div
                key={service.title}
                className="group rounded-[1.5rem] border border-white/10 bg-white/5 p-6 text-right shadow-lg shadow-black/20 transition-all duration-300 hover:-translate-y-2 hover:border-[#D4AF37]/40 hover:bg-[#D4AF37]/10"
              >
                <div className="inline-flex rounded-2xl bg-[#D4AF37]/10 p-3 text-[#D4AF37] transition group-hover:scale-110">
                  <Icon size={22} />
                </div>
                <h3 className="mt-5 text-xl font-semibold text-white">{service.title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-300">{service.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
