import { deleteProductAction, publishProductAction } from '@/lib/actions/product-actions';
import type { ProductRecord } from '@/lib/supabase/types';

type ProductTableProps = {
  products: ProductRecord[];
};

export default function ProductTable({ products }: ProductTableProps) {
  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/5">
      <table className="min-w-full text-right">
        <thead className="bg-[#07111D] text-sm text-slate-400">
          <tr>
            <th className="px-5 py-3">الاسم</th>
            <th className="px-5 py-3">المدينة</th>
            <th className="px-5 py-3">الحالة</th>
            <th className="px-5 py-3">الإجراءات</th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => (
            <tr key={product.id} className="border-t border-white/10 text-sm text-slate-300">
              <td className="px-5 py-4">{product.name_en}</td>
              <td className="px-5 py-4">{product.city || '—'}</td>
              <td className="px-5 py-4">{product.status}</td>
              <td className="px-5 py-4">
                <div className="flex flex-wrap gap-2">
                  <form action={publishProductAction}>
                    <input type="hidden" name="id" value={product.id} />
                    <button type="submit" className="rounded-full bg-[#D4AF37] px-3 py-2 text-xs font-semibold text-[#0D1B2A]">نشر</button>
                  </form>
                  <form action={deleteProductAction}>
                    <input type="hidden" name="id" value={product.id} />
                    <button type="submit" className="rounded-full border border-white/10 px-3 py-2 text-xs text-slate-200">حذف</button>
                  </form>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
