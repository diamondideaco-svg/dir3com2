'use server';

import { requireAdminActionAccess } from '@/lib/auth/admin';
import { calculateSettlement, createInvoice, createSettlement, createWallet, creditWallet, debitWallet, holdFunds, releaseFunds } from '@/lib/finance/finance-engine';
import { reconcileWalletAgainstLedger } from '@/lib/finance/wallet-ledger';

function resolveBookingSettlementAmount(booking: { total_amount?: number | string | null; total_price?: number | string | null } | null, fallbackAmount?: number) {
  const amountFromTotal = Number(booking?.total_amount ?? Number.NaN);
  if (Number.isFinite(amountFromTotal) && amountFromTotal > 0) return amountFromTotal;

  const amountFromPrice = Number(booking?.total_price ?? Number.NaN);
  if (Number.isFinite(amountFromPrice) && amountFromPrice > 0) return amountFromPrice;

  const safeFallback = Number(fallbackAmount ?? Number.NaN);
  if (Number.isFinite(safeFallback) && safeFallback > 0) return safeFallback;

  return 0;
}

export async function createFinanceWallet(ownerId: string, ownerType: string, currency = 'SAR') {
  const { supabase } = await requireAdminActionAccess();
  return createWallet(supabase, ownerId, ownerType, currency);
}

export async function performWalletCredit(walletId: string, amount: number, reference?: string) {
  const { supabase } = await requireAdminActionAccess();
  return creditWallet(supabase, walletId, amount, reference);
}

export async function performWalletDebit(walletId: string, amount: number, reference?: string) {
  const { supabase } = await requireAdminActionAccess();
  return debitWallet(supabase, walletId, amount, reference);
}

export async function holdWalletFunds(walletId: string, amount: number, reference?: string) {
  const { supabase } = await requireAdminActionAccess();
  return holdFunds(supabase, walletId, amount, reference);
}

export async function releaseWalletFunds(walletId: string, amount: number, reference?: string) {
  const { supabase } = await requireAdminActionAccess();
  return releaseFunds(supabase, walletId, amount, reference);
}

export async function createPartnerSettlement(bookingId: string, partnerId: string, amount?: number) {
  const { supabase } = await requireAdminActionAccess();
  const { data: booking } = await supabase
    .from('bookings')
    .select('id,total_amount,total_price')
    .eq('id', bookingId)
    .maybeSingle();

  const settlementAmount = resolveBookingSettlementAmount(booking, amount);
  if (settlementAmount <= 0) {
    return { success: false, error: 'Booking amount is not available for settlement' };
  }

  return createSettlement(supabase, bookingId, partnerId, settlementAmount);
}

export async function createFinanceInvoice(ownerId: string, ownerType: string, invoiceType: string, totalAmount: number, currency = 'SAR') {
  const { supabase } = await requireAdminActionAccess();
  return createInvoice(supabase, ownerId, ownerType, invoiceType, totalAmount, currency);
}

export async function getFinanceSummary() {
  const { supabase } = await requireAdminActionAccess();
  const [walletsRes, settlementsRes, invoicesRes] = await Promise.all([
    supabase.from('wallets').select('*').order('created_at', { ascending: false }),
    supabase.from('partner_settlements').select('*').order('created_at', { ascending: false }),
    supabase.from('invoices').select('*').order('created_at', { ascending: false }),
  ]);

  const wallets = walletsRes.data || [];
  const walletIds = wallets.map((wallet: { id: string }) => wallet.id);

  const walletTransactionsRes = walletIds.length
    ? await supabase
        .from('wallet_transactions')
        .select('*')
        .in('wallet_id', walletIds)
        .order('created_at', { ascending: false })
    : { data: [] as Array<Record<string, unknown>> };

  const transactionsByWallet = new Map<string, Array<Record<string, unknown>>>();
  for (const tx of walletTransactionsRes.data || []) {
    const walletId = String((tx as { wallet_id?: string }).wallet_id ?? '');
    if (!walletId) continue;
    const list = transactionsByWallet.get(walletId) ?? [];
    list.push(tx as Record<string, unknown>);
    transactionsByWallet.set(walletId, list);
  }

  const reconciledWallets = wallets.map((wallet: { id: string; balance?: number | string | null; held_balance?: number | string | null; available_balance?: number | string | null; currency?: string | null }) => {
    const reconciliation = reconcileWalletAgainstLedger(wallet, transactionsByWallet.get(wallet.id) || []);

    return {
      ...wallet,
      balance: reconciliation.ledger.balance,
      held_balance: reconciliation.ledger.heldBalance,
      available_balance: reconciliation.ledger.availableBalance,
      reconciliation_status: reconciliation.isConsistent ? 'consistent' : 'drift',
      reconciliation_delta_balance: reconciliation.delta.balance,
      reconciliation_delta_held_balance: reconciliation.delta.heldBalance,
      reconciliation_delta_available_balance: reconciliation.delta.availableBalance,
      transaction_count: reconciliation.ledger.transactionCount,
    };
  });

  return {
    wallets: reconciledWallets,
    settlements: settlementsRes.data || [],
    invoices: invoicesRes.data || [],
  };
}

export async function getSettlementBreakdown(amount: number, commissionRate = 0.1, taxRate = 0) {
  return calculateSettlement(amount, commissionRate, taxRate);
}
