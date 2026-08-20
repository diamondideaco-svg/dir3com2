import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { normalizeRole } from '@/lib/auth/identity';
import { getRoleLabel } from '@/lib/auth/identity-contract';

function buildLoginTarget(destination: string) {
  const encoded = encodeURIComponent(destination);
  return `/login?redirect=${encoded}&next=${encoded}`;
}

async function getProfile() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(buildLoginTarget('/my-profile'));
  }

  const { data } = await supabase
    .from('profiles')
    .select('full_name, email, phone, role, status, updated_at')
    .eq('id', user.id)
    .maybeSingle();

  return data;
}

export default async function MyProfilePage() {
  const customer = await getProfile();

  return (
    <div className="min-h-screen bg-[#FAF8F4] px-4 py-8 text-[#334155]" dir="rtl">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#D4AF37]">ملفي</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">الملف الشخصي</h1>
          </div>
          <Link href="/my-account" className="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200">العودة</Link>
        </div>

        {customer ? (
          <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-slate-400">الاسم</p>
                <p className="mt-2 text-sm font-semibold text-white">{customer.full_name || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">البريد الإلكتروني</p>
                <p className="mt-2 text-sm font-semibold text-white">{customer.email || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">الهاتف</p>
                <p className="mt-2 text-sm font-semibold text-white">{customer.phone || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">الدور</p>
                <p className="mt-2 text-sm font-semibold text-white">{getRoleLabel(normalizeRole(customer.role))}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">الحالة</p>
                <p className="mt-2 text-sm font-semibold text-white">{customer.status || 'active'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">آخر تحديث</p>
                <p className="mt-2 text-sm font-semibold text-white">{customer.updated_at ? new Date(customer.updated_at).toLocaleDateString('ar-SA') : '—'}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-[1.5rem] border border-dashed border-white/20 bg-white/5 p-6 text-sm text-slate-300">
            لم يتم العثور على ملف شخصي مرتبط بحسابك بعد.
          </div>
        )}
      </div>
    </div>
  );
}
