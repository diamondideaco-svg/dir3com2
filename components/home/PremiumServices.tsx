import { FiCompass, FiHeart, FiShield } from 'react-icons/fi';
import SectionTitle from '../shared/SectionTitle';
import Reveal from '../shared/Reveal';

const services = [
  {
    title: 'تخطيط رحلات فاخر',
    description: 'تنظيم دقيق يوازن بين الراحة، السرعة، واللمسة المعمارية للتميز.',
    icon: FiCompass,
  },
  {
    title: 'دعم شخصي 24/7',
    description: 'فريقنا يرافقك بكل حرص خلال كل لحظة من الرحلة.',
    icon: FiHeart,
  },
  {
    title: 'إدارة مضمونة',
    description: 'مصادقة عالية، سلامة، واحترافية في كل تفاصيلك.',
    icon: FiShield,
  },
];

export default function PremiumServices() {
  return (
    <section className="px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-7xl rounded-[2rem] border border-[#D4AF37]/20 bg-[#07111D] p-8 shadow-[0_20px_60px_rgba(0,0,0,0.2)] sm:p-10 lg:p-14">
        <SectionTitle
          eyebrow="خدمات مميزة"
          title="خدمات مصممة لتمنحك تجربة فاخرة من البداية إلى النهاية"
          description="نحن نركّز على التفاصيل الدقيقة لإنشاء رحلة لا تذكر فقط بالراحة، بل بالتميز أيضًا."
        />

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {services.map((service, index) => {
            const Icon = service.icon;
            return (
              <Reveal key={service.title} delay={index * 120}>
                <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-6 text-right transition-all duration-300 hover:-translate-y-2 hover:border-[#D4AF37]/40">
                  <div className="inline-flex rounded-2xl bg-[#D4AF37]/10 p-3 text-[#D4AF37]">
                    <Icon size={22} />
                  </div>
                  <h3 className="mt-5 text-xl font-semibold text-white">{service.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-300">{service.description}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
