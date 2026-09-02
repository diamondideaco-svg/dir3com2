import Link from 'next/link';
import { filterRowsByCountryScope, requireScopedAdminPageDataAccess } from '@/lib/auth/admin';
import ProductTable from '@/components/products/ProductTable';
import ProductForm from '@/components/products/ProductForm';
import type { ProductRecord } from '@/lib/supabase/types';
import { AdminRetryButton, AdminText } from '@/components/admin/AdminLocale';

const resultMessages: Record<string, string> = {
  created: 'تم إنشاء المنتج بنجاح.',
  published: 'تم نشر المنتج بنجاح.',
  deleted: 'تم حذف المنتج بنجاح.',
};

async function getProducts() {
  const { supabase, scope } = await requireScopedAdminPageDataAccess('/admin/products', 'products:read');
  const { data, error } = await supabase.from('products').select('*, product_images(id, product_id, image_url, caption, sort_order, created_at)').order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    return { products: [] as ProductRecord[], error: 'تعذر تحميل بيانات المنتجات حالياً.', isGlobal: scope.mode === 'global' };
  }

  const scoped = filterRowsByCountryScope(scope, (data || []) as ProductRecord[]);
  return { products: scoped as ProductRecord[], error: null, isGlobal: scope.mode === 'global' };
}

export default async function AdminProductsPage({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  const { products, error, isGlobal } = await getProducts();
  const params = await searchParams;
  const resultMessage = params?.result ? resultMessages[params.result] : null;

  return (
    <div className="min-h-screen bg-[#FAF8F4] px-4 py-8 text-[#334155]">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#D4AF37]"><AdminText ar="لوحة الإدارة" en="Admin platform" /></p>
            <h1 className="mt-2 text-3xl font-semibold text-[#334155]"><AdminText ar="إدارة المنتجات" en="Product management" /></h1>
          </div>
          {isGlobal ? (
            <div className="flex gap-2">
              <Link href="/admin/categories" className="rounded-full border border-[color:var(--color-border)] px-4 py-2 text-sm text-[var(--color-navy)]"><AdminText ar="التصنيفات" en="Categories" /></Link>
              <Link href="/admin/pricing" className="rounded-full border border-[color:var(--color-border)] px-4 py-2 text-sm text-[var(--color-navy)]"><AdminText ar="التسعير" en="Pricing" /></Link>
            </div>
          ) : null}
        </div>

        {resultMessage ? (
          <div className="mb-5 rounded-2xl border border-emerald-400/35 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700">{resultMessage}</div>
        ) : null}

        {error ? (
          <div className="mb-5 rounded-2xl border border-red-400/35 bg-red-500/10 px-4 py-3 text-sm text-red-700"><AdminText ar={error} en="Product data could not be loaded. No fallback empty state is shown." /><AdminRetryButton /></div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <ProductForm />
          </div>
          <div>
            {!error && <ProductTable products={products} />}
          </div>
        </div>
      </div>
    </div>
  );
}
