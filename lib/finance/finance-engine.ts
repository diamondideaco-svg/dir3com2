import type { SupabaseClient } from '@supabase/supabase-js';

export interface SettlementCalculation {
  partnerEarnings: number;
  commissionAmount: number;
  taxes: number;
  netSettlement: number;
  status: string;
}

export function calculateSettlement(amount: number, commissionRate = 0.1, taxRate = 0) {
  const partnerEarnings = amount;
  const commissionAmount = amount * commissionRate;
  const taxes = amount * taxRate;
  const netSettlement = partnerEarnings - commissionAmount - taxes;

  return {
    partnerEarnings,
    commissionAmount,
    taxes,
    netSettlement,
    status: 'pending',
  } satisfies SettlementCalculation;
}

export async function createWallet(supabase: SupabaseClient, ownerId: string, ownerType: string, currency = 'SAR') {
  return supabase.from('wallets').insert({ owner_id: ownerId, owner_type: ownerType, currency, balance: 0, held_balance: 0, available_balance: 0, status: 'active' }).select().single();
}

export async function creditWallet(supabase: SupabaseClient, walletId: string, amount: number, reference?: string) {
  const { data: wallet } = await supabase.from('wallets').select('*').eq('id', walletId).single();
  if (!wallet) return { success: false, error: 'Wallet not found' };

  const nextBalance = (wallet.balance || 0) + amount;
  const nextAvailable = (wallet.available_balance || 0) + amount;

  await supabase.from('wallets').update({ balance: nextBalance, available_balance: nextAvailable }).eq('id', walletId);
  await supabase.from('wallet_transactions').insert({ wallet_id: walletId, transaction_type: 'credit', amount, reference, metadata: { source: 'finance-engine' } });
  return { success: true };
}

export async function debitWallet(supabase: SupabaseClient, walletId: string, amount: number, reference?: string) {
  const { data: wallet } = await supabase.from('wallets').select('*').eq('id', walletId).single();
  if (!wallet) return { success: false, error: 'Wallet not found' };

  const nextBalance = (wallet.balance || 0) - amount;
  const nextAvailable = (wallet.available_balance || 0) - amount;

  await supabase.from('wallets').update({ balance: nextBalance, available_balance: nextAvailable }).eq('id', walletId);
  await supabase.from('wallet_transactions').insert({ wallet_id: walletId, transaction_type: 'debit', amount, reference, metadata: { source: 'finance-engine' } });
  return { success: true };
}

export async function holdFunds(supabase: SupabaseClient, walletId: string, amount: number, reference?: string) {
  const { data: wallet } = await supabase.from('wallets').select('*').eq('id', walletId).single();
  if (!wallet) return { success: false, error: 'Wallet not found' };

  const nextHeld = (wallet.held_balance || 0) + amount;
  const nextAvailable = (wallet.available_balance || 0) - amount;
  await supabase.from('wallets').update({ held_balance: nextHeld, available_balance: nextAvailable }).eq('id', walletId);
  await supabase.from('wallet_transactions').insert({ wallet_id: walletId, transaction_type: 'hold', amount, reference, metadata: { source: 'finance-engine' } });
  return { success: true };
}

export async function releaseFunds(supabase: SupabaseClient, walletId: string, amount: number, reference?: string) {
  const { data: wallet } = await supabase.from('wallets').select('*').eq('id', walletId).single();
  if (!wallet) return { success: false, error: 'Wallet not found' };

  const nextHeld = Math.max(0, (wallet.held_balance || 0) - amount);
  const nextAvailable = (wallet.available_balance || 0) + amount;
  await supabase.from('wallets').update({ held_balance: nextHeld, available_balance: nextAvailable }).eq('id', walletId);
  await supabase.from('wallet_transactions').insert({ wallet_id: walletId, transaction_type: 'release', amount, reference, metadata: { source: 'finance-engine' } });
  return { success: true };
}

export async function createSettlement(supabase: SupabaseClient, bookingId: string, partnerId: string, amount: number) {
  const calculation = calculateSettlement(amount);
  const { data, error } = await supabase.from('partner_settlements').insert({
    booking_id: bookingId,
    partner_id: partnerId,
    partner_earnings: calculation.partnerEarnings,
    commission_amount: calculation.commissionAmount,
    taxes: calculation.taxes,
    net_settlement: calculation.netSettlement,
    status: 'pending',
  }).select().single();

  if (error || !data) return { success: false, error: error?.message || 'Settlement failed' };

  return { success: true, settlement: data };
}

export async function createInvoice(supabase: SupabaseClient, ownerId: string, ownerType: string, invoiceType: string, totalAmount: number, currency = 'SAR') {
  const { data, error } = await supabase.from('invoices').insert({ owner_id: ownerId, owner_type: ownerType, invoice_type: invoiceType, status: 'Draft', total_amount: totalAmount, currency }).select().single();
  if (error || !data) return { success: false, error: error?.message || 'Invoice failed' };
  return { success: true, invoice: data };
}
