import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

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

const baseUrl = (process.env.SANDBOX_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');

async function getJson(url) {
  const response = await fetch(url);
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${url} => ${response.status}`);
  }
  return json;
}

function containsSyntheticToken(value) {
  return String(value || '').toLowerCase().includes('sandbox') || String(value || '').startsWith('TEST-');
}

async function main() {
  const categories = await getJson(`${baseUrl}/api/public/marketplace/categories`);
  const items = await getJson(`${baseUrl}/api/public/marketplace/items?page=1&pageSize=20&q=sandbox`);

  const categoryLeak = (categories.categories || []).some((row) => containsSyntheticToken(row.slug) || containsSyntheticToken(row.name_en) || containsSyntheticToken(row.name_ar));

  const itemLeak = (items.items || []).some((row) => containsSyntheticToken(row.slug) || containsSyntheticToken(row.name_en) || containsSyntheticToken(row.name_ar));

  const pass = !categoryLeak && !itemLeak;

  console.log(
    JSON.stringify(
      {
        pass,
        baseUrl,
        categoryCount: (categories.categories || []).length,
        itemCount: (items.items || []).length,
        categoryLeak,
        itemLeak,
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
