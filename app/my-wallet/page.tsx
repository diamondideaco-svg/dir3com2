import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { reconcileWalletAgainstLedger } from '@/lib/finance/wallet-ledger';
import type { WalletRecord, WalletTransactionRecord } from '@/lib/supabase/types';
import AccountFrame from '@/components/v6/AccountFrame';
import Wallet, { type WalletView } from '@/components/v6/Wallet';
import { isUnprovisionedWallet } from '@/lib/customer/wallet-availability';
export default async function MyWalletPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirect=%2Fmy-wallet&next=%2Fmy-wallet');
  const { data, error } = await supabase.from('wallets').select('*').eq('owner_id', user.id).eq('owner_type', 'customer').order('created_at', { ascending: false }).limit(1).maybeSingle();
  let failed = Boolean(error) && !isUnprovisionedWallet(error);
  let view: WalletView | null = null;
  if (data && !error) {
    const wallet = data as WalletRecord;
    const result = await supabase.from('wallet_transactions').select('*').eq('wallet_id', wallet.id).order('created_at', { ascending: false });
    failed = Boolean(result.error);
    if (!failed) {
      const transactions = (result.data || []) as WalletTransactionRecord[];
      const { ledger } = reconcileWalletAgainstLedger(wallet, transactions);
      view = { currency: wallet.currency, balance: ledger.balance, available: ledger.availableBalance, held: ledger.heldBalance,
        transactions: transactions.map(tx => ({ id: tx.id, type: tx.transaction_type, amount: Number(tx.amount), date: tx.created_at, currency: tx.currency })) };
    }
  }
  return <AccountFrame path="/my-wallet" navy><Wallet wallet={view} failed={failed} currentMonth={new Date().toISOString().slice(0, 7)} /></AccountFrame>;
}
