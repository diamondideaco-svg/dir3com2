import { notFound } from 'next/navigation';
import Link from 'next/link';
import { assertCountryAllowed, requireScopedAdminPageDataAccess } from '@/lib/auth/admin';
import { AdminStatusText, AdminText } from '@/components/admin/AdminLocale';

export default async function AdminProductPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, scope } = await requireScopedAdminPageDataAccess(`/admin/products/${encodeURIComponent(id)}/preview`, 'products:read');
  const { data: product, error } = await supabase
    .from('products')
    .select('id,name_ar,name_en,slug,description_ar,description_en,base_price,currency,country,city,status,marketplace_family,fulfilment_state,transaction_method,supply_type,supplier_name,supplier_verified,featured,verified,shield_certified,lifecycle_version,deleted_at,product_images(id,image_url,caption,sort_order)')
    .eq('id', id)
    .maybeSingle();

  if (error || !product || product.deleted_at) notFound();
  assertCountryAllowed(scope, product.country);
  const images = Array.isArray(product.product_images) ? [...product.product_images].sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)) : [];

  return (
    <main className="min-h-screen bg-[#FAF8F4] px-4 py-8 text-[#334155]">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#D4AF37]"><AdminText ar="معاينة فقط — لا تغيّر الحالة" en="Preview only — no state change" /></p>
            <h1 className="mt-2 text-3xl font-semibold">{product.name_en || product.name_ar}</h1>
          </div>
          <div className="flex gap-2">
            <Link href={`/admin/products/${encodeURIComponent(id)}`} className="rounded-full border border-[color:var(--color-border)] px-4 py-2 text-sm font-semibold"><AdminText ar="تعديل" en="Edit" /></Link>
            <Link href="/admin/products" className="rounded-full border border-[color:var(--color-border)] px-4 py-2 text-sm font-semibold"><AdminText ar="العودة" en="Back" /></Link>
          </div>
        </div>

        <section className="overflow-hidden rounded-[2rem] border border-[#D4AF37]/25 bg-white shadow-sm">
          {images.length ? (
            <div className="grid gap-2 p-4 sm:grid-cols-3">
              {images.slice(0, 3).map((image) => (
                <img key={image.id} src={`/api/admin/products/images/${encodeURIComponent(image.id)}`} alt={image.caption || product.name_en || product.name_ar} className="aspect-[4/3] w-full rounded-2xl object-cover" />
              ))}
            </div>
          ) : (
            <div className="flex min-h-48 items-center justify-center bg-[#0D1B2A]/5 text-sm text-[#64748B]"><AdminText ar="لا توجد صور حالياً" en="No images yet" /></div>
          )}

          <div className="grid gap-6 p-6 lg:grid-cols-[1fr_0.8fr]">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <AdminStatusText value={product.status} />
                <span className="rounded-full border border-[#D4AF37]/30 px-3 py-1 text-xs uppercase">{product.marketplace_family || '—'}</span>
                <span className="rounded-full border border-[#D4AF37]/30 px-3 py-1 text-xs">v{product.lifecycle_version || 1}</span>
              </div>
              <h2 className="mt-4 text-2xl font-semibold text-[#0D1B2A]">{product.name_ar}</h2>
              <p className="mt-2 text-sm leading-7 text-[#64748B]">{product.description_ar || product.description_en || '—'}</p>
            </div>

            <dl className="grid gap-3 rounded-2xl bg-[#FAF8F4] p-5 text-sm">
              <div className="flex justify-between gap-4"><dt><AdminText ar="السعر" en="Price" /></dt><dd className="font-semibold">{Number(product.base_price || 0).toLocaleString()} {product.currency}</dd></div>
              <div className="flex justify-between gap-4"><dt><AdminText ar="الموقع" en="Location" /></dt><dd>{[product.city, product.country].filter(Boolean).join(' · ') || '—'}</dd></div>
              <div className="flex justify-between gap-4"><dt><AdminText ar="التنفيذ" en="Fulfilment" /></dt><dd>{product.fulfilment_state || '—'}</dd></div>
              <div className="flex justify-between gap-4"><dt><AdminText ar="المعاملة" en="Transaction" /></dt><dd>{product.transaction_method || '—'}</dd></div>
              <div className="flex justify-between gap-4"><dt><AdminText ar="التوريد" en="Supply" /></dt><dd>{product.supply_type || '—'}</dd></div>
              <div className="flex justify-between gap-4"><dt><AdminText ar="المورد موثّق" en="Supplier verified" /></dt><dd>{product.supplier_verified ? '✓' : '—'}</dd></div>
            </dl>
          </div>
        </section>
      </div>
    </main>
  );
}
