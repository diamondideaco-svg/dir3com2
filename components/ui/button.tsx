import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ring-offset-transparent',
  {
    variants: {
      variant: {
        default: 'bg-[var(--color-navy)] text-[var(--color-light)] hover:-translate-y-0.5 hover:shadow-[0_16px_35px_rgba(13,27,42,0.18)]',
        gold: 'bg-[var(--color-gold)] text-[var(--color-navy)] hover:-translate-y-0.5 hover:shadow-[0_16px_35px_rgba(212,175,55,0.28)]',
        outline:
          'border border-[color:var(--color-border)] bg-white/70 text-[var(--color-navy)] hover:border-[var(--color-gold)] hover:bg-[var(--color-surface-strong)]',
        ghost: 'bg-transparent text-[var(--color-navy)] hover:bg-[var(--color-surface)]',
      },
      size: {
        default: 'h-11 px-5',
        sm: 'h-9 px-4 text-xs',
        lg: 'h-12 px-6 text-base',
        icon: 'h-11 w-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };