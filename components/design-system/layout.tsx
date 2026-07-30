import type { ElementType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

type SectionContainerProps = {
  children: ReactNode;
  className?: string;
  as?: ElementType;
};

export function SectionContainer({ children, className, as: Component = 'section' }: SectionContainerProps) {
  return <Component className={cn('px-4 py-10 sm:px-6 lg:px-8 lg:py-14', className)}>{children}</Component>;
}

type ContentContainerProps = {
  children: ReactNode;
  className?: string;
};

export function ContentContainer({ children, className }: ContentContainerProps) {
  return <div className={cn('mx-auto max-w-7xl', className)}>{children}</div>;
}

type ResponsiveGridProps = {
  children: ReactNode;
  className?: string;
};

export function ResponsiveGrid({ children, className }: ResponsiveGridProps) {
  return <div className={cn('grid gap-5 md:grid-cols-2 xl:grid-cols-3', className)}>{children}</div>;
}
