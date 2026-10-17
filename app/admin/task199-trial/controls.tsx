'use client';
import { useActionState } from 'react';
import { operateTask199 } from './actions';

export function TrialControls() {
  const [state, action, pending] = useActionState(operateTask199, { code: 'NOT_STARTED', stopped: false });
  return <section className="space-y-4">
    <p role="status" aria-live="polite">{state.code} · الإيقاف مؤكد / Stop confirmed: {state.stopped ? 'نعم / Yes' : 'لا / No'}</p>
    <form action={action} className="flex flex-wrap gap-4">
      <button disabled={pending} name="operation" value="start">فتح النافذة / Open window</button>
      <button disabled={pending} name="operation" value="dispatch">إرسال مرة واحدة / Dispatch once</button>
      <button disabled={pending} name="operation" value="reconcile">قراءة حالة التسليم / Read delivery status</button>
      <button disabled={pending} name="operation" value="stop">إيقاف / Stop</button>
    </form>
    <p>لا تكرر الإرسال عند الغموض. ثلاث قراءات كحد أقصى قبل انتهاء النافذة. / Never resend an unknown outcome. At most three reads before window expiry.</p>
    <p>ACCEPTED ليس إثبات وصول. / ACCEPTED does not prove delivery.</p>
  </section>;
}
