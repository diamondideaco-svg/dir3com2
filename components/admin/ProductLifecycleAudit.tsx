import 'server-only';

import { requireAdminActionAccess } from '@/lib/auth/admin';
import { AdminDateTime, AdminRetryButton, AdminStatusText, AdminText } from '@/components/admin/AdminLocale';

type ProductAuditRow = {
  id: string;
  product_id: string;
  action: string;
  actor_user_id: string;
  actor_role: string;
  country: string | null;
  before_state: unknown;
  after_state: unknown;
  created_at: string;
};

const actions: Record<string, { ar: string; en: string }> = {
  create_draft: { ar: 'إنشاء مسودة', en: 'Create draft' },
  update_draft: { ar: 'تحديث المسودة', en: 'Update draft' },
  publish: { ar: 'نشر', en: 'Publish' },
  unpublish: { ar: 'إلغاء النشر', en: 'Unpublish' },
  archive: { ar: 'أرشفة', en: 'Archive' },
};

function AuditSnapshot({ value }: { value: unknown }) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return <AdminText ar="غير مسجل" en="Not recorded" />;
  }

  // Render only these fields, never the complete product/metadata snapshot.
  const snapshot = value as Record<string, unknown>;
  const archived = typeof snapshot.deleted_at === 'string' && snapshot.deleted_at.length > 0;
  const status = archived ? 'archived' : typeof snapshot.status === 'string' ? snapshot.status : null;
  const version = typeof snapshot.lifecycle_version === 'number' ? snapshot.lifecycle_version : null;
  const verified = typeof snapshot.verified === 'boolean' ? snapshot.verified : null;

  return (
    <dl className="space-y-1">
      <div><dt className="inline"><AdminText ar="الحالة: " en="Status: " /></dt><dd className="inline"><AdminStatusText value={status} /></dd></div>
      <div><dt className="inline"><AdminText ar="الإصدار: " en="Version: " /></dt><dd className="inline">{version ?? '—'}</dd></div>
      <div><dt className="inline"><AdminText ar="موثق: " en="Verified: " /></dt><dd className="inline">{verified === null ? <AdminText ar="غير مسجل" en="Not recorded" /> : verified ? <AdminText ar="نعم" en="Yes" /> : <AdminText ar="لا" en="No" />}</dd></div>
    </dl>
  );
}

export async function ProductLifecycleAudit() {
  // This is the authenticated session client, not a service-role read.
  // Keep authorization outside the query catch and preserve audit RLS.
  const { supabase } = await requireAdminActionAccess();
  let rows: ProductAuditRow[];

  try {
    const { data, error } = await supabase
      .from('product_audit_events')
      .select('id,product_id,action,actor_user_id,actor_role,country,before_state,after_state,created_at')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(50);
    if (error || !data) throw new Error('PRODUCT_AUDIT_READ_FAILED');
    rows = data as ProductAuditRow[];
  } catch {
    return (
      <section role="alert" className="min-w-0 rounded-2xl border border-red-400/35 bg-red-500/10 p-4 text-sm text-red-100">
        <AdminText ar="تعذر تحميل سجل تغييرات المنتجات. أعد المحاولة." en="Product lifecycle audit could not be loaded. Try again." />
        <AdminRetryButton />
      </section>
    );
  }

  return (
    <section aria-labelledby="product-lifecycle-audit-heading" className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-slate-200">
      <h2 id="product-lifecycle-audit-heading" className="text-lg font-semibold text-white"><AdminText ar="سجل تغييرات المنتجات" en="Product lifecycle audit" /></h2>
      <p className="mt-2 text-xs text-slate-300"><AdminText ar="آخر 50 تغييرًا محفوظًا؛ لا يُنشئ عرض السجل أي تغيير. التوقيت بالتوقيت العالمي UTC." en="Latest 50 persisted changes; viewing this log does not change records. Times shown in UTC." /></p>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm"><AdminText ar="لا توجد تغييرات منتجات مسجلة." en="No product lifecycle events are recorded." /></p>
      ) : (
        <ol className="mt-4 min-w-0 space-y-3">
          {rows.map((row) => {
            const action = actions[row.action];
            return (
              <li key={row.id} data-audit-event-id={row.id} data-product-id={row.product_id} className="min-w-0 rounded-xl border border-slate-700 p-3 text-sm">
                <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                  <strong className="break-words">{action ? <AdminText ar={action.ar} en={action.en} /> : row.action}</strong>
                  <time dateTime={row.created_at} className="text-xs text-slate-300"><AdminDateTime value={row.created_at} /></time>
                </div>
                <dl className="mt-2 min-w-0 space-y-1 text-xs">
                  <div><dt className="inline"><AdminText ar="معرّف المنتج: " en="Product ID: " /></dt><dd className="inline break-all"><bdi>{row.product_id}</bdi></dd></div>
                  <div><dt className="inline"><AdminText ar="منفذ الإجراء: " en="Actor: " /></dt><dd className="inline break-all"><bdi>{row.actor_user_id}</bdi> · {row.actor_role}</dd></div>
                  <div><dt className="inline"><AdminText ar="الدولة: " en="Country: " /></dt><dd className="inline break-words">{row.country || '—'}</dd></div>
                </dl>
                <div className="mt-3 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="min-w-0 break-words"><h3 className="mb-1 font-semibold"><AdminText ar="قبل" en="Before" /></h3><AuditSnapshot value={row.before_state} /></div>
                  <div className="min-w-0 break-words"><h3 className="mb-1 font-semibold"><AdminText ar="بعد" en="After" /></h3><AuditSnapshot value={row.after_state} /></div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
