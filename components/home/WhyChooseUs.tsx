import { FiAnchor, FiClock, FiGift } from 'react-icons/fi';
import SectionTitle from '../shared/SectionTitle';

const reasons = [
  {
    title: 'التخصيص الكامل',
    description: 'نصمم الحلول بما يتناسب مع احتياجاتك وتطلعاتك الدقيقة.',
    icon: FiGift,
  },
  {
    title: 'الالتزام بالوقت',
    description: 'نحرص على تنفيذ كل خطوة بدقة وفي الوقت المحدد.',
    icon: FiClock,
  },
  {
    title: 'الاحترافية التي تثق بها',
    description: 'فريقنا يضع الجودة أولًا في كل تفاصيل العمل.',
    icon: FiAnchor,
  },
];

export default function WhyChooseUs() {
  return (
    <section id="why-us" className="px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-7xl rounded-[2rem] border border-[#D4AF37]/20 bg-gradient-to-br from-[#10253d] to-[#0B1524] p-8 shadow-[0_25px_60px_rgba(0,0,0,0.25)] sm:p-10 lg:p-14">
        <SectionTitle
          eyebrow="لماذا نحن"
          title="لأن كل تفاصيلك deserve a luxurious experience"
          description="نحن لا نقدم خدمات فقط؛ بل نُبني معك تجربة تليق بالتميز والخصوصية."
        />

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {reasons.map((reason) => {
            const Icon = reason.icon;
            return (
              <div key={reason.title} className="group rounded-[1.25rem] border border-white/10 bg-[#0D1B2A]/70 p-6 text-right transition-all duration-300 hover:-translate-y-2 hover:border-[#D4AF37]/40 hover:bg-[#0D1B2A]">
                <div className="inline-flex rounded-2xl bg-[#D4AF37]/10 p-3 text-[#D4AF37] transition group-hover:scale-110">
                  <Icon size={22} />
                </div>
                <h3 className="mt-5 text-xl font-semibold text-white">{reason.title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-300">{reason.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
