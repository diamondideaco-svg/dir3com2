import Link from 'next/link';
import { HiSparkles } from 'react-icons/hi2';
import { ContentContainer, CtaBlock, SectionContainer } from '@/components/design-system';
import { buttonVariants } from '@/components/ui/button';

type PublicCtaBannerProps = {
  title: string;
  description: string;
};

export default function PublicCtaBanner({ title, description }: PublicCtaBannerProps) {
  return (
    <SectionContainer className="py-10 lg:py-12">
      <ContentContainer>
        <CtaBlock className="rounded-[36px] px-6 py-8 shadow-[0_28px_65px_rgba(13,27,42,0.2)] sm:px-8 lg:px-10">
        <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-4 py-2 text-sm text-[var(--color-gold)]">
              <HiSparkles /> الدبرة واجهة مستقبلية فقط
            </span>
            <h2 className="mt-4 text-3xl font-semibold leading-[1.3] sm:text-4xl">{title}</h2>
            <p className="mt-4 max-w-2xl text-base leading-8 text-white/74">{description}</p>
          </div>
          <div className="flex flex-col gap-3 lg:items-end">
            <Link href="/booking" className={buttonVariants({ variant: 'gold', size: 'lg' })}>
              ابدأ رحلتك
            </Link>
            <Link href="/contact" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
              تواصل مع dir3com
            </Link>
          </div>
        </div>
        </CtaBlock>
      </ContentContainer>
    </SectionContainer>
  );
}