import { readCustomerTripBudget } from '@/lib/drive/customer-budget';

export default function CustomerTripBudget({search,language}:{search:string;language:'ar'|'en'}) {
  const budget=readCustomerTripBudget(new URLSearchParams(search));
  if (budget.kind==='absent') return null;
  const ar=language==='ar';
  return <aside data-customer-trip-budget dir={ar?'rtl':'ltr'} role="note">
    <h2>{ar?'ميزانية العميل للرحلة — غير مؤكدة':'Customer trip budget — unconfirmed'}</h2>
    {budget.kind==='invalid'?<p>{ar?'تعذر التحقق من بيانات الميزانية. راجع المقدار والعملة وأساس الرحلة؛ لن نفترض ميزانية بديلة.':'Budget details could not be verified. Review the amount, currency and trip basis; no replacement budget is assumed.'}</p>:<>
      <p><bdi>{budget.amount} {budget.currency}</bdi> — {ar?'للرحلة كاملة، وليس لليوم':'for the whole trip, not per day'}</p>
      <p>{ar?'هذا متطلب عميل قابل للمراجعة، وليس عرض سعر أو ضمان توفر. تؤكد العمليات إجمالي السعر والتوفر؛ عرض هذه المتطلبات لا يرسل طلبًا من تلقاء نفسه.':'This is an editable customer requirement, not a quote or availability guarantee. Operations confirms the total and availability; displaying these requirements does not submit a request automatically.'}</p>
    </>}
  </aside>;
}
