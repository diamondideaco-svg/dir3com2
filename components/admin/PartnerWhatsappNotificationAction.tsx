'use client';

import { useState } from 'react';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import { AdminStatusText } from '@/components/admin/AdminLocale';
import type { PartnerWhatsappState } from '@/lib/integrations/twilio-whatsapp';

export function PartnerWhatsappNotificationAction({
  requestId,
  initialState,
  enabled,
}: {
  requestId: string;
  initialState: PartnerWhatsappState | null;
  enabled: boolean;
}) {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const [state, setState] = useState<PartnerWhatsappState>(enabled ? initialState ?? 'idle' : 'disabled');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const final = ['queued', 'sent', 'delivered', 'read'].includes(state);

  async function send() {
    if (!enabled || working || final) return;
    if (!window.confirm(ar ? 'إرسال إشعار واتساب لهذا الشريك عن الطلب المحدد؟' : 'Send a WhatsApp notification to this request partner?')) return;
    setWorking(true);
    setState('sending');
    setError(null);
    try {
      const response = await fetch('/api/admin/operations/partner-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId }),
      });
      const payload = await response.json() as { data?: { state?: PartnerWhatsappState }; error?: { code?: string } };
      if (!response.ok || !payload.data?.state) throw new Error(payload.error?.code ?? 'SEND_FAILED');
      setState(payload.data.state);
    } catch {
      setState('failed');
      setError(ar ? 'تعذر تجهيز الإشعار أو وضعه في قائمة الإرسال.' : 'The notification could not be prepared or queued.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="mt-2 grid min-w-48 gap-2">
      <button type="button" onClick={send} disabled={!enabled || working || final}
        className="rounded border border-gold-400 px-2 py-1 text-xs font-semibold text-gold-400 disabled:cursor-not-allowed disabled:opacity-55">
        {working ? (ar ? 'جارٍ الإرسال…' : 'Sending…') : (ar ? 'إرسال إشعار واتساب للشريك' : 'Send partner WhatsApp notification')}
      </button>
      <span className="text-xs text-slate-400"><AdminStatusText value={working ? 'sending' : state} /></span>
      {state === 'disabled' ? <span className="text-xs text-slate-400">{ar ? 'الإرسال الآلي غير مفعّل.' : 'Automated delivery is disabled.'}</span> : null}
      {error ? <span role="alert" className="text-xs text-rose-300">{error}</span> : null}
    </div>
  );
}
