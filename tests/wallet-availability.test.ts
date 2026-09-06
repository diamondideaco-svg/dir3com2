import test from 'node:test';
import assert from 'node:assert/strict';
import { isUnprovisionedWallet } from '../lib/customer/wallet-availability';
test('known unprovisioned finance contract is not confused with permission, timeout or other schema errors',()=>{
 assert.equal(isUnprovisionedWallet({code:'PGRST205',message:"Could not find the table 'public.wallets' in the schema cache"}),true);
 for(const error of [null,{code:'42501',message:'permission denied'}, {code:'PGRST205',message:"Could not find the table 'public.profiles' in the schema cache"}, {code:'42703',message:'missing column'}, {code:'TIMEOUT',message:'timeout'}]) assert.equal(Boolean(isUnprovisionedWallet(error)),false);
});
