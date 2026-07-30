import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type BadgeProps = {
  children: ReactNode;
  className?: string;
};

export function Badge({ children, className }: BadgeProps) {
  return <span className={cn('inline-flex items-center gap-2 rounded-full border border-[var(--color-gold)]/22 bg-[var(--color-gold)]/10 px-3 py-1.5 text-xs font-semibold text-[var(--color-gold)]', className)}>{children}</span>;
}

export function Chip({ children, className }: BadgeProps) {
  return <span className={cn('rounded-full border border-[color:var(--color-border)] bg-[var(--color-shell)] px-3 py-2 text-xs font-medium text-[var(--color-navy)]', className)}>{children}</span>;
}

export function TrustPill({ children, className }: BadgeProps) {
  return <span className={cn('inline-flex items-center gap-2 rounded-full border border-[color:var(--color-border)] bg-white/75 px-4 py-2 text-sm font-medium text-[var(--color-navy)]', className)}>{children}</span>;
}
