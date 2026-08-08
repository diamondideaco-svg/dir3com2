import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ring-offset-transparent',
  {
    variants: {
      variant: {
        default: 'bg-[var(--brand-gradient)] text-[var(--color-light)] shadow-[0_16px_36px_rgba(16,32,51,0.2)] hover:-translate-y-0.5 hover:shadow-[0_22px_42px_rgba(16,32,51,0.24)]',
        gold: 'bg-[linear-gradient(135deg,#e2c790_0%,#c8a86b_100%)] text-[var(--color-navy)] shadow-[0_16px_35px_rgba(200,168,107,0.24)] hover:-translate-y-0.5 hover:shadow-[0_20px_38px_rgba(200,168,107,0.3)]',
        outline:
          'border border-[color:var(--color-border)] bg-[var(--color-card-strong)]/80 text-[var(--color-navy)] shadow-[0_10px_28px_rgba(16,32,51,0.08)] hover:border-[var(--color-gold)] hover:bg-[var(--color-surface-strong)]',
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