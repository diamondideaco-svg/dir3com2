import Link from 'next/link';
import { FiShield } from 'react-icons/fi';
import { cn } from '@/lib/utils';

type Dir3LogoLockupProps = {
  href?: string;
  className?: string;
  compact?: boolean;
  reveal?: boolean;
};

export default function Dir3LogoLockup({ href = '/#home', className, compact = false, reveal = false }: Dir3LogoLockupProps) {
  const content = (
    <>
      <span className={cn('dir3-mark', compact ? 'dir3-mark--compact' : '', reveal ? 'dir3-reveal-logo' : '')} aria-hidden="true">
        <span className="dir3-mark__arc" />
        <span className="dir3-mark__shell" />
        <span className="dir3-mark__icon">
          <FiShield size={compact ? 16 : 22} />
        </span>
      </span>
      <span className="flex flex-col text-right">
        <span className={cn('font-[var(--font-display)] font-semibold leading-none text-[var(--color-navy)]', compact ? 'text-xl' : 'text-2xl')}>dir3com</span>
        <span className={cn('mt-1 font-medium tracking-[0.18em] text-[var(--color-muted)]', compact ? 'text-[10px]' : 'text-xs')}>درعكم للسياحة</span>
      </span>
    </>
  );

  return (
    <Link href={href} className={cn('flex items-center gap-3', className)} aria-label="dir3com">
      {content}
    </Link>
  );
}
