import { FiCompass, FiShield, FiUsers } from 'react-icons/fi';
import { HiSparkles } from 'react-icons/hi2';
import { ContentContainer, ResponsiveGrid, SectionContainer } from '@/components/design-system';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import PublicCtaBanner from '@/components/public/PublicCtaBanner';
import PublicHero from '@/components/public/PublicHero';
import PublicRouteIndex from '@/components/public/PublicRouteIndex';
import PublicStats from '@/components/public/PublicStats';

const values = [
  { title: 'الثقة', description: 'الخدمة أولاً، والحساب بعد رضاك.', icon: FiShield },
  { title: 'الوضوح', description: 'واجهة تعرض القيمة والسياسات بلغة مباشرة وراقية.', icon: FiCompass },
  { title: 'الضيافة', description: 'تجربة عربية حديثة تحترم الوقت والذوق.', icon: FiUsers },
  { title: 'الاستعداد', description: 'الدبرة حاضر بصرياً لتكاملات مستقبلية فقط.', icon: HiSparkles },
];

export default function AboutPublicPage() {
  return (
    <div className="page-stack-shell">
      <PublicHero
        eyebrow="ABOUT DIR3COM"
        title="من نحن"
        description="dir3com منصة ضيافة وسفر عربية فاخرة تبني الثقة كجزء من واجهة الاستخدام، لا كرسالة جانبية." 
        highlight="هوية واحدة، تجربة نظيفة، وصفحات عامة متماسكة تضع العميل في مركز القرار."
        chips={['dir3com', 'ضمان الدرع', 'RTL First']}
      />
      <PublicStats
        stats={[
          { label: 'هوية العلامة', value: 'dir3com' },
          { label: 'أساس التجربة', value: 'Trust' },
          { label: 'النمط', value: 'Luxury' },
        ]}
      />

      <SectionContainer className="py-8 lg:py-10">
        <ContentContainer className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <Card className="bg-white/82">
            <CardHeader>
              <p className="text-sm font-medium tracking-[0.18em] text-[var(--color-gold)]">OUR STORY</p>
              <CardTitle className="mt-3 text-3xl">قصتنا</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-base leading-8 text-[var(--color-muted)]">
                dir3com صُممت لتجمع بين الفخامة العربية والوضوح التشغيلي، بحيث يمكن للزائر أن يفهم الخدمة، يثق بالعرض، ويتحرك داخل المنصة من دون تعقيد أو تشتيت.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-[var(--color-surface-strong)] text-[var(--color-light)]">
            <CardHeader>
              <p className="text-sm font-medium tracking-[0.18em] text-[var(--color-gold)]">OUR VISION</p>
              <CardTitle className="mt-3 text-3xl text-[var(--color-light)]">رؤيتنا</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-base leading-8 text-white/74">
                بناء منصة عامة متكاملة ومهيأة للنمو، تقدم السفر والخدمات بصياغة عربية حديثة وتحافظ على قابلية التوسع من دون المساس بالبساطة أو الثقة.
              </p>
            </CardContent>
          </Card>
        </ContentContainer>
      </SectionContainer>

      <SectionContainer className="py-8 lg:py-10">
        <ContentContainer>
          <ResponsiveGrid className="xl:grid-cols-4">
            {values.map(({ title, description, icon: Icon }) => (
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

      <PublicRouteIndex />
      <PublicCtaBanner
        title="تعرف على dir3com ثم انتقل إلى الصفحة التي تناسب رحلتك."
        description="باقي الصفحات العامة تستخدم النظام نفسه، ما يجعل الانتقال بينها متماسكاً وقابلاً للتوسع لاحقاً."
      />
    </div>
  );
}