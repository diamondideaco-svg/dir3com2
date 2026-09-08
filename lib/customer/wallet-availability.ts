// The finance workstream has not provisioned this contract everywhere yet.
// Only the exact missing-relation result is expected; permission/timeouts and
// all other failures remain errors. Never turn those into a zero balance.
export function isUnprovisionedWallet(error: { code?: string; message?: string } | null) {
  return error?.code === 'PGRST205'
    && /Could not find the table '(?:public\.)?wallets' in the schema cache/i.test(error.message || '');
}
