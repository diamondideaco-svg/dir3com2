import type { ProductRecord } from '@/lib/supabase/types';
import { AdminStatusText, AdminText, AdminUnavailableControl } from '@/components/admin/AdminLocale';

type ProductWithImages = ProductRecord & {
  product_images?: Array<{ id: string; product_id: string; image_url: string; caption?: string | null }>;
};

type ProductTableProps = {
  products: ProductWithImages[];
};

export default function ProductTable({ products }: ProductTableProps) {
  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-[color:var(--color-border)] bg-[var(--color-surface)]">
      <table className="min-w-full text-start">
        <thead className="bg-white text-sm text-[var(--color-muted)]">
          <tr>
            <th className="px-5 py-3"><AdminText ar="الاسم" en="Name" /></th>
            <th className="px-5 py-3"><AdminText ar="المدينة" en="City" /></th>
            <th className="px-5 py-3"><AdminText ar="الحالة" en="Status" /></th>
            <th className="px-5 py-3"><AdminText ar="الصور" en="Images" /></th>
            <th className="px-5 py-3"><AdminText ar="الإجراءات" en="Actions" /></th>
          </tr>
        </thead>
        <tbody>
          {products.length === 0 ? (
            <tr className="border-t border-[color:var(--color-border)] text-sm text-[var(--color-muted)]">
              <td colSpan={5} className="px-5 py-8 text-center text-[var(--color-muted)]"><AdminText ar="لا توجد سجلات منتجات حالياً." en="There are no product records." /></td>
            </tr>
          ) : (
            products.map((product) => (
              <tr key={product.id} className="border-t border-[color:var(--color-border)] text-sm text-[var(--color-muted)]">
                <td className="px-5 py-4">{product.name_en}</td>
                <td className="px-5 py-4">{product.city || '—'}</td>
                <td className="px-5 py-4"><AdminStatusText value={product.status} /></td>
                <td className="px-5 py-4">
                  {product.product_images?.length ? (
                    <div className="flex flex-wrap gap-2">
                      {product.product_images.map((image) => (
                        <a key={image.id} href={`/api/admin/products/images/${encodeURIComponent(image.id)}`} target="_blank" rel="noreferrer" className="group inline-flex flex-col gap-1 text-xs text-[#334155]" aria-label={`فتح صورة ${product.name_en}`}>
                          <img src={`/api/admin/products/images/${encodeURIComponent(image.id)}`} alt={image.caption || product.name_en} className="h-16 w-16 rounded-lg border border-[#334155]/15 object-cover transition group-hover:border-[#D4AF37]" />
                          <span className="group-hover:text-[#8B6516]"><AdminText ar="فتح الصورة" en="Open image" /></span>
                        </a>
                      ))}
                    </div>
                  ) : <span className="text-xs text-[#64748B]"><AdminText ar="لا توجد صورة" en="No image" /></span>}
                </td>
                <td className="px-5 py-4">
                  <div className="flex flex-wrap gap-2">
                    <AdminUnavailableControl ar="نشر" en="Publish" reasonAr="النشر غير متاح هنا حتى تُربط الموافقة والتدقيق ذرّياً." reasonEn="Publishing is unavailable here until approval and audit are persisted atomically." className="rounded-full bg-[#D4AF37] px-3 py-2 text-xs font-semibold text-[#334155]" />
                    <AdminUnavailableControl ar="حذف" en="Delete" reasonAr="الحذف المباشر غير متاح؛ استخدم مسار دورة حياة مدقّق عند توفره." reasonEn="Direct deletion is unavailable; use an audited lifecycle workflow when implemented." className="rounded-full border border-[color:var(--color-border)] px-3 py-2 text-xs text-[var(--color-navy)]" />
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
