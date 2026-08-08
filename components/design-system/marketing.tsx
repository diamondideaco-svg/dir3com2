import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, Chip, TrustPill } from '@/components/design-system/display';
import { cn } from '@/lib/utils';

type BlockProps = {
  children: ReactNode;
  className?: string;
};

export function HeroBlock({ children, className }: BlockProps) {
  return <div className={cn('rounded-[36px] border border-[color:var(--color-border)] bg-[var(--brand-gradient-soft)] p-6 text-[var(--color-light)] shadow-[0_26px_58px_rgba(16,32,51,0.18)]', className)}>{children}</div>;
}

export function SectionSurface({ children, className }: BlockProps) {
  return <div className={cn('rounded-[30px] border border-[color:var(--color-border)] bg-[var(--color-card-strong)] p-5 shadow-[0_20px_45px_rgba(16,32,51,0.08)] sm:p-6', className)}>{children}</div>;
}

export function CtaBlock({ children, className }: BlockProps) {
  return <div className={cn('overflow-hidden rounded-[40px] border border-[var(--color-gold)]/18 bg-[linear-gradient(140deg,#102033_0%,#1c3550_54%,#9d5c4d_120%,#c8a86b_180%)] p-6 text-[var(--color-light)] shadow-[0_30px_70px_rgba(16,32,51,0.22)] sm:p-8', className)}>{children}</div>;
}

export function TrustComponent({ title, note }: { title: string; note: string }) {
  return (
    <Card className="bg-white/86">
      <CardHeader>
        <Badge>{title}</Badge>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-7 text-[var(--color-muted)]">{note}</p>
      </CardContent>
    </Card>
  );
}

export function ShieldGuaranteeComponent({ message }: { message: string }) {
  return (
    <div className="rounded-[24px] border border-[var(--color-gold)]/22 bg-[var(--color-gold)]/10 p-4 text-sm font-medium text-[var(--color-navy)]">
      <TrustPill>{message}</TrustPill>
    </div>
  );
}

export function PaymentComponent({ methods }: { methods: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {methods.map((method) => (
        <Chip key={method}>{method}</Chip>
      ))}
    </div>
  );
}

export function ReviewComponent({ author, text }: { author: string; text: string }) {
  return (
    <Card className="bg-white/86">
      <CardHeader>
        <CardTitle className="text-lg">{author}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-8 text-[var(--color-muted)]">{text}</p>
      </CardContent>
    </Card>
  );
}

export function FaqComponent({ question, answer }: { question: string; answer: string }) {
  return (
    <details className="rounded-[22px] border border-[color:var(--color-border)] bg-white/80 p-4">
      <summary className="cursor-pointer text-sm font-semibold text-[var(--color-navy)]">{question}</summary>
      <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">{answer}</p>
    </details>
  );
}

export function PartnerComponent({ name, detail }: { name: string; detail: string }) {
  return (
    <div className="rounded-[22px] border border-[color:var(--color-border)] bg-white/80 p-4">
      <p className="text-base font-semibold text-[var(--color-navy)]">{name}</p>
      <p className="mt-2 text-sm text-[var(--color-muted)]">{detail}</p>
    </div>
  );
}

export function ServiceComponent({ title, description }: { title: string; description: string }) {
  return (
    <Card className="bg-white/86">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-8 text-[var(--color-muted)]">{description}</p>
      </CardContent>
    </Card>
  );
}

export function AppDownloadComponent({ title, note }: { title: string; note: string }) {
  return (
    <Card className="bg-[var(--color-navy)] text-[var(--color-light)]">
      <CardHeader>
        <CardTitle className="text-[var(--color-light)]">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-white/75">{note}</p>
      </CardContent>
    </Card>
  );
}
