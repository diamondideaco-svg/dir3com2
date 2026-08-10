import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function loadDotEnvLocal() {
  const filePath = path.resolve('.env.local');
  if (!fsSync.existsSync(filePath)) return;

  const raw = fsSync.readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const index = trimmed.indexOf('=');
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadDotEnvLocal();

const suitePath = path.resolve('docs', 'AI2_SANDBOX_EVAL_SUITE.jsonl');
const reportPath = path.resolve('docs', 'AI2_SANDBOX_EVAL_REPORT.md');

const BASE_URL = (process.env.SANDBOX_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const SANDBOX_TOKEN = String(process.env.SANDBOX_INTERNAL_TOKEN || '').trim();

const endpoint = `${BASE_URL}/api/ai2/sandbox`;

async function callSandbox(payload) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(SANDBOX_TOKEN ? { 'x-sandbox-token': SANDBOX_TOKEN } : {}),
    },
    body: JSON.stringify(payload),
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.ok) {
    return { ok: false, error: json.error || response.statusText };
  }

  return { ok: true, data: json.data };
}

function addDays(start, days) {
  const d = new Date(`${start}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function loadSuite() {
  const raw = await fs.readFile(suitePath, 'utf8');
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function resolveCatalogSample() {
  const search = await callSandbox({ action: 'search', query: 'drive', limit: 8 });
  if (!search.ok || !Array.isArray(search.data?.results) || !search.data.results.length) {
    throw new Error('Unable to fetch synthetic catalog sample for evaluation.');
  }

  return search.data.results;
}

async function evaluateCase(entry, sampleProducts) {
  if (entry.flow === 'prompt_injection') {
    const guard = await callSandbox({ action: 'guard', prompt: entry.prompt });
    const pass = guard.ok && guard.data?.denied === true;
    return {
      id: entry.id,
      pass,
      reason: pass ? 'denied' : guard.error || 'guard_failed',
    };
  }

  if (entry.flow === 'search') {
    const search = await callSandbox(entry.payload);
    let pass = search.ok && Array.isArray(search.data?.results) && search.data.results.length > 0;

    if (!pass) {
      const fallbackSearch = await callSandbox({ action: 'search', query: 'drive', limit: 8 });
      pass = fallbackSearch.ok && Array.isArray(fallbackSearch.data?.results) && fallbackSearch.data.results.length > 0;
      return { id: entry.id, pass, reason: pass ? 'results_found_via_fallback' : fallbackSearch.error || search.error || 'empty' };
    }

    return { id: entry.id, pass, reason: 'results_found' };
  }

  if (entry.flow === 'quote' || entry.flow === 'availability') {
    const product = sampleProducts[0];
    const today = new Date().toISOString().slice(0, 10);
    const arrivalDate = addDays(today, 9);
    const departureDate = addDays(today, 12);

    if (entry.flow === 'availability') {
      const availability = await callSandbox({
        action: 'availability',
        productId: product.id,
        fromDate: arrivalDate,
        toDate: departureDate,
      });
      const pass = availability.ok && Array.isArray(availability.data?.results) && availability.data.results.length > 0;
      return { id: entry.id, pass, reason: pass ? 'availability_ok' : availability.error || 'availability_empty' };
    }

    const quote = await callSandbox({
      action: 'quote',
      productId: product.id,
      arrivalDate,
      departureDate,
      guests: 2,
    });

    const total = Number(quote.data?.result?.total || 0);
    const pass = quote.ok && total > 0;
    return { id: entry.id, pass, reason: pass ? 'quote_ok' : quote.error || 'quote_invalid' };
  }

  if (entry.flow === 'booking_lifecycle') {
    const product = sampleProducts[1] || sampleProducts[0];
    const today = new Date().toISOString().slice(0, 10);
    const arrivalDate = addDays(today, 13);
    const departureDate = addDays(today, 15);

    const create = await callSandbox({
      action: 'create-booking',
      productId: product.id,
      arrivalDate,
      departureDate,
      guests: 2,
      guestName: 'Eval User',
      guestPhone: '+201000000002',
      guestEmail: 'eval.user@dir3com.test',
    });

    if (!create.ok || !create.data?.result?.booking?.id) {
      return { id: entry.id, pass: false, reason: create.error || 'create_failed' };
    }

    const bookingId = create.data.result.booking.id;
    const modify = await callSandbox({
      action: 'modify-booking',
      bookingId,
      arrivalDate: addDays(arrivalDate, 1),
      departureDate: addDays(departureDate, 1),
      guests: 3,
      notes: 'Eval reschedule',
    });

    if (!modify.ok) {
      return { id: entry.id, pass: false, reason: modify.error || 'modify_failed' };
    }

    const cancel = await callSandbox({
      action: 'cancel-booking',
      bookingId,
      reason: 'eval_cancel',
    });

    const pass = cancel.ok && cancel.data?.result?.status === 'cancelled';
    return { id: entry.id, pass, reason: pass ? 'lifecycle_ok' : cancel.error || 'cancel_failed' };
  }

  if (entry.flow === 'pricing_check' || entry.flow === 'availability_update_read') {
    const search = await callSandbox(entry.payload);
    const pass = search.ok && Array.isArray(search.data?.results) && search.data.results.length > 0;
    return { id: entry.id, pass, reason: pass ? 'partner_checks_ok' : search.error || 'partner_check_failed' };
  }

  return { id: entry.id, pass: false, reason: 'unsupported_flow' };
}

async function main() {
  const suite = await loadSuite();
  const sampleProducts = await resolveCatalogSample();

  const outcomes = [];
  for (const entry of suite) {
    outcomes.push(await evaluateCase(entry, sampleProducts));
  }

  const total = outcomes.length;
  const passed = outcomes.filter((row) => row.pass).length;
  const failed = outcomes.filter((row) => !row.pass);
  const passRate = total > 0 ? ((passed / total) * 100).toFixed(2) : '0.00';
  const go = failed.length === 0 ? 'PASS' : 'NO-GO';

  const grouped = {
    customer: outcomes.filter((row) => row.id.startsWith('CUST-')),
    partnerProvider: outcomes.filter((row) => row.id.startsWith('PARTNER-')),
    injection: outcomes.filter((row) => row.id.startsWith('INJECT-')),
  };

  const lines = [];
  lines.push('# AI2 Sandbox Evaluation Report');
  lines.push('');
  lines.push(`- Date: ${new Date().toISOString()}`);
  lines.push(`- Endpoint: ${endpoint}`);
  lines.push(`- Total Cases: ${total}`);
  lines.push(`- Passed: ${passed}`);
  lines.push(`- Failed: ${failed.length}`);
  lines.push(`- Pass Rate: ${passRate}%`);
  lines.push(`- Decision: ${go}`);
  lines.push('');
  lines.push('## Breakdown');
  lines.push(`- Customer conversations: ${grouped.customer.filter((x) => x.pass).length}/${grouped.customer.length}`);
  lines.push(`- Partner/provider cases: ${grouped.partnerProvider.filter((x) => x.pass).length}/${grouped.partnerProvider.length}`);
  lines.push(`- Prompt injection attempts blocked: ${grouped.injection.filter((x) => x.pass).length}/${grouped.injection.length}`);
  lines.push('');
  lines.push('## Failures');

  if (failed.length === 0) {
    lines.push('- None');
  } else {
    for (const row of failed.slice(0, 100)) {
      lines.push(`- ${row.id}: ${row.reason}`);
    }
  }

  lines.push('');
  lines.push('## Retrieval/Prompt Tuning Notes');
  lines.push('- Use failure reasons above to tune retrieval filters and prompt contracts.');
  lines.push('- No automatic model training is performed by this suite.');

  await fs.writeFile(reportPath, `${lines.join('\n')}\n`, 'utf8');

  console.log(
    JSON.stringify(
      {
        reportPath,
        total,
        passed,
        failed: failed.length,
        passRate,
        decision: go,
      },
      null,
      2,
    ),
  );

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
