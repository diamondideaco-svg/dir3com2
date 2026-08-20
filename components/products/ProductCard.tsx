import type { ProductRecord } from '@/lib/supabase/types';

type ProductCardProps = {
  product: ProductRecord;
};

export default function ProductCard({ product }: ProductCardProps) {
  return (
    <div className="rounded-[1.5rem] border border-[color:var(--color-border)] bg-[var(--color-surface)] p-6 text-right">
      <p className="text-lg font-semibold text-white">{product.name_en}</p>
      <p className="mt-2 text-sm text-[var(--color-muted)]">{product.city || '—'}</p>
      <p className="mt-3 text-sm text-[var(--color-muted)]">{product.status}</p>
    </div>
  );
}
