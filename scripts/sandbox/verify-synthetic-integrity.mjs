import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

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
    if (!process.env[key]) process.env[key] = value;
  }
}

loadDotEnvLocal();

const targetEnv = (process.env.SANDBOX_TARGET_ENV || 'staging').trim().toLowerCase();
const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing Supabase URL or service role key.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function fetchCount(table) {
  const { count, error } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('synthetic', true)
    .eq('environment', targetEnv)
    .like('reference_code', 'TEST-%');

  if (error) {
    if (/Could not find the table|relation .* does not exist/i.test(error.message)) {
      return 0;
    }
    throw new Error(`[${table}] ${error.message}`);
  }
  return count || 0;
}

async function fetchBrokenRows(table, extraFields = ['synthetic', 'environment', 'reference_code']) {
  const { data, error } = await supabase
    .from(table)
    .select(['id', ...extraFields].join(','))
    .eq('synthetic', true)
    .eq('environment', targetEnv)
    .limit(5000);

  if (error) {
    if (/Could not find the table|relation .* does not exist/i.test(error.message)) {
      return [];
    }
    throw new Error(`[${table}] ${error.message}`);
  }

  return (data || []).filter((row) => row.synthetic !== true || row.environment !== targetEnv || !String(row.reference_code || '').startsWith('TEST-'));
}

async function main() {
  const tables = [
    'product_categories',
    'partners',
    'partner_services',
    'partner_coverage',
    'products',
    'product_images',
    'product_features',
    'product_prices',
    'product_availability',
    'bookings',
    'booking_status_history',
    'payment_transactions',
  ];

  const counts = {};
  const brokenSummary = {};

  for (const table of tables) {
    counts[table] = await fetchCount(table);
    const broken = await fetchBrokenRows(table);
    if (broken.length) {
      brokenSummary[table] = broken.length;
    }
  }

  const minimums = {
    products: 62,
    product_availability: 62 * 90,
    bookings: 12,
  };

  const thresholdPass =
    (counts.products || 0) >= minimums.products &&
    (counts.product_availability || 0) >= minimums.product_availability &&
    (counts.bookings || 0) >= minimums.bookings;

  const pass = thresholdPass && Object.keys(brokenSummary).length === 0;

  console.log(
    JSON.stringify(
      {
        pass,
        environment: targetEnv,
        counts,
        brokenSummary,
      },
      null,
      2,
    ),
  );

  if (!pass) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
