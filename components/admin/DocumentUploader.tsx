import { AdminText } from '@/components/admin/AdminLocale';

export function DocumentUploader() {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
      <h3 className="text-lg font-semibold text-white"><AdminText ar="رفع مستند" en="Upload document" /></h3>
      <p className="mt-2 text-sm text-[var(--color-muted)]"><AdminText ar="إرفاق الجواز أو الهوية أو الرخصة أو التأمين أو مستندات التسجيل للمراجعة." en="Attach passport, ID, license, insurance, or registration documents for review." /></p>
      <button type="button" disabled aria-describedby="admin-document-upload-unavailable" className="mt-4 cursor-not-allowed rounded-full border border-gold-500/40 px-4 py-2 text-sm text-gold-400/60"><AdminText ar="الرفع غير متاح من هذا العرض" en="Upload unavailable on this surface" /></button>
      <p id="admin-document-upload-unavailable" className="mt-2 text-xs text-[var(--color-muted)]"><AdminText ar="استخدم مسار مستندات الحساب المعتمد." en="Use the approved account-document workflow." /></p>
    </div>
  );
}
