import { requireScopedAdminPageDataAccess, scopeCountryQuery } from '@/lib/auth/admin';
import { hasPermission } from '@/lib/auth/team-access';
import { progressContact } from '@/lib/actions/contact-actions';
import { AdminText } from '@/components/admin/AdminLocale';
export const dynamic = 'force-dynamic';
export default async function ContactInbox() {
  const { supabase, scope } = await requireScopedAdminPageDataAccess('/admin/operations/contact', 'operations:read');
  const { data, error } = await scopeCountryQuery(supabase.from('contact_enquiries')
    .select('id,name,email,phone,subject,message,country,status,created_at,contact_enquiry_events(id,status,internal_note,created_at)')
    .order('created_at', { ascending: false }).limit(100), scope);
  const write = scope.grant === null || hasPermission(scope.grant, 'operations:write');
  return <main className="mx-auto max-w-5xl space-y-5 p-4">
    <h1 className="text-2xl font-semibold"><AdminText ar="رسائل التواصل" en="Contact inbox" /></h1>
    <p><AdminText ar="آخر 100 رسالة ضمن صلاحياتك. الملاحظات داخلية؛ لا يرسل هذا الصندوق بريدًا أو واتساب." en="Latest 100 enquiries in your scope. Notes are internal; this inbox does not send email or WhatsApp." /></p>
    {error ? <p role="alert"><AdminText ar="تعذر تحميل الرسائل؛ لا يعني ذلك أن الصندوق فارغ." en="Unable to load enquiries; this does not mean the inbox is empty." /></p> : !data?.length ? <p><AdminText ar="لا رسائل ضمن صلاحياتك." en="No enquiries in your scope." /></p> : data.map(item => <article key={item.id} className="space-y-3 rounded-xl border bg-white p-4 break-words">
      <h2 className="font-semibold">{item.name} · {item.country}</h2>
      <p dir="ltr" className="break-all">{item.id} · {item.email} · {item.phone}</p>
      <p>{item.subject}</p><p className="whitespace-pre-wrap">{item.message}</p>
      <p><AdminText ar={item.status === 'received' ? 'مستلمة' : item.status === 'in_progress' ? 'قيد المتابعة' : 'مغلقة'} en={item.status === 'received' ? 'Received' : item.status === 'in_progress' ? 'In progress' : 'Closed'} /></p>
      <details><summary><AdminText ar="سجل المتابعة الداخلي" en="Internal follow-up history" /></summary><ul className="space-y-2">{item.contact_enquiry_events.map(event => <li key={event.id} className="whitespace-pre-wrap border-t py-2"><time>{event.created_at}</time> · {event.status}{event.internal_note ? <p>{event.internal_note}</p> : null}</li>)}</ul></details>
      {write && item.status !== 'closed' && <form action={progressContact} className="space-y-3">
        <input type="hidden" name="id" value={item.id} /><input type="hidden" name="expected" value={item.status} />
        <input type="hidden" name="status" value={item.status === 'received' ? 'in_progress' : 'closed'} />
        <label className="block"><AdminText ar="ملاحظة داخلية (لا تُرسل للعميل)" en="Internal note (not sent to customer)" /><textarea name="note" maxLength={2000} className="mt-1 block w-full rounded border p-2" /></label>
        <button className="rounded bg-slate-900 px-4 py-2 text-white"><AdminText ar={item.status === 'received' ? 'بدء المتابعة' : 'إغلاق المتابعة'} en={item.status === 'received' ? 'Start follow-up' : 'Close follow-up'} /></button>
      </form>}
    </article>)}
  </main>;
}
