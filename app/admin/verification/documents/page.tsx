import { DocumentUploader } from '@/components/admin/DocumentUploader';
import { AdminText } from '@/components/admin/AdminLocale';

export const metadata = {
  title: 'Document Verification | DIR3COM',
};

export default function DocumentsPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-[var(--color-navy)]">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-3xl font-semibold"><AdminText ar="تحقق المستندات" en="Document verification" /></h1>
          <p className="mt-2 text-[var(--color-muted)]"><AdminText ar="راجع الجواز والهوية والسجل التجاري والترخيص السياحي والتأمين والمستندات البنكية والضريبية." en="Manage passport, national ID, commercial registration, tourism license, insurance, banking, and tax documents." /></p>
        </div>

        <DocumentUploader />
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 text-sm text-[var(--color-muted)]">
          <AdminText
            ar="لم يتم اختيار طلب تحقق موثوق. لا تُعرض معاينة أو مدة صلاحية أو سجل زمني حتى يكون هناك مستند حقيقي مرتبط بطلب تحقق."
            en="No authoritative verification request is selected. Preview, expiry, and timeline data are not shown until a real document is linked to a verification request."
          />
        </div>
      </div>
    </main>
  );
}
