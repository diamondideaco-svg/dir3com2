import { cn } from '@/lib/utils';

interface SectionHeadingProps {
  eyebrow: string;
  title: string;
  description: string;
  align?: 'right' | 'center';
  className?: string;
}

export default function SectionHeading({ eyebrow, title, description, align = 'right', className }: SectionHeadingProps) {
  return (
    <div className={cn(align === 'center' && 'mx-auto text-center', className)}>
      <p className="text-xs font-semibold tracking-[0.28em] text-[var(--color-gold)] sm:text-sm">{eyebrow}</p>
      <h2 className="mt-3 max-w-3xl text-3xl font-semibold leading-[1.25] text-[var(--color-navy)] sm:text-4xl lg:text-[2.7rem]">{title}</h2>
      <p className="mt-4 max-w-2xl text-sm leading-8 text-[var(--color-muted)] sm:text-base">{description}</p>
    </div>
  );
}