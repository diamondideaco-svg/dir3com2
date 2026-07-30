import { cn } from '@/lib/utils';

type LoadingSkeletonGridProps = {
  count?: number;
  className?: string;
};

export function LoadingSkeletonGrid({ count = 3, className }: LoadingSkeletonGridProps) {
  return (
    <div className={cn('grid gap-6 md:grid-cols-2 xl:grid-cols-3', className)}>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="h-80 overflow-hidden rounded-[30px] border border-[color:var(--color-border)] bg-white/78 p-6">
          <div className="h-full animate-pulse">
            <div className="h-24 rounded-[20px] bg-[var(--color-surface)]/80" />
            <div className="mt-5 h-4 w-2/3 rounded-full bg-[var(--color-surface)]/90" />
            <div className="mt-3 h-4 w-1/2 rounded-full bg-[var(--color-surface)]/75" />
            <div className="mt-6 h-3 w-full rounded-full bg-[var(--color-surface)]/75" />
            <div className="mt-2 h-3 w-5/6 rounded-full bg-[var(--color-surface)]/65" />
            <div className="mt-2 h-3 w-3/4 rounded-full bg-[var(--color-surface)]/55" />
            <div className="mt-8 h-10 rounded-full bg-[var(--color-gold)]/24" />
          </div>
        </div>
      ))}
    </div>
  );
}

type EmptyStateProps = {
  title: string;
  description: string;
  className?: string;
};

export function EmptyState({ title, description, className }: EmptyStateProps) {
  return (
    <div className={cn('rounded-[30px] border border-dashed border-[var(--color-gold)]/40 bg-[linear-gradient(160deg,rgba(212,175,55,0.12)_0%,rgba(255,255,255,0.75)_100%)] p-8 text-center', className)}>
      <p className="text-lg font-semibold text-[var(--color-navy)]">{title}</p>
      <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">{description}</p>
    </div>
  );
}
