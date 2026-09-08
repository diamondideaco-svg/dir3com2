import { computeWalletLedgerTotals } from '@/lib/finance/wallet-ledger';

type SpendingTransaction = { type: string; amount: number; date: string; currency: string | null; status?: string | null };

// The current ledger has no authoritative travel-family allocation. Never infer
// hotels/cars/flights from descriptions or manufacture a category breakdown.
export function walletSpending(transactions: SpendingTransaction[] | null, currency: string | null, month: string | null) {
  if (!transactions || !currency) return null;
  const debits = transactions.filter(tx => tx.type === 'debit' && (!month || tx.date.slice(0, 7) === month));
  if (debits.some(tx => tx.currency !== currency || !Number.isFinite(tx.amount) || tx.amount < 0)) return null;
  // Reuse canonical eligibility and money rounding; no second status policy.
  const ledger = computeWalletLedgerTotals(debits.map(tx => ({
    transaction_type: tx.type, amount: tx.amount, currency: tx.currency, status: tx.status,
  })), currency);
  return ledger.balance === 0 ? 0 : -ledger.balance;
}
