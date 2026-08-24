import Link from 'next/link';
import { FiArrowLeft, FiShield } from 'react-icons/fi';
import { HiSparkles } from 'react-icons/hi2';
import { Badge, Chip, ContentContainer, HeroBlock, SectionContainer } from '@/components/design-system';
import { buttonVariants } from '@/components/ui/button';

type PublicHeroProps = {
  eyebrow: string;
  title: string;
  description: string;
  highlight: string;
  chips: string[];
};

export default function PublicHero({ eyebrow, title, description, highlight, chips }: PublicHeroProps) {
  return (
    <SectionContainer className="relative isolate overflow-hidden pb-10 pt-8 lg:pb-14 lg:pt-12">
      <div className="absolute inset-x-0 top-0 -z-10 h-[460px] bg-[radial-gradient(circle_at_top_right,rgba(212,175,55,0.2),transparent_30%),radial-gradient(circle_at_top_left,rgba(212,175,55,0.12),transparent_28%)]" />
      <ContentContainer className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div>
          <p className="text-sm font-medium tracking-[0.18em] text-[var(--color-gold)]">{eyebrow}</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-[1.2] text-[var(--color-navy)] sm:text-5xl lg:text-6xl">{title}</h1>
          {description ? <p className="mt-5 max-w-2xl text-lg leading-9 text-[var(--color-muted)]">{description}</p> : null}

          <div className="mt-5 inline-flex rounded-full border border-[var(--color-border)] bg-[var(--color-card-strong)] px-4 py-2 text-sm font-medium text-[var(--color-navy)] shadow-[0_12px_28px_rgba(15,23,42,0.07)]">
            dir3com | درعك الحامي للسياحة.
          </div>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link href="/booking" className={buttonVariants({ variant: 'gold', size: 'lg' })}>
              ابدأ رحلتك
              <FiArrowLeft />
            </Link>
            <a href="#dibrah" className={`${buttonVariants({ variant: 'outline', size: 'lg' })} focus-visible:ring-[var(--color-gold)]/50`}>
              اسأل الدبرة
              <HiSparkles />
            </a>
          </div>

          <div className="mt-7 flex flex-wrap gap-2">
            {chips.map((chip) => (
              <Chip key={chip} className="px-4 text-sm">
                {chip}
              </Chip>
            ))}
          </div>
        </div>

        {highlight ? <HeroBlock>
          <Badge className="border-[color:var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-gold)]">
            <FiShield /> dir3com Shield
          </Badge>
          <p className="mt-6 text-3xl font-semibold leading-[1.4]">{highlight}</p>
        </HeroBlock> : null}
      </ContentContainer>
    </SectionContainer>
  );
}
