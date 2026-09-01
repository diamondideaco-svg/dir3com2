import { AdminText } from '@/components/admin/AdminLocale';

export default function AdminLoading() {
  return <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white" role="status"><AdminText ar="جارٍ تحميل بيانات الإدارة المصرح بها…" en="Loading authorized admin data…" /></div>;
}
