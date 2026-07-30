import Link from 'next/link';
import { HiSparkles } from 'react-icons/hi2';
import { buttonVariants } from '@/components/ui/button';

export default function HomeCta() {
  return (
    <section id="contact" className="px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <div className="mx-auto max-w-7xl overflow-hidden rounded-[40px] bg-[linear-gradient(135deg,#0D1B2A_0%,#17314A_62%,#D4AF37_160%)] px-6 py-10 text-[var(--color-light)] shadow-[0_28px_65px_rgba(13,27,42,0.2)] sm:px-8 lg:px-12 lg:py-12">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-4 py-2 text-sm text-[var(--color-gold)]">
              <HiSparkles /> الدِّبرة قريباً داخل رحلتك
            </span>
            <h2 className="mt-5 text-3xl font-semibold leading-[1.25] sm:text-4xl">ابدأ تجربة dir3com الآن، واترك مساحة للذكاء حين يحين وقته.</h2>
            <p className="mt-4 max-w-2xl text-base leading-8 text-white/75">
              الصفحة أصبحت جاهزة لتوجيه الزوار، عرض الخدمات، إبراز الثقة، وتقديم دعوات واضحة لاتخاذ القرار من دون إدخال أي منطق غير مطلوب في هذه المرحلة.
            </p>
          </div>

          <div className="flex flex-col gap-3 lg:items-end">
            <Link href="/booking" className={buttonVariants({ variant: 'gold', size: 'lg' })}>
              ابدأ رحلتك
            </Link>
            <Link href="/contact" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
              تحدث مع فريق dir3com
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}