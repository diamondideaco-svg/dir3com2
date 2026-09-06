import { notFound } from 'next/navigation';
import Link from 'next/link';
import ProductEditorForm from '@/components/products/ProductEditorForm';
import { assertCountryAllowed, requireScopedAdminPageDataAccess } from '@/lib/auth/admin';
import { AdminText } from '@/components/admin/AdminLocale';

export default async function AdminProductEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, scope } = await requireScopedAdminPageDataAccess(`/admin/products/${encodeURIComponent(id)}`, 'products:write');
  const { data: product, error } = await supabase
    .from('products')
    .select('id,name_ar,name_en,slug,base_price,country,city,status,marketplace_family,fulfilment_state,transaction_method,supply_type,supplier_verified,featured,shield_certified,lifecycle_version,deleted_at')
    .eq('id', id)
    .maybeSingle();

  if (error || !product || product.deleted_at) notFound();
  assertCountryAllowed(scope, product.country);

  return (
    <main className="min-h-screen bg-[#FAF8F4] px-4 py-8 text-[#334155]">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#D4AF37]"><AdminText ar="إدارة المنتجات" en="Product management" /></p>
            <h1 className="mt-2 text-3xl font-semibold"><AdminText ar="تعديل المنتج" en="Edit product" /></h1>
          </div>
          <Link href="/admin/products" className="rounded-full border border-[color:var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-navy)]"><AdminText ar="العودة" en="Back" /></Link>
        </div>
        <ProductEditorForm product={product} />
      </div>
    </main>
  );
}
