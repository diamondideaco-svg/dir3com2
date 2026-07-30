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
      <p className="text-sm font-medium tracking-[0.18em] text-[var(--color-gold)]">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-semibold text-[var(--color-navy)] sm:text-4xl">{title}</h2>
      <p className="mt-4 max-w-2xl text-base leading-8 text-[var(--color-muted)]">{description}</p>
    </div>
  );
}