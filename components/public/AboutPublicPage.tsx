'use client';

import { FiCompass, FiShield, FiUsers } from 'react-icons/fi';
import { HiSparkles } from 'react-icons/hi2';
import { ContentContainer, ResponsiveGrid, SectionContainer } from '@/components/design-system';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import PublicCtaBanner from '@/components/public/PublicCtaBanner';
import PublicHero from '@/components/public/PublicHero';
import PublicStats from '@/components/public/PublicStats';
import { useLanguage } from '@/components/i18n/LanguageProvider';

const values = {
  ar: [
    { title: 'الثقة', description: 'الخدمة أولاً، والحساب بعد رضاك.', icon: FiShield },
    { title: 'الوضوح', description: 'واجهة تعرض القيمة والسياسات بلغة مباشرة وراقية.', icon: FiCompass },
    { title: 'الضيافة', description: 'تجربة عربية حديثة تحترم الوقت والذوق.', icon: FiUsers },
    { title: 'الاستعداد', description: 'الدبرة حاضر بصرياً لتكاملات مستقبلية فقط.', icon: HiSparkles },
  ],
  en: [
    { title: 'Trust', description: 'Service first, with clear settlement after you are satisfied.', icon: FiShield },
    { title: 'Clarity', description: 'A direct, refined view of value and policies.', icon: FiCompass },
    { title: 'Hospitality', description: 'A modern Arabic experience that respects your time and taste.', icon: FiUsers },
    { title: 'Readiness', description: 'DABRA is visually present for future integrations only.', icon: HiSparkles },
  ],
} as const;

const copy = {
  ar: {
    heroEyebrow: 'عن dir3com', heroTitle: 'من نحن', heroDescription: 'dir3com منصة ضيافة وسفر عربية فاخرة تبني الثقة كجزء من واجهة الاستخدام، لا كرسالة جانبية.', heroHighlight: 'هوية واحدة، تجربة نظيفة، وصفحات عامة متماسكة تضع العميل في مركز القرار.', heroChips: ['dir3com', 'ضمان الدرع', 'أولوية عربية'],
    stats: [{ label: 'هوية العلامة', value: 'dir3com' }, { label: 'أساس التجربة', value: 'الثقة' }, { label: 'النمط', value: 'فخامة' }],
    storyLabel: 'قصتنا', story: 'dir3com صُممت لتجمع بين الفخامة العربية والوضوح التشغيلي، بحيث يمكن للزائر أن يفهم الخدمة، يثق بالعرض، ويتحرك داخل المنصة من دون تعقيد أو تشتيت.', visionLabel: 'رؤيتنا', vision: 'بناء منصة عامة متكاملة ومهيأة للنمو، تقدم السفر والخدمات بصياغة عربية حديثة وتحافظ على قابلية التوسع من دون المساس بالبساطة أو الثقة.', ctaTitle: 'تعرف على dir3com ثم اختر ما يناسب رحلتك.', ctaDescription: 'اكتشف الخدمات المتاحة وتواصل معنا عند الحاجة إلى مساعدة أو توضيح.',
  },
  en: {
    heroEyebrow: 'About dir3com', heroTitle: 'About us', heroDescription: 'dir3com is a refined Arabic hospitality and travel platform that makes trust part of the experience.', heroHighlight: 'One identity, a clear experience, and public pages that keep the customer at the centre of every decision.', heroChips: ['dir3com', 'Shield assurance', 'Arabic-first care'],
    stats: [{ label: 'Brand identity', value: 'dir3com' }, { label: 'Experience foundation', value: 'Trust' }, { label: 'Style', value: 'Luxury' }],
    storyLabel: 'Our story', story: 'dir3com brings Arabic luxury together with operational clarity, so visitors can understand the service, trust the offer, and move through the platform without friction.', visionLabel: 'Our vision', vision: 'To build a complete, growth-ready public platform for travel and services with modern Arabic expression, simplicity, and trust.', ctaTitle: 'Get to know dir3com, then choose what fits your journey.', ctaDescription: 'Explore the available services and contact us when you need help or clarification.',
  },
} as const;

export default function AboutPublicPage() {
  const { language } = useLanguage();
  const t = copy[language];
  return (
    <div className="page-stack-shell">
      <PublicHero
        eyebrow={t.heroEyebrow}
        title={t.heroTitle}
        description={t.heroDescription}
        highlight={t.heroHighlight}
        chips={[...t.heroChips]}
      />
      <PublicStats
        stats={[...t.stats]}
      />

      <SectionContainer className="py-8 lg:py-10">
        <ContentContainer className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <Card className="bg-white/82">
            <CardHeader>
              <p className="text-sm font-medium tracking-[0.18em] text-[var(--color-gold)]">{t.storyLabel}</p>
              <CardTitle className="mt-3 text-3xl">{t.storyLabel}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-base leading-8 text-[var(--color-muted)]">
                {t.story}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-[var(--color-surface-strong)] text-[var(--color-light)]">
            <CardHeader>
              <p className="text-sm font-medium tracking-[0.18em] text-[var(--color-gold)]">{t.visionLabel}</p>
              <CardTitle className="mt-3 text-3xl text-[var(--color-light)]">{t.visionLabel}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-base leading-8 text-white/74">
                {t.vision}
              </p>
            </CardContent>
          </Card>
        </ContentContainer>
      </SectionContainer>

      <SectionContainer className="py-8 lg:py-10">
        <ContentContainer>
          <ResponsiveGrid className="xl:grid-cols-4">
            {values[language].map(({ title, description, icon: Icon }) => (
              <Card key={title} className="bg-white/82">
                <CardContent className="p-6">
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-surface)] text-[var(--color-gold)]">
                    <Icon size={20} />
                  </span>
                  <p className="mt-4 text-xl font-semibold text-[var(--color-navy)]">{title}</p>
                  <p className="mt-3 text-sm leading-8 text-[var(--color-muted)]">{description}</p>
                </CardContent>
              </Card>
            ))}
          </ResponsiveGrid>
        </ContentContainer>
      </SectionContainer>

      <PublicCtaBanner
        title={t.ctaTitle}
        description={t.ctaDescription}
      />
    </div>
  );
}