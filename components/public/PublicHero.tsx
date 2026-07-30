import Link from 'next/link';
import { FiArrowLeft, FiShield } from 'react-icons/fi';
import { HiSparkles } from 'react-icons/hi2';
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
    <section className="relative isolate overflow-hidden px-4 pb-10 pt-8 sm:px-6 lg:px-8 lg:pb-14 lg:pt-12">
      <div className="absolute inset-x-0 top-0 -z-10 h-[420px] bg-[radial-gradient(circle_at_top_right,rgba(212,175,55,0.18),transparent_30%),radial-gradient(circle_at_top_left,rgba(13,27,42,0.1),transparent_30%)]" />
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div>
          <p className="text-sm font-medium tracking-[0.18em] text-[var(--color-gold)]">{eyebrow}</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-[1.2] text-[var(--color-navy)] sm:text-5xl lg:text-6xl">{title}</h1>
          <p className="mt-5 max-w-2xl text-lg leading-9 text-[var(--color-muted)]">{description}</p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link href="/booking" className={buttonVariants({ variant: 'gold', size: 'lg' })}>
              ابدأ رحلتك
              <FiArrowLeft />
            </Link>
            <a href="#dibrah" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
              اسأل الدبرة
              <HiSparkles />
            </a>
          </div>

          <div className="mt-7 flex flex-wrap gap-2">
            {chips.map((chip) => (
              <span key={chip} className="rounded-full border border-[color:var(--color-border)] bg-white/80 px-4 py-2 text-sm font-medium text-[var(--color-navy)]">
                {chip}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-[36px] border border-[color:var(--color-border)] bg-[linear-gradient(135deg,rgba(13,27,42,0.98)_0%,rgba(22,40,60,0.95)_65%,rgba(212,175,55,0.7)_180%)] p-6 text-[var(--color-light)] shadow-[0_24px_60px_rgba(13,27,42,0.18)]">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-4 py-2 text-sm text-[var(--color-gold)]">
            <FiShield /> ضمان الدرع
          </div>
          <p className="mt-6 text-3xl font-semibold leading-[1.4]">{highlight}</p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <div className="rounded-[24px] border border-white/10 bg-white/6 px-4 py-4">
              <p className="text-sm text-white/65">لغة التصميم</p>
              <p className="mt-2 text-lg font-semibold">RTL أولاً</p>
            </div>
            <div id="dibrah" className="rounded-[24px] border border-white/10 bg-white/6 px-4 py-4">
              <p className="text-sm text-white/65">واجهة المستقبل</p>
              <p className="mt-2 text-lg font-semibold">الدبرة كعنصر UI فقط</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}