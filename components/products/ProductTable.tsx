import type { ProductRecord } from '@/lib/supabase/types';
import { AdminStatusText, AdminText } from '@/components/admin/AdminLocale';
import ProductLifecycleControls from '@/components/products/ProductLifecycleControls';

type ProductWithImages = ProductRecord & {
  country?: string | null;
  marketplace_family?: string | null;
  marketplace_environment?: string | null;
  lifecycle_version?: number | null;
  fulfilment_state?: string | null;
  transaction_method?: string | null;
  supply_type?: string | null;
  supplier_verified?: boolean | null;
  synthetic?: boolean | null;
  product_images?: Array<{ id: string; product_id: string; image_url: string; caption?: string | null }>;
};

type ProductTableProps = {
  products: ProductWithImages[];
  canWrite?: boolean;
};

function publishBlocker(product: ProductWithImages): { ar: string; en: string } | null {
  const ar: string[] = [];
  const en: string[] = [];

  if (product.synthetic !== false) {
    ar.push('السجل تجريبي/غير مثبت كمخزون حقيقي');
    en.push('record is synthetic or not proven as real inventory');
  }
  if (!product.country?.trim()) {
    ar.push('الدولة غير محددة');
    en.push('country is missing');
  }
  if (!product.marketplace_family || !['drive', 'stay', 'fly', 'concierge', 'vip'].includes(product.marketplace_family)) {
    ar.push('عائلة المنتج غير محددة');
    en.push('marketplace family is missing');
  }
  if (product.marketplace_environment !== 'production') {
    ar.push('بيئة المنتج ليست Production');
    en.push('product environment is not Production');
  }
  if (!product.supply_type || !['verified_local_partner', 'global_travel_partner', 'dir3com_managed'].includes(product.supply_type)) {
    ar.push('مصدر التوريد غير موثّق');
    en.push('supply source is not authoritative');
  }
  if (product.supplier_verified !== true) {
    ar.push('المورّد غير موثّق');
    en.push('supplier is not verified');
  }

  const transactionValid =
    (product.fulfilment_state === 'verified_requestable' && product.transaction_method === 'request_to_confirm') ||
    (product.fulfilment_state === 'verified_quote' && product.transaction_method === 'request_quote') ||
    (['unavailable', 'availability_unknown'].includes(product.fulfilment_state || '') && product.transaction_method === 'none');

  if (!transactionValid) {
    ar.push('مسار التنفيذ/المعاملة غير صالح للنشر');
    en.push('fulfilment/transaction path is not publishable');
  }

  if (!ar.length) return null;
  return {
    ar: `النشر متوقف حتى تصحيح: ${ar.join('، ')}.`,
    en: `Publishing is blocked until corrected: ${en.join(', ')}.`,
  };
}

function ProductImages({ product }: { product: ProductWithImages }) {
  if (!product.product_images?.length) {
    return <span className="text-xs text-[#64748B]"><AdminText ar="لا توجد صورة" en="No image" /></span>;
  }

  return (
    <div className="flex max-w-full flex-wrap gap-2">
      {product.product_images.slice(0, 3).map((image) => (
        <a
          key={image.id}
          href={`/api/admin/products/images/${encodeURIComponent(image.id)}`}
          target="_blank"
          rel="noreferrer"
          className="group inline-flex flex-col gap-1 text-xs text-[#334155]"
        >
          <img
            src={`/api/admin/products/images/${encodeURIComponent(image.id)}`}
            alt={image.caption || product.name_en || product.name_ar}
            className="h-14 w-14 rounded-lg border border-[#334155]/15 object-cover transition group-hover:border-[#D4AF37]"
          />
        </a>
      ))}
      {product.product_images.length > 3 ? <span className="self-center text-xs">+{product.product_images.length - 3}</span> : null}
    </div>
  );
}

export default function ProductTable({ products, canWrite = false }: ProductTableProps) {
  if (products.length === 0) {
    return (
      <div className="rounded-[1.5rem] border border-[color:var(--color-border)] bg-[var(--color-surface)] px-5 py-10 text-center text-sm text-[var(--color-muted)]">
        <AdminText ar="لا توجد منتجات مطابقة للبحث أو المرشحات." en="No products match the current search or filters." />
      </div>
    );
  }

  return (
    <>
      <div className="grid min-w-0 gap-3 md:hidden">
        {products.map((product) => {
          const blocker = product.status === 'draft' ? publishBlocker(product) : null;
          return (
          <article key={product.id} className="min-w-0 overflow-hidden rounded-[1.25rem] border border-[color:var(--color-border)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-muted)]">
            <div className="min-w-0">
              <div className="break-words font-semibold text-[var(--color-navy)]"><AdminText ar={product.name_ar || product.name_en} en={product.name_en || product.name_ar} /></div>
              <div className="mt-1 break-all text-xs text-[var(--color-muted)]">{product.slug}</div>
            </div>

            <dl className="mt-4 grid min-w-0 grid-cols-2 gap-x-3 gap-y-3">
              <div className="min-w-0">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#64748B]"><AdminText ar="العائلة" en="Family" /></dt>
                <dd className="mt-1 break-words uppercase">{product.marketplace_family || '—'}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#64748B]"><AdminText ar="الموقع" en="Location" /></dt>
                <dd className="mt-1 break-words">{product.city || '—'}{product.country ? ` · ${product.country}` : ''}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#64748B]"><AdminText ar="الحالة" en="Status" /></dt>
                <dd className="mt-1"><AdminStatusText value={product.status} />{product.lifecycle_version ? <span className="ms-2 text-[11px] text-[var(--color-muted)]">v{product.lifecycle_version}</span> : null}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#64748B]"><AdminText ar="الصور" en="Images" /></dt>
                <dd className="mt-1"><ProductImages product={product} /></dd>
              </div>
            </dl>

            <div className="mt-4 min-w-0 border-t border-[color:var(--color-border)] pt-4">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#64748B]"><AdminText ar="الإجراءات" en="Actions" /></div>
              <ProductLifecycleControls
                id={product.id}
                slug={product.slug}
                status={product.status}
                lifecycleVersion={product.lifecycle_version}
                canWrite={canWrite}
                publishBlockedReason={blocker}
              />
            </div>
          </article>
          );
        })}
      </div>

      <div className="hidden w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain rounded-[1.5rem] border border-[color:var(--color-border)] bg-[var(--color-surface)] md:block">
        <table className="w-[900px] min-w-[900px] text-start">
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
            {products.map((product) => {
              const blocker = product.status === 'draft' ? publishBlocker(product) : null;
              return (
              <tr key={product.id} className="border-t border-[color:var(--color-border)] align-top text-sm text-[var(--color-muted)]">
                <td className="px-5 py-4">
                  <div className="font-semibold text-[var(--color-navy)]"><AdminText ar={product.name_ar || product.name_en} en={product.name_en || product.name_ar} /></div>
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
                <td className="px-5 py-4"><ProductImages product={product} /></td>
                <td className="px-5 py-4">
                  <ProductLifecycleControls
                    id={product.id}
                    slug={product.slug}
                    status={product.status}
                    lifecycleVersion={product.lifecycle_version}
                    canWrite={canWrite}
                    publishBlockedReason={blocker}
                  />
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
