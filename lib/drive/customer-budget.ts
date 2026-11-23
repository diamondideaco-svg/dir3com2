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

export type CustomerBudgetRequirement = Omit<Extract<CustomerTripBudget,{kind:'requirement'}>,'kind'>;
/** Persisted JSON/RPC input has no provenance; validate again before use or display. */
export function readCustomerBudget(value:unknown):CustomerTripBudget {
  if (value===undefined) return {kind:'absent'};
  if (!value || typeof value!=='object' || Array.isArray(value)) return {kind:'invalid'};
  const fields=Object.keys(value);
  if (fields.length!==3 || fields.some(key=>!['amount','currency','basis'].includes(key))) return {kind:'invalid'};
  if (!('amount' in value) || typeof value.amount!=='string' || !('currency' in value) || typeof value.currency!=='string' || !('basis' in value) || typeof value.basis!=='string') return {kind:'invalid'};
  return readCustomerTripBudget(new URLSearchParams({budgetAmount:value.amount,budgetCurrency:value.currency,budgetBasis:value.basis}));
}
export function customerBudgetSearch(value:unknown) {
  const budget=readCustomerBudget(value);
  if (budget.kind==='absent') return '';
  if (budget.kind==='invalid') return 'budgetBasis=invalid';
  return new URLSearchParams({budgetAmount:budget.amount,budgetCurrency:budget.currency,budgetBasis:budget.basis}).toString();
}
