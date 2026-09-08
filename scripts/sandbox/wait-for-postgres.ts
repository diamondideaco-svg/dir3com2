/** Read-only readiness probe. The caller must use the final server's TCP path,
 * not postgres Docker's temporary, socket-only initialization server. */
export async function waitForPostgres(
  probe: () => string,
  { timeoutMs = 30_000, intervalMs = 250 } = {},
): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  let attempts = 0;
  do {
    attempts += 1;
    try { if (probe().trim() === '1') return attempts; } catch { /* Startup only; never retry DDL/DML. */ }
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await new Promise(resolve => setTimeout(resolve, Math.min(intervalMs, remaining)));
  } while (Date.now() < deadline);
  throw new Error('LOCAL_DB_START_TIMEOUT');
}
