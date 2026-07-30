import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import ProductTable from '@/components/products/ProductTable';
import ProductForm from '@/components/products/ProductForm';
import type { ProductRecord } from '@/lib/supabase/types';

async function getProducts() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from('products').select('*').order('created_at', { ascending: false });
  return (data || []) as ProductRecord[];
}

export default async function AdminProductsPage() {
  const products = await getProducts();

  return (
    <div className="min-h-screen bg-[#0D1B2A] px-4 py-8 text-white" dir="rtl">
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
