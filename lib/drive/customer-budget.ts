import { parseDisplayCurrency, type DisplayCurrency } from '../currency/display';

export type CustomerTripBudget = {kind:'absent'} | {kind:'invalid'} | {kind:'requirement';amount:string;currency:DisplayCurrency;basis:'trip'};
const keys=['budgetAmount','budgetCurrency','budgetBasis'] as const;
/** Public URL input is editable customer intent, never a quote or authority. */
export function readCustomerTripBudget(params:URLSearchParams):CustomerTripBudget {
  if (keys.every(key=>!params.has(key))) return {kind:'absent'};
  if (keys.some(key=>params.getAll(key).length!==1)) return {kind:'invalid'};
  const amount=params.get('budgetAmount') ?? '';
  const currency=params.get('budgetCurrency');
  const parsedCurrency=parseDisplayCurrency(currency);
  if (!/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(amount) || Number(amount)<=0 || !parsedCurrency || parsedCurrency!==currency || params.get('budgetBasis')!=='trip') return {kind:'invalid'};
  return {kind:'requirement',amount,currency:parsedCurrency,basis:'trip'};
}
export function carryCustomerTripBudget(target:URLSearchParams,source:URLSearchParams) {
  const budget=readCustomerTripBudget(source);
  for (const key of keys) target.delete(key);
  if (budget.kind==='requirement') {
    target.set('budgetAmount',budget.amount);target.set('budgetCurrency',budget.currency);target.set('budgetBasis',budget.basis);
  } else if (budget.kind==='invalid') target.set('budgetBasis','invalid');
  return target;
}
