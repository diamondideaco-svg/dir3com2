import type { ProductRecord } from '@/lib/supabase/types';

type ProductCardProps = {
  product: ProductRecord;
};

export default function ProductCard({ product }: ProductCardProps) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-6 text-right">
      <p className="text-lg font-semibold text-white">{product.name_en}</p>
      <p className="mt-2 text-sm text-slate-400">{product.city || '—'}</p>
      <p className="mt-3 text-sm text-slate-300">{product.status}</p>
    </div>
  );
}
