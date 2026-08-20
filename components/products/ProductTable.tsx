import { deleteProductAction, publishProductAction } from '@/lib/actions/product-actions';
import type { ProductRecord } from '@/lib/supabase/types';

type ProductTableProps = {
  products: ProductRecord[];
};

export default function ProductTable({ products }: ProductTableProps) {
  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-[color:var(--color-border)] bg-[var(--color-surface)]">
      <table className="min-w-full text-right">
        <thead className="bg-white text-sm text-[var(--color-muted)]">
          <tr>
            <th className="px-5 py-3">الاسم</th>
            <th className="px-5 py-3">المدينة</th>
            <th className="px-5 py-3">الحالة</th>
            <th className="px-5 py-3">الإجراءات</th>
          </tr>
        </thead>
        <tbody>
          {products.length === 0 ? (
            <tr className="border-t border-[color:var(--color-border)] text-sm text-[var(--color-muted)]">
              <td colSpan={4} className="px-5 py-8 text-center text-[var(--color-muted)]">لا توجد سجلات منتجات حالياً.</td>
            </tr>
          ) : (
            products.map((product) => (
              <tr key={product.id} className="border-t border-[color:var(--color-border)] text-sm text-[var(--color-muted)]">
                <td className="px-5 py-4">{product.name_en}</td>
                <td className="px-5 py-4">{product.city || '—'}</td>
                <td className="px-5 py-4">{product.status}</td>
                <td className="px-5 py-4">
                  <div className="flex flex-wrap gap-2">
                    <form action={publishProductAction}>
                      <input type="hidden" name="id" value={product.id} />
                      <button type="submit" className="rounded-full bg-[#D4AF37] px-3 py-2 text-xs font-semibold text-[#334155]">نشر</button>
                    </form>
                    <form action={deleteProductAction}>
                      <input type="hidden" name="id" value={product.id} />
                      <button type="submit" className="rounded-full border border-[color:var(--color-border)] px-3 py-2 text-xs text-[var(--color-navy)]">حذف</button>
                    </form>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
