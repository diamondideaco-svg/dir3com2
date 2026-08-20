import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { normalizeRole } from '@/lib/auth/identity';
import { getRoleLabel } from '@/lib/auth/identity-contract';

function buildLoginTarget(destination: string) {
  const encoded = encodeURIComponent(destination);
  return `/login?redirect=${encoded}&next=${encoded}`;
}

async function getAccountProfile() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(buildLoginTarget('/my-account'));
  }

  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, status, created_at')
    .eq('id', user.id)
    .maybeSingle();

  return { user, profile: data };
}

export default async function MyAccountPage() {
  const { user, profile } = await getAccountProfile();
  const displayName = profile?.full_name || user.user_metadata?.full_name_ar || user.user_metadata?.full_name || user.email?.split('@')[0] || 'عميل dir3com';
  const displayEmail = profile?.email || user.email || '—';
  const displayRole = getRoleLabel(normalizeRole(profile?.role), typeof profile?.role === 'string' ? profile.role : null);
  const accountStatus = profile?.status || 'unassigned';
  const joinedAt = profile?.created_at ? new Date(profile.created_at).toLocaleDateString('ar-SA') : '—';

  return (
    <div className="min-h-screen bg-[#FAF8F4] px-4 py-8 text-[#334155]" dir="rtl">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#D4AF37]">حسابي</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">لوحة العميل</h1>
          </div>
          <div className="flex gap-2">
            <Link href="/my-bookings" className="rounded-full border border-[color:var(--color-border)] px-4 py-2 text-sm text-[var(--color-navy)]">حجوزاتي</Link>
            <Link href="/my-wallet" className="rounded-full border border-[color:var(--color-border)] px-4 py-2 text-sm text-[var(--color-navy)]">محفظتي</Link>
            <Link href="/my-documents" className="rounded-full border border-[color:var(--color-border)] px-4 py-2 text-sm text-[var(--color-navy)]">مستنداتي</Link>
            <Link href="/my-profile" className="rounded-full border border-[color:var(--color-border)] px-4 py-2 text-sm text-[var(--color-navy)]">ملفي</Link>
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-[color:var(--color-border)] bg-[var(--color-surface)] p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-lg font-semibold text-white">{displayName}</p>
              <p className="mt-2 text-sm text-[var(--color-muted)]">{displayEmail}</p>
            </div>
            <span className="rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/10 px-3 py-1 text-xs font-semibold text-[#D4AF37]">
              {displayRole}
            </span>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-[color:var(--color-border)] bg-white p-4">
              <p className="text-xs text-[var(--color-muted)]">حالة الحساب</p>
              <p className="mt-2 text-sm font-semibold text-white">{accountStatus}</p>
            </div>
            <div className="rounded-2xl border border-[color:var(--color-border)] bg-white p-4">
              <p className="text-xs text-[var(--color-muted)]">تاريخ الانضمام</p>
              <p className="mt-2 text-sm font-semibold text-white">{joinedAt}</p>
            </div>
            <div className="rounded-2xl border border-[color:var(--color-border)] bg-white p-4">
              <p className="text-xs text-[var(--color-muted)]">إدارة الحجوزات</p>
              <Link href="/my-bookings" className="mt-2 inline-block text-sm font-semibold text-[#D4AF37]">عرض الحجوزات</Link>
            </div>
            <div className="rounded-2xl border border-[color:var(--color-border)] bg-white p-4">
              <p className="text-xs text-[var(--color-muted)]">مستندات الحساب</p>
              <Link href="/my-documents" className="mt-2 inline-block text-sm font-semibold text-[#D4AF37]">عرض المستندات</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
