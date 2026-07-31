type LedgerWalletLike = {
  balance?: number | string | null;
  held_balance?: number | string | null;
  available_balance?: number | string | null;
  currency?: string | null;
};

type LedgerTransactionLike = {
  transaction_type?: string | null;
  amount?: number | string | null;
  currency?: string | null;
  status?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type WalletLedgerTotals = {
  balance: number;
  heldBalance: number;
  availableBalance: number;
  currency: string;
  transactionCount: number;
};

export type WalletLedgerReconciliation = {
  ledger: WalletLedgerTotals;
  stored: {
    balance: number;
    heldBalance: number;
    availableBalance: number;
    currency: string;
  };
  delta: {
    balance: number;
    heldBalance: number;
    availableBalance: number;
  };
  isConsistent: boolean;
};

const COMMITTED_STATUSES = new Set(['completed', 'succeeded', 'posted', 'settled', 'approved', 'success']);
const REJECTED_STATUSES = new Set(['failed', 'cancelled', 'canceled', 'reversed', 'void']);

const BALANCE_CREDIT_TYPES = new Set(['credit']);
const BALANCE_DEBIT_TYPES = new Set(['debit']);
const HELD_INCREASE_TYPES = new Set(['hold']);
const HELD_DECREASE_TYPES = new Set(['release']);

function toMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function toNumber(value: number | string | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeStatus(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

function extractTransactionStatus(transaction: LedgerTransactionLike) {
  const metadata = transaction.metadata ?? {};
  const metadataStatus = normalizeStatus(metadata.status);
  const status = normalizeStatus(transaction.status);
  return status || metadataStatus || 'posted';
}

function isCommittedTransaction(transaction: LedgerTransactionLike) {
  const status = extractTransactionStatus(transaction);

  if (REJECTED_STATUSES.has(status)) {
    return false;
  }

  if (COMMITTED_STATUSES.has(status)) {
    return true;
  }

  return status === '' || status === 'pending';
}

export function computeWalletLedgerTotals(transactions: LedgerTransactionLike[], walletCurrency?: string | null): WalletLedgerTotals {
  let balance = 0;
  let heldBalance = 0;
  let transactionCount = 0;

  for (const transaction of transactions) {
    if (!isCommittedTransaction(transaction)) {
      continue;
    }

    const type = normalizeStatus(transaction.transaction_type);
    const amount = toMoney(Math.abs(toNumber(transaction.amount)));
    if (amount <= 0) {
      continue;
    }

    transactionCount += 1;

    if (BALANCE_CREDIT_TYPES.has(type)) {
      balance = toMoney(balance + amount);
      continue;
    }

    if (BALANCE_DEBIT_TYPES.has(type)) {
      balance = toMoney(balance - amount);
      continue;
    }

    if (HELD_INCREASE_TYPES.has(type)) {
      heldBalance = toMoney(heldBalance + amount);
      continue;
    }

    if (HELD_DECREASE_TYPES.has(type)) {
      heldBalance = toMoney(Math.max(0, heldBalance - amount));
      continue;
    }
  }

  const availableBalance = toMoney(balance - heldBalance);

  return {
    balance,
    heldBalance,
    availableBalance,
    currency: walletCurrency ?? 'SAR',
    transactionCount,
  };
}

export function reconcileWalletAgainstLedger(wallet: LedgerWalletLike, transactions: LedgerTransactionLike[]): WalletLedgerReconciliation {
  const storedBalance = toMoney(toNumber(wallet.balance));
  const storedHeldBalance = toMoney(toNumber(wallet.held_balance));
  const storedAvailableBalance = toMoney(toNumber(wallet.available_balance));
  const currency = wallet.currency ?? 'SAR';

  const ledger = computeWalletLedgerTotals(transactions, currency);

  const delta = {
    balance: toMoney(storedBalance - ledger.balance),
    heldBalance: toMoney(storedHeldBalance - ledger.heldBalance),
    availableBalance: toMoney(storedAvailableBalance - ledger.availableBalance),
  };

  const isConsistent = delta.balance === 0 && delta.heldBalance === 0 && delta.availableBalance === 0;

  return {
    ledger,
    stored: {
      balance: storedBalance,
      heldBalance: storedHeldBalance,
      availableBalance: storedAvailableBalance,
      currency,
    },
    delta,
    isConsistent,
  };
}
