import Link from 'next/link';
import { HiSparkles } from 'react-icons/hi2';
import { buttonVariants } from '@/components/ui/button';

type PublicCtaBannerProps = {
  title: string;
  description: string;
};

export default function PublicCtaBanner({ title, description }: PublicCtaBannerProps) {
  return (
    <section className="px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
      <div className="mx-auto max-w-7xl rounded-[36px] bg-[linear-gradient(135deg,#0D1B2A_0%,#17314A_62%,#D4AF37_180%)] px-6 py-8 text-[var(--color-light)] shadow-[0_28px_65px_rgba(13,27,42,0.2)] sm:px-8 lg:px-10">
        <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-4 py-2 text-sm text-[var(--color-gold)]">
              <HiSparkles /> الدِّبرة واجهة مستقبلية فقط
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
      </div>
    </section>
  );
}