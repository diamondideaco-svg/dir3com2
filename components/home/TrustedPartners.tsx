import SectionTitle from '../shared/SectionTitle';
import Reveal from '../shared/Reveal';

const partners = ['LUXE TRAVEL', 'AURUM', 'NOVA', 'ELITE', 'VANTA'];

export default function TrustedPartners() {
  return (
    <section className="px-4 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl rounded-[2rem] border border-white/10 bg-white/5 px-6 py-10 shadow-[0_20px_60px_rgba(0,0,0,0.16)] sm:px-10">
        <SectionTitle
          eyebrow="شركاء موثوقون"
          title="نتمتع بثقة العلامات التي تفضل التميز"
          description="السمعة والموثوقية هما أساس ما نقوم به مع كل شريك وعملاء."
          centered
        />

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {partners.map((partner, index) => (
            <Reveal key={partner} delay={index * 80}>
              <div className="rounded-2xl border border-[#D4AF37]/20 bg-[#0D1B2A]/70 px-4 py-6 text-center text-lg font-semibold tracking-[0.25em] text-slate-200 transition-all duration-300 hover:-translate-y-1 hover:border-[#D4AF37] hover:text-[#D4AF37]">
                {partner}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
