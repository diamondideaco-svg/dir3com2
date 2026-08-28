import { FiCheckCircle, FiShield, FiStar } from 'react-icons/fi';
import { ContentContainer, CtaBlock, ResponsiveGrid, SectionContainer } from '@/components/design-system';
import { Card, CardContent } from '@/components/ui/card';

type PublicFeatureStripProps = {
  trustMessage: string;
};

const features = [
  {
    title: 'الخدمة أولاً',
    description: 'كل صفحة تحافظ على نفس رسالة الثقة والوضوح والنبرة الجديدة للعلامة.',
    icon: FiShield,
  },
  {
    title: 'مكونات قابلة للتوسعة',
    description: 'السطح البصري الآن موحّد ويمكن تمديده عبر الصفحات العامة دون كسر الإيقاع.',
    icon: FiCheckCircle,
  },
  {
    title: 'تجربة متسقة وواضحة',
    description: 'هوية dir3com تبقى ثابتة عبر كل الصفحات العامة بنفس المسافات والخطوط والألوان.',
    icon: FiStar,
  },
];

export default function PublicFeatureStrip({ trustMessage }: PublicFeatureStripProps) {
  return (
    <SectionContainer className="py-8 lg:py-10">
      <ContentContainer>
        <CtaBlock className="rounded-[32px] border-0 px-6 py-7 shadow-[0_24px_60px_rgba(13,27,42,0.16)]">
          <p className="text-center text-lg font-semibold text-[var(--color-gold)]">{trustMessage}</p>
          <ResponsiveGrid className="mt-6 gap-4 xl:grid-cols-3">
            {features.map(({ title, description, icon: Icon }) => (
              <Card key={title} className="border-[color:var(--color-border)] bg-white/7 text-[var(--color-light)] shadow-none backdrop-blur-sm">
                <CardContent className="p-5">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#E3C97A_0%,#D4AF37_100%)] text-[var(--color-navy)]">
                    <Icon size={18} />
                  </span>
                  <p className="mt-4 text-lg font-semibold">{title}</p>
                  <p className="mt-3 text-sm leading-8 text-white/72">{description}</p>
                </CardContent>
              </Card>
            ))}
          </ResponsiveGrid>
        </CtaBlock>
      </ContentContainer>
    </SectionContainer>
  );
}
