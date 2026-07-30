import { cn } from '@/lib/utils';

type TypographyProps = {
  children: string;
  className?: string;
};

export function Eyebrow({ children, className }: TypographyProps) {
  return <p className={cn('ds-heading-eyebrow', className)}>{children}</p>;
}

export function SectionTitle({ children, className }: TypographyProps) {
  return <h2 className={cn('ds-heading-title', className)}>{children}</h2>;
}

export function SectionDescription({ children, className }: TypographyProps) {
  return <p className={cn('ds-heading-description', className)}>{children}</p>;
}
