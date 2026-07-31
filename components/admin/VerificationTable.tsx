import { getVerificationOverview } from '@/lib/actions/verification-actions';
import { submitVerificationDecisionAction } from '@/lib/actions/verification-actions';
import { VerificationStatusBadge } from '@/components/admin/VerificationStatusBadge';

type VerificationTableProps = {
  returnPath?: string;
  result?: string;
  actionErrorCode?: string;
};

const resultMessages: Record<string, string> = {
  verification_approved: 'تم اعتماد طلب التحقق بنجاح.',
  verification_rejected: 'تم رفض طلب التحقق بنجاح.',
  verification_pending: 'تم إرجاع الطلب إلى قيد المراجعة.',
};

const errorMessages: Record<string, string> = {
  verification_decision_failed: 'تعذر تحديث قرار التحقق حالياً.',
  verification_invalid_decision: 'قرار التحقق غير صالح.',
};

export async function VerificationTable({ returnPath = '/admin/verification', result, actionErrorCode }: VerificationTableProps) {
  const { overview, fetchError } = await getVerificationOverview()
    .then((payload) => ({ overview: payload, fetchError: null as string | null }))
    .catch(() => ({
      overview: { requests: [], reviews: [] },
      fetchError: 'تعذر تحميل طلبات التحقق حالياً.',
    }));

  const resultMessage = result ? resultMessages[result] : null;
  const actionErrorMessage = actionErrorCode ? errorMessages[actionErrorCode] : null;

  if (fetchError) {
    return <div className="rounded-2xl border border-red-400/35 bg-red-500/10 p-4 text-sm text-red-100">{fetchError}</div>;
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
      <h3 className="text-lg font-semibold text-white">Verification requests</h3>
      {resultMessage ? (
        <div className="mt-4 rounded-2xl border border-emerald-400/35 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{resultMessage}</div>
      ) : null}
      {actionErrorMessage ? (
        <div className="mt-4 rounded-2xl border border-red-400/35 bg-red-500/10 px-4 py-3 text-sm text-red-100">{actionErrorMessage}</div>
      ) : null}
      {overview.requests.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">لا توجد طلبات تحقق حالياً.</p>
      ) : (
        <div className="mt-4 space-y-2">
          {overview.requests.map((item: { id: string; request_type: string; status: string; owner_type: string; owner_id: string }) => (
            <div key={item.id} className="rounded-xl border border-slate-800 px-3 py-2 text-sm text-slate-300">
              <div className="flex items-center justify-between">
                <span>{item.request_type}</span>
                <VerificationStatusBadge status={item.status} />
              </div>
              <p className="mt-1 text-xs text-slate-500">{item.owner_type} • {item.owner_id}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <form action={submitVerificationDecisionAction}>
                  <input type="hidden" name="verificationRequestId" value={item.id} />
                  <input type="hidden" name="decision" value="approve" />
                  <input type="hidden" name="returnPath" value={returnPath} />
                  <button type="submit" className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs text-emerald-200">اعتماد</button>
                </form>
                <form action={submitVerificationDecisionAction}>
                  <input type="hidden" name="verificationRequestId" value={item.id} />
                  <input type="hidden" name="decision" value="reject" />
                  <input type="hidden" name="returnPath" value={returnPath} />
                  <button type="submit" className="rounded-full bg-rose-500/20 px-3 py-1 text-xs text-rose-200">رفض</button>
                </form>
                <form action={submitVerificationDecisionAction}>
                  <input type="hidden" name="verificationRequestId" value={item.id} />
                  <input type="hidden" name="decision" value="pending" />
                  <input type="hidden" name="returnPath" value={returnPath} />
                  <button type="submit" className="rounded-full bg-sky-500/20 px-3 py-1 text-xs text-sky-200">قيد المراجعة</button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
