'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { calculateSettlement, createInvoice, createSettlement, createWallet, creditWallet, debitWallet, holdFunds, releaseFunds } from '@/lib/finance/finance-engine';

export async function createFinanceWallet(ownerId: string, ownerType: string, currency = 'SAR') {
  const supabase = await createSupabaseServerClient();
  return createWallet(supabase, ownerId, ownerType, currency);
}

export async function performWalletCredit(walletId: string, amount: number, reference?: string) {
  const supabase = await createSupabaseServerClient();
  return creditWallet(supabase, walletId, amount, reference);
}

export async function performWalletDebit(walletId: string, amount: number, reference?: string) {
  const supabase = await createSupabaseServerClient();
  return debitWallet(supabase, walletId, amount, reference);
}

export async function holdWalletFunds(walletId: string, amount: number, reference?: string) {
  const supabase = await createSupabaseServerClient();
  return holdFunds(supabase, walletId, amount, reference);
}

export async function releaseWalletFunds(walletId: string, amount: number, reference?: string) {
  const supabase = await createSupabaseServerClient();
  return releaseFunds(supabase, walletId, amount, reference);
}

export async function createPartnerSettlement(bookingId: string, partnerId: string, amount: number) {
  const supabase = await createSupabaseServerClient();
  return createSettlement(supabase, bookingId, partnerId, amount);
}

export async function createFinanceInvoice(ownerId: string, ownerType: string, invoiceType: string, totalAmount: number, currency = 'SAR') {
  const supabase = await createSupabaseServerClient();
  return createInvoice(supabase, ownerId, ownerType, invoiceType, totalAmount, currency);
}

export async function getFinanceSummary() {
  const supabase = await createSupabaseServerClient();
  const [walletsRes, settlementsRes, invoicesRes] = await Promise.all([
    supabase.from('wallets').select('*').order('created_at', { ascending: false }),
    supabase.from('partner_settlements').select('*').order('created_at', { ascending: false }),
    supabase.from('invoices').select('*').order('created_at', { ascending: false }),
  ]);

  return {
    wallets: walletsRes.data || [],
    settlements: settlementsRes.data || [],
    invoices: invoicesRes.data || [],
  };
}

export async function getSettlementBreakdown(amount: number, commissionRate = 0.1, taxRate = 0) {
  return calculateSettlement(amount, commissionRate, taxRate);
}
