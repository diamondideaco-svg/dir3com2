import type { ProductRecord } from '@/lib/supabase/types';
import { AdminStatusText, AdminText } from '@/components/admin/AdminLocale';
import ProductLifecycleControls from '@/components/products/ProductLifecycleControls';

type ProductWithImages = ProductRecord & {
  country?: string | null;
  marketplace_family?: string | null;
  lifecycle_version?: number | null;
  product_images?: Array<{ id: string; product_id: string; image_url: string; caption?: string | null }>;
};

type ProductTableProps = {
  products: ProductWithImages[];
};

export default function ProductTable({ products }: ProductTableProps) {
  return (
    <div className="overflow-x-auto rounded-[1.5rem] border border-[color:var(--color-border)] bg-[var(--color-surface)]">
      <table className="min-w-[900px] w-full text-start">
        <thead className="bg-white text-sm text-[var(--color-muted)]">
          <tr>
            <th className="px-5 py-3"><AdminText ar="المنتج" en="Product" /></th>
            <th className="px-5 py-3"><AdminText ar="العائلة" en="Family" /></th>
            <th className="px-5 py-3"><AdminText ar="الموقع" en="Location" /></th>
            <th className="px-5 py-3"><AdminText ar="الحالة" en="Status" /></th>
            <th className="px-5 py-3"><AdminText ar="الصور" en="Images" /></th>
            <th className="px-5 py-3"><AdminText ar="الإجراءات" en="Actions" /></th>
          </tr>
        </thead>
        <tbody>
          {products.length === 0 ? (
            <tr className="border-t border-[color:var(--color-border)] text-sm text-[var(--color-muted)]">
              <td colSpan={6} className="px-5 py-10 text-center text-[var(--color-muted)]">
                <AdminText ar="لا توجد منتجات مطابقة للبحث أو المرشحات." en="No products match the current search or filters." />
              </td>
            </tr>
          ) : (
            products.map((product) => (
              <tr key={product.id} className="border-t border-[color:var(--color-border)] align-top text-sm text-[var(--color-muted)]">
                <td className="px-5 py-4">
                  <div className="font-semibold text-[var(--color-navy)]">{product.name_en || product.name_ar}</div>
                  <div className="mt-1 text-xs text-[var(--color-muted)]">{product.slug}</div>
                </td>
                <td className="px-5 py-4 uppercase">{product.marketplace_family || '—'}</td>
                <td className="px-5 py-4">
                  <div>{product.city || '—'}</div>
                  <div className="mt-1 text-xs uppercase">{product.country || '—'}</div>
                </td>
                <td className="px-5 py-4">
                  <AdminStatusText value={product.status} />
                  {product.lifecycle_version ? <div className="mt-1 text-[11px] text-[var(--color-muted)]">v{product.lifecycle_version}</div> : null}
                </td>
                <td className="px-5 py-4">
                  {product.product_images?.length ? (
                    <div className="flex flex-wrap gap-2">
                      {product.product_images.slice(0, 3).map((image) => (
                        <a key={image.id} href={`/api/admin/products/images/${encodeURIComponent(image.id)}`} target="_blank" rel="noreferrer" className="group inline-flex flex-col gap-1 text-xs text-[#334155]" aria-label={`فتح صورة ${product.name_en || product.name_ar}`}>
                          <img src={`/api/admin/products/images/${encodeURIComponent(image.id)}`} alt={image.caption || product.name_en || product.name_ar} className="h-14 w-14 rounded-lg border border-[#334155]/15 object-cover transition group-hover:border-[#D4AF37]" />
                        </a>
                      ))}
                      {product.product_images.length > 3 ? <span className="self-center text-xs">+{product.product_images.length - 3}</span> : null}
                    </div>
                  ) : <span className="text-xs text-[#64748B]"><AdminText ar="لا توجد صورة" en="No image" /></span>}
                </td>
                <td className="px-5 py-4">
                  <ProductLifecycleControls
                    id={product.id}
                    slug={product.slug}
                    status={product.status}
                    lifecycleVersion={product.lifecycle_version}
                  />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
