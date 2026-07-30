import { cn } from '@/lib/utils';
import { Eyebrow, SectionDescription, SectionTitle } from '@/components/design-system';

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
      <Eyebrow>{eyebrow}</Eyebrow>
      <SectionTitle>{title}</SectionTitle>
      <SectionDescription>{description}</SectionDescription>
    </div>
  );
}