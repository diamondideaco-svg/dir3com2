'use client';

import { useRef, useState } from 'react';
import { attemptWorkerBinding, type SetupOutcome } from '@/lib/admin/drive-worker-binding-ui';
import type { WorkerBindingSetup } from '@/lib/admin/drive-worker-binding-setup';

export default function DriveWorkerBindingSetup({ approvalId, readiness }: WorkerBindingSetup) {
  const attempted = useRef(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<SetupOutcome | null>(readiness === 'bound' ? 'already-bound' : null);

  async function connect() {
    if (attempted.current || busy || readiness !== 'ready' || !approvalId) return;
    attempted.current = true;
    setBusy(true);
    try {
      if (!navigator.locks) { setOutcome('unavailable'); return; }
      setOutcome(await attemptWorkerBinding(approvalId, {
        origin: window.location.origin, storage: window.localStorage, locks: navigator.locks,
        fetcher: window.fetch.bind(window),
      }));
    } catch {
      setOutcome('unknown');
    } finally { setBusy(false); }
  }

  const connected = outcome === 'bound' || outcome === 'already-bound';
  const message = connected
    ? ['تم ربط اعتماد العامل. لا تثبت هذه الخطوة اتصال واتساب أو التشغيل التلقائي.', 'Worker credential linked. This step does not confirm WhatsApp connectivity or automatic operation.']
    : outcome === 'unknown'
      ? ['تعذّر تأكيد نتيجة الربط. توقفت المحاولة لحين التحقق.', 'The connection result could not be confirmed. The attempt is stopped pending verification.']
      : readiness !== 'ready' || outcome === 'unavailable'
        ? ['الربط غير جاهز حاليًا.', 'Connection setup is not ready.']
        : ['التهيئة جاهزة.', 'Setup is ready.'];

  return <section className="space-y-3 rounded-xl border p-4" aria-labelledby="whatsapp-setup-title">
    <h2 id="whatsapp-setup-title" className="text-lg font-semibold">
      <span lang="ar" dir="rtl">تهيئة واتساب للتشغيل التلقائي</span>
      <span lang="en" dir="ltr" className="block">Automatic WhatsApp setup</span>
    </h2>
    <p><span lang="ar" dir="rtl" className="block">هذه خطوة ربط تُجرى مرة واحدة؛ الإرسال التلقائي يتبع إعدادات الخدمة وموافقاتها.</span>
      <span lang="en" dir="ltr" className="block">Connect once. Automatic messages follow the service settings and approvals.</span></p>
    <button type="button" onClick={connect}
      disabled={readiness !== 'ready' || !approvalId || busy || outcome !== null}
      aria-busy={busy}
      className="min-h-11 w-full rounded-lg bg-slate-900 px-4 py-3 text-white disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
      {busy ? 'جارٍ الربط… / Connecting…' : 'ربط واتساب / Connect WhatsApp'}
    </button>
    <p role="status" aria-live="polite"><span lang="ar" dir="rtl" className="block">{message[0]}</span>
      <span lang="en" dir="ltr" className="block">{message[1]}</span></p>
  </section>;
}
