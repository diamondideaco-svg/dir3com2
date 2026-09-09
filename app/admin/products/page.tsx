import Link from 'next/link';
import { filterRowsByCountryScope, requireScopedAdminPageDataAccess, scopeCountryQuery } from '@/lib/auth/admin';
import { hasPermission } from '@/lib/auth/team-access';
import ProductTable from '@/components/products/ProductTable';
import ProductForm from '@/components/products/ProductForm';
import type { ProductRecord } from '@/lib/supabase/types';
import { AdminRetryButton, AdminText, AdminLocalizedInput } from '@/components/admin/AdminLocale';

import { productConflictMessage, productResultMessages } from '@/lib/products/lifecycle-feedback';

type ProductRow = ProductRecord & {
  country?: string | null;
  marketplace_family?: string | null;
  lifecycle_version?: number | null;
  deleted_at?: string | null;
  product_availability?: Array<{ partner_id?: string | null }>;
};

type Filters = {
  q?: string;
  status?: string;
  family?: string;
  city?: string;
  partner?: string;
  result?: string;
  conflict?: string;
};

async function getProducts() {
  const { supabase, scope } = await requireScopedAdminPageDataAccess('/admin/products', 'products:read');
  const { data, error } = await scopeCountryQuery(supabase
    .from('products')
    .select('*, product_images(id, product_id, image_url, caption, sort_order, created_at), product_availability(partner_id)')
    .is('deleted_at', null), scope)
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    return { products: [] as ProductRow[], error: 'تعذر تحميل بيانات المنتجات حالياً.', canWrite: scope.mode === 'global' || hasPermission(scope.grant, 'products:write'), isGlobal: scope.mode === 'global' };
  }

  const scoped = filterRowsByCountryScope(scope, (data || []) as ProductRow[]);
  return { products: scoped, error: null, canWrite: scope.mode === 'global' || hasPermission(scope.grant, 'products:write'), isGlobal: scope.mode === 'global' };
}

function applyFilters(products: ProductRow[], params: Filters) {
  const query = (params.q || '').trim().toLowerCase();
  const status = (params.status || '').trim().toLowerCase();
  const family = (params.family || '').trim().toLowerCase();
  const city = (params.city || '').trim().toLowerCase();
  const partner = (params.partner || '').trim();

  return products.filter((product) => {
    if (query) {
      const haystack = [product.name_ar, product.name_en, product.slug, product.city, product.country].filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    if (status && status !== 'all' && product.status?.toLowerCase() !== status) return false;
    if (family && family !== 'all' && product.marketplace_family?.toLowerCase() !== family) return false;
    if (city && city !== 'all' && (product.city || '').toLowerCase() !== city) return false;
    if (partner && partner !== 'all' && !product.product_availability?.some((row) => row.partner_id === partner)) return false;
    return true;
  });
}

export default async function AdminProductsPage({ searchParams }: { searchParams: Promise<Filters> }) {
  const { products, error, isGlobal, canWrite } = await getProducts();
  const params = await searchParams;
  const filteredProducts = applyFilters(products, params);
  const resultMessage = params?.result && Object.hasOwn(productResultMessages, params.result) ? productResultMessages[params.result] : null;
  const resultIsBlocked = params?.result === 'publish_blocked';
  const cities = [...new Set(products.map((product) => product.city).filter((value): value is string => Boolean(value)))].sort();

  return (
    <div className="min-h-screen max-w-full overflow-x-clip bg-[#FAF8F4] px-4 py-8 text-[#334155]">
      <div className="mx-auto w-full min-w-0 max-w-[1500px]">
        <div className="mb-8 flex min-w-0 flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#D4AF37]"><AdminText ar="لوحة الإدارة" en="Admin platform" /></p>
            <h1 className="mt-2 break-words text-3xl font-semibold text-[#334155]"><AdminText ar="إدارة المنتجات" en="Product management" /></h1>
            <p className="mt-2 break-words text-sm text-[#64748B]"><AdminText ar="إنشاء مسودة ← معاينة ← نشر ← إلغاء نشر أو أرشفة. كل خطوة واضحة ومدقّقة." en="Create draft → Preview → Publish → Unpublish or Archive. Each lifecycle step is explicit and audited." /></p>
          </div>
          {isGlobal ? (
            <div className="flex max-w-full flex-wrap gap-2">
              <Link href="/admin/categories" className="rounded-full border border-[color:var(--color-border)] px-4 py-2 text-sm text-[var(--color-navy)]"><AdminText ar="التصنيفات" en="Categories" /></Link>
              <Link href="/admin/pricing" className="rounded-full border border-[color:var(--color-border)] px-4 py-2 text-sm text-[var(--color-navy)]"><AdminText ar="التسعير" en="Pricing" /></Link>
            </div>
          ) : null}
        </div>

        {resultMessage ? <div role="status" aria-live="polite" className={`mb-5 rounded-2xl border px-4 py-3 text-sm ${resultIsBlocked ? 'border-amber-400/45 bg-amber-50 text-amber-900' : 'border-emerald-400/35 bg-emerald-500/10 text-emerald-700'}`}><AdminText {...resultMessage} /></div> : null}
        {params.conflict === 'version' ? <div role="alert" className="mb-5 rounded-2xl border border-amber-400 bg-amber-50 p-4 text-sm text-amber-900"><AdminText {...productConflictMessage} /><AdminRetryButton /></div> : null}

        {error ? (
          <div className="mb-5 rounded-2xl border border-red-400/35 bg-red-500/10 px-4 py-3 text-sm text-red-700"><AdminText ar={error} en="Product data could not be loaded. No fallback empty state is shown." /><AdminRetryButton /></div>
        ) : null}

        <form method="get" className="mb-6 grid min-w-0 gap-3 rounded-[1.5rem] border border-[color:var(--color-border)] bg-white p-4 sm:grid-cols-2 xl:grid-cols-[1.5fr_repeat(4,minmax(130px,1fr))_auto]">
          <label className="grid min-w-0 gap-1 text-xs font-semibold text-[#64748B]"><AdminText ar="البحث" en="Search" /><AdminLocalizedInput name="q" defaultValue={params.q || ''} ar="الاسم / الرابط / المدينة" en="Name / slug / city" className="min-h-11 min-w-0 rounded-xl border border-[color:var(--color-border)] px-3 text-sm text-[#334155]" /></label>
          <label className="grid min-w-0 gap-1 text-xs font-semibold text-[#64748B]"><AdminText ar="الحالة" en="Status" /><select name="status" defaultValue={params.status || 'all'} className="min-h-11 min-w-0 rounded-xl border border-[color:var(--color-border)] bg-white px-3 text-sm text-[#334155]"><option value="all"><AdminText ar="الكل" en="All" /></option><option value="draft"><AdminText ar="مسودة" en="Draft" /></option><option value="published"><AdminText ar="منشور" en="Published" /></option></select></label>
          <label className="grid min-w-0 gap-1 text-xs font-semibold text-[#64748B]"><AdminText ar="العائلة" en="Family" /><select name="family" defaultValue={params.family || 'all'} className="min-h-11 min-w-0 rounded-xl border border-[color:var(--color-border)] bg-white px-3 text-sm text-[#334155]"><option value="all"><AdminText ar="الكل" en="All" /></option><option value="drive">Drive</option><option value="stay">Stay</option><option value="fly">Fly</option><option value="concierge">Concierge</option><option value="vip">VIP</option></select></label>
          <label className="grid min-w-0 gap-1 text-xs font-semibold text-[#64748B]"><AdminText ar="المدينة" en="City" /><select name="city" defaultValue={params.city || 'all'} className="min-h-11 min-w-0 rounded-xl border border-[color:var(--color-border)] bg-white px-3 text-sm text-[#334155]"><option value="all"><AdminText ar="الكل" en="All" /></option>{cities.map((cityName) => <option key={cityName} value={cityName.toLowerCase()}>{cityName}</option>)}</select></label>
          <label className="grid min-w-0 gap-1 text-xs font-semibold text-[#64748B]"><AdminText ar="الشريك" en="Partner" /><AdminLocalizedInput name="partner" defaultValue={params.partner === 'all' ? '' : params.partner || ''} ar="معرّف الشريك" en="Partner ID" className="min-h-11 min-w-0 rounded-xl border border-[color:var(--color-border)] px-3 text-sm text-[#334155]" /></label>
          <div className="flex min-w-0 flex-wrap items-end gap-2"><button type="submit" className="min-h-11 rounded-full bg-[#0D1B2A] px-5 text-sm font-semibold text-white"><AdminText ar="تطبيق" en="Apply" /></button><Link href="/admin/products" className="inline-flex min-h-11 items-center rounded-full border border-[color:var(--color-border)] px-4 text-sm font-semibold"><AdminText ar="مسح" en="Clear" /></Link></div>
        </form>

        <div className={`grid min-w-0 gap-6 ${canWrite ? 'xl:grid-cols-[0.72fr_1.28fr]' : ''}`}>
          {canWrite && <div className="min-w-0"><ProductForm /></div>}
          <div className="min-w-0 space-y-3">
            {!error && <div className="text-sm text-[#64748B]"><AdminText ar={`النتائج: ${filteredProducts.length} من ${products.length}`} en={`Results: ${filteredProducts.length} of ${products.length}`} /></div>}
            {!error && <ProductTable products={filteredProducts} canWrite={canWrite} />}
          </div>
        </div>
      </div>
    </div>
  );
}
