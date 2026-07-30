import { FiCheckCircle, FiShield, FiStar } from 'react-icons/fi';
import { Card, CardContent } from '@/components/ui/card';

type PublicFeatureStripProps = {
  trustMessage: string;
};

const features = [
  {
    title: 'الخدمة أولاً',
    description: 'كل صفحة تحافظ على نفس رسالة الثقة والوضوح قبل أي خطوة تنفيذية.',
    icon: FiShield,
  },
  {
    title: 'مكونات قابلة للتوسعة',
    description: 'البنية مبنية لتتوسع لاحقاً من دون تكرار أو كسر للهوية البصرية.',
    icon: FiCheckCircle,
  },
  {
    title: 'تجربة فاخرة نظيفة',
    description: 'هوية dir3com تبقى ثابتة عبر كل الصفحات العامة وبنفس المسافات والخطوط.',
    icon: FiStar,
  },
];

export default function PublicFeatureStrip({ trustMessage }: PublicFeatureStripProps) {
  return (
    <section className="px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="rounded-[32px] bg-[var(--color-navy)] px-6 py-7 text-[var(--color-light)] shadow-[0_24px_60px_rgba(13,27,42,0.16)]">
          <p className="text-center text-lg font-semibold text-[var(--color-gold)]">{trustMessage}</p>
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {features.map(({ title, description, icon: Icon }) => (
              <Card key={title} className="border-white/10 bg-white/6 text-[var(--color-light)] shadow-none">
                <CardContent className="p-5">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--color-gold)] text-[var(--color-navy)]">
                    <Icon size={18} />
                  </span>
                  <p className="mt-4 text-lg font-semibold">{title}</p>
                  <p className="mt-3 text-sm leading-8 text-white/72">{description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}