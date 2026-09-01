import Link from 'next/link';
import { requireAdminPageDataAccess } from '@/lib/auth/admin';
import type { ProductCategoryRecord } from '@/lib/supabase/types';
import { AdminRetryButton, AdminText } from '@/components/admin/AdminLocale';

async function getCategories() {
  const { supabase } = await requireAdminPageDataAccess('/admin/categories');
  const { data, error } = await supabase.from('product_categories').select('*').order('created_at', { ascending: false });
  return { categories: (data || []) as ProductCategoryRecord[], error: Boolean(error) };
}

export default async function AdminCategoriesPage() {
  const { categories, error } = await getCategories();

  return (
    <div className="min-h-screen bg-[#FAF8F4] px-4 py-8 text-[#334155]">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#D4AF37]"><AdminText ar="التصنيفات" en="Categories" /></p>
            <h1 className="mt-2 text-3xl font-semibold text-[#334155]"><AdminText ar="إدارة الفئات" en="Manage categories" /></h1>
          </div>
          <Link href="/admin/products" className="rounded-full border border-[color:var(--color-border)] px-4 py-2 text-sm text-[var(--color-navy)]"><AdminText ar="العودة" en="Back" /></Link>
        </div>

        {error ? <div className="mb-5 rounded-2xl border border-red-400/35 bg-red-500/10 p-5 text-sm text-red-700"><AdminText ar="تعذر تحميل الفئات. لم تُعرض حالة فارغة بديلة." en="Categories could not be loaded. No fallback empty state is shown." /><AdminRetryButton /></div> : null}

        {!error && <div className="space-y-4">
          {categories.map((category) => (
            <div key={category.id} className="rounded-[1.5rem] border border-[color:var(--color-border)] bg-[var(--color-surface)] p-6">
              <p className="text-lg font-semibold text-[#334155]">{category.name_en}</p>
              <p className="mt-2 text-sm text-[var(--color-muted)]">{category.slug}</p>
            </div>
          ))}
          {categories.length === 0 ? <p><AdminText ar="لا توجد فئات بعد." en="No categories yet." /></p> : null}
        </div>}
      </div>
    </div>
  );
}
