import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';

function loadDotEnvLocal() {
  const filePath = path.resolve('.env.local');
  if (!fs.existsSync(filePath)) return;

  const raw = fs.readFileSync(filePath, 'utf8');
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

const BASE_URL = (process.env.SANDBOX_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const SANDBOX_TOKEN = String(process.env.SANDBOX_INTERNAL_TOKEN || '').trim();
const targetEnv = String(process.env.SANDBOX_TARGET_ENV || 'local').toLowerCase();

if (targetEnv !== 'local' && targetEnv !== 'staging') {
  console.error('SANDBOX_TARGET_ENV must be local or staging.');
  process.exit(1);
}

const endpoint = `${BASE_URL}/api/ai2/sandbox`;

async function callSandbox(action, payload = {}) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(SANDBOX_TOKEN ? { 'x-sandbox-token': SANDBOX_TOKEN } : {}),
    },
    body: JSON.stringify({ action, ...payload }),
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.ok) {
    throw new Error(`${action} failed: ${json?.error || response.statusText}`);
  }

  return json.data;
}

function addDays(dateIso, days) {
  const d = new Date(`${dateIso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function run() {
  const today = new Date().toISOString().slice(0, 10);

  const progress = [];

  const search = await callSandbox('search', {
    query: 'Cairo',
    city: 'Cairo',
    limit: 12,
  });

  if (!Array.isArray(search.results) || search.results.length < 3) {
    throw new Error('Search returned insufficient synthetic inventory.');
  }

  progress.push(`search=${search.results.length}`);

  const selected = search.results.slice(0, 3);
  const compare = await callSandbox('compare', {
    productIds: selected.map((item) => item.id),
  });

  if (!Array.isArray(compare.results) || compare.results.length < 2) {
    throw new Error('Compare did not return enough products.');
  }

  progress.push(`compare=${compare.results.length}`);

  const productId = selected[0].id;

  const windowScan = await callSandbox('availability', {
    productId,
    fromDate: addDays(today, 3),
    toDate: addDays(today, 45),
  });

  const rows = Array.isArray(windowScan.results) ? windowScan.results : [];
  const cleanRows = rows.filter((row) => String(row.availability_status || '').toLowerCase() === 'available');

  if (cleanRows.length < 6) {
    throw new Error('Not enough available days for booking lifecycle checks.');
  }

  const arrivalDate = cleanRows[0].date;
  const departureDate = cleanRows[2].date;
  const modifyArrivalDate = cleanRows[3].date;
  const modifyDepartureDate = cleanRows[5].date;

  const availability = await callSandbox('availability', {
    productId,
    fromDate: arrivalDate,
    toDate: departureDate,
  });

  if (!Array.isArray(availability.results) || availability.results.length === 0) {
    throw new Error('Availability returned no rows.');
  }

  progress.push(`availability=${availability.results.length}`);

  const quote = await callSandbox('quote', {
    productId,
    arrivalDate,
    departureDate,
    guests: 2,
  });

  if (!quote?.result?.total || Number(quote.result.total) <= 0) {
    throw new Error('Quote total is invalid.');
  }

  progress.push(`quoteTotal=${quote.result.total}`);

  const created = await callSandbox('create-booking', {
    productId,
    arrivalDate,
    departureDate,
    guests: 2,
    guestName: 'DABRA Synthetic Guest',
    guestPhone: '+201000000001',
    guestEmail: 'dabra.synthetic@dir3com.test',
    notes: 'Synthetic e2e booking',
  });

  const bookingId = created?.result?.booking?.id;
  if (!bookingId) {
    throw new Error('Create booking did not return booking id.');
  }

  progress.push(`create=${created.result.booking.booking_reference}`);

  const modified = await callSandbox('modify-booking', {
    bookingId,
    arrivalDate: modifyArrivalDate,
    departureDate: modifyDepartureDate,
    guests: 3,
    notes: 'Synthetic reschedule check',
  });

  if (!modified?.result?.booking?.arrival_date) {
    throw new Error('Modify booking failed.');
  }

  progress.push('modify=ok');

  const escalated = await callSandbox('escalate-booking', {
    bookingId,
    reason: 'vip_route_needs_human',
  });

  if (!escalated?.result?.escalated_to_staff) {
    throw new Error('Escalation failed.');
  }

  progress.push('escalate=ok');

  const cancelled = await callSandbox('cancel-booking', {
    bookingId,
    reason: 'customer_requested_cancel',
  });

  if (cancelled?.result?.status !== 'cancelled') {
    throw new Error('Cancel booking failed.');
  }

  progress.push('cancel=ok');

  const output = {
    pass: true,
    environment: targetEnv,
    baseUrl: BASE_URL,
    endpoint,
    previewLink: `${BASE_URL}/ai/pilot`,
    evidence: progress,
    generatedAt: new Date().toISOString(),
  };

  console.log(JSON.stringify(output, null, 2));
}

run().catch((error) => {
  console.error(
    JSON.stringify(
      {
        pass: false,
        environment: targetEnv,
        baseUrl: BASE_URL,
        endpoint,
        error: error.message,
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
