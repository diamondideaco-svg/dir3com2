import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import ProductTable from '@/components/products/ProductTable';
import ProductForm from '@/components/products/ProductForm';
import type { ProductRecord } from '@/lib/supabase/types';

const resultMessages: Record<string, string> = {
  created: 'تم إنشاء المنتج بنجاح.',
  published: 'تم نشر المنتج بنجاح.',
  deleted: 'تم حذف المنتج بنجاح.',
};

async function getProducts() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from('products').select('*').order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    return { products: [] as ProductRecord[], error: 'تعذر تحميل بيانات المنتجات حالياً.' };
  }

  return { products: (data || []) as ProductRecord[], error: null };
}

export default async function AdminProductsPage({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  const { products, error } = await getProducts();
  const params = await searchParams;
  const resultMessage = params?.result ? resultMessages[params.result] : null;

  return (
    <div className="min-h-screen bg-[#FAF8F4] px-4 py-8 text-[#334155]" dir="rtl">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#D4AF37]">لوحة الإدارة</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">إدارة المنتجات</h1>
          </div>
          <div className="flex gap-2">
            <Link href="/admin/categories" className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200">التصنيفات</Link>
            <Link href="/admin/pricing" className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200">التسعير</Link>
          </div>
        </div>

        {resultMessage ? (
          <div className="mb-5 rounded-2xl border border-emerald-400/35 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{resultMessage}</div>
        ) : null}

        {error ? (
          <div className="mb-5 rounded-2xl border border-red-400/35 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <ProductForm />
          </div>
          <div>
            <ProductTable products={products} />
          </div>
        </div>
      </div>
    </div>
  );
}
