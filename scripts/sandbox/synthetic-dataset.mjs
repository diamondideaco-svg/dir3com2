import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
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

const TEST_PREFIX = 'TEST-';
const TARGET_ENV = (process.env.SANDBOX_TARGET_ENV || 'local').trim().toLowerCase();
const APP_ENV = (process.env.NEXT_PUBLIC_APP_ENV || process.env.APP_ENV || '').trim().toLowerCase();
const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const ALLOW_STAGING = String(process.env.SANDBOX_ALLOW_STAGING || '').trim() === '1';
const PROVISION_USERS = String(process.env.SANDBOX_PROVISION_USERS || '').trim() === '1';

const command = (process.argv[2] || '').trim().toLowerCase();

function fail(message) {
  throw new Error(message);
}

function assertSafeEnvironment() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    fail('Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  }

  if (process.env.NODE_ENV === 'production') {
    fail('Blocked: NODE_ENV=production. Sandbox scripts are local/staging only.');
  }

  if (TARGET_ENV !== 'local' && TARGET_ENV !== 'staging') {
    fail('Blocked: SANDBOX_TARGET_ENV must be local or staging.');
  }

  if (APP_ENV === 'production') {
    fail('Blocked: APP_ENV indicates production.');
  }

  if (/prod/i.test(SUPABASE_URL)) {
    fail('Blocked: SUPABASE_URL looks like production.');
  }

  if (TARGET_ENV === 'staging' && !ALLOW_STAGING) {
    fail('Blocked: staging execution requires SANDBOX_ALLOW_STAGING=1.');
  }
}

assertSafeEnvironment();

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

function slugify(input) {
  return String(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 64);
}

function reference(code) {
  return `${TEST_PREFIX}${code}`;
}

function dayOffset(base, offset) {
  const value = new Date(base);
  value.setUTCDate(value.getUTCDate() + offset);
  return value;
}

function dateOnly(value) {
  return value.toISOString().slice(0, 10);
}

async function upsert(table, rows, conflict) {
  if (!rows.length) return;
  const q = supabase.from(table).upsert(rows, { onConflict: conflict });
  const { error } = await q;
  if (error) {
    throw new Error(`[${table}] ${error.message}`);
  }
}

async function ensureSandboxAccounts() {
  if (!PROVISION_USERS) {
    return;
  }

  const buildPassword = () => {
    const segment = Math.random().toString(36).slice(2, 10);
    const symbol = '!@#$%^&*'[Math.floor(Math.random() * 8)];
    return `Sb${segment}${symbol}9A`;
  };

  const accounts = [
    {
      email: 'sandbox.admin@dir3com.test',
      password: buildPassword(),
      full_name: 'Sandbox Admin',
      role: 'admin',
      reference_code: reference('USER-ADMIN-001'),
    },
    {
      email: 'sandbox.staff@dir3com.test',
      password: buildPassword(),
      full_name: 'Sandbox Staff',
      role: 'staff',
      reference_code: reference('USER-STAFF-001'),
    },
    {
      email: 'sandbox.customer@dir3com.test',
      password: buildPassword(),
      full_name: 'Sandbox Customer',
      role: 'customer',
      reference_code: reference('USER-CUSTOMER-001'),
    },
  ];

  for (const account of accounts) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: account.email,
      password: account.password,
      email_confirm: true,
    });

    if (error && !/already registered|already exists/i.test(error.message)) {
      throw new Error(`[auth.admin.createUser] ${error.message}`);
    }

    const userId = data?.user?.id;
    if (!userId) {
      // Existing user path: resolve by listing users page-wise is expensive; skip profile upsert safely.
      continue;
    }

    await upsert(
      'profiles',
      [
        {
          id: userId,
          full_name: account.full_name,
          email: account.email,
          role: account.role,
          status: 'active',
        },
      ],
      'id',
    );
  }
}

async function insert(table, rows) {
  if (!rows.length) return;
  const { error } = await supabase.from(table).insert(rows);
  if (error) {
    if (/Could not find the table|relation .* does not exist/i.test(error.message)) {
      return;
    }
    throw new Error(`[${table}] ${error.message}`);
  }
}

async function removeSyntheticRows() {
  const filters = (query) => query.eq('synthetic', true).eq('environment', TARGET_ENV);

  const deleteFrom = async (table) => {
    const { error } = await filters(supabase.from(table).delete()).not('id', 'is', null);
    if (error && !/column .* does not exist|Could not find the table|relation .* does not exist/i.test(error.message)) {
      throw new Error(`[${table}] ${error.message}`);
    }
  };

  await deleteFrom('payment_transactions');
  await deleteFrom('booking_status_history');
  await deleteFrom('bookings');
  await deleteFrom('product_availability');
  await deleteFrom('product_features');
  await deleteFrom('product_prices');
  await deleteFrom('product_images');
  await deleteFrom('products');
  await deleteFrom('partner_coverage');
  await deleteFrom('partner_services');
  await deleteFrom('partners');
  await deleteFrom('product_categories');
}

function buildCategories() {
  return [
    ['cars', 'سيارات', 'Cars'],
    ['hotels', 'فنادق', 'Hotels'],
    ['apartments', 'شقق', 'Apartments'],
    ['villas', 'فلل', 'Villas'],
    ['chalets', 'شاليهات', 'Chalets'],
    ['concierge', 'كونسيرج', 'Concierge'],
    ['vip', 'خدمات VIP', 'VIP Services'],
    ['addons', 'إضافات', 'Add-ons'],
  ].map(([slug, ar, en], index) => ({
    slug: `sandbox-${slug}`,
    name_ar: ar,
    name_en: en,
    description_ar: `بيانات تجريبية ${ar}`,
    description_en: `Synthetic ${en} dataset`,
    synthetic: true,
    environment: TARGET_ENV,
    reference_code: reference(`CAT-${String(index + 1).padStart(3, '0')}`),
  }));
}

async function getCategoryMap() {
  const { data, error } = await supabase
    .from('product_categories')
    .select('id, slug')
    .eq('synthetic', true)
    .eq('environment', TARGET_ENV)
    .like('slug', 'sandbox-%');

  if (error) throw new Error(`[product_categories] ${error.message}`);

  const map = new Map();
  for (const row of data || []) {
    map.set(row.slug, row.id);
  }
  return map;
}

function buildPartners() {
  const partners = [
    ['Nile Drive Labs', 'nile-drive-labs', 'Cairo', 'Egypt', 'Nour Salem'],
    ['Pyramids Mobility Hub', 'pyramids-mobility-hub', 'Giza', 'Egypt', 'Karim Helmy'],
    ['Alex Coast Transfer Co', 'alex-coast-transfer', 'Alexandria', 'Egypt', 'Mona Adel'],
    ['Red Sea Concierge Ops', 'red-sea-concierge', 'Hurghada', 'Egypt', 'Omar Fathy'],
    ['Sinai Experience Desk', 'sinai-experience-desk', 'Sharm El Sheikh', 'Egypt', 'Lina Ramzi'],
    ['Luxor Heritage Mobility', 'luxor-heritage-mobility', 'Luxor', 'Egypt', 'Hesham Aziz'],
    ['Aswan Riverline Services', 'aswan-riverline', 'Aswan', 'Egypt', 'Yara Nabil'],
    ['Riyadh Route Sentinel', 'riyadh-route-sentinel', 'Riyadh', 'Saudi Arabia', 'Salman Tariq'],
    ['Jeddah Transfer Matrix', 'jeddah-transfer-matrix', 'Jeddah', 'Saudi Arabia', 'Abeer Waleed'],
    ['Makkah Pilgrim Connect', 'makkah-pilgrim-connect', 'Makkah', 'Saudi Arabia', 'Fahad Mosa'],
  ];

  return partners.map(([name, slug, city, country, contact], index) => ({
    name,
    company_name: name,
    contact_person: contact,
    email: `sandbox.${slug}@dir3com.test`,
    phone: `+2010${String(index + 1).padStart(8, '0')}`,
    slug: `sandbox-${slug}`,
    website_url: `https://example.com/${slug}`,
    description_ar: `مزود تجريبي ${name}`,
    description_en: `Synthetic provider ${name}`,
    status: 'active',
    shield_level: index % 4 === 0 ? 'gold' : index % 4 === 1 ? 'silver' : index % 4 === 2 ? 'platinum' : 'basic',
    commercial_registration: `TEST-CR-${String(index + 1).padStart(4, '0')}`,
    tax_number: `TEST-TAX-${String(index + 1).padStart(4, '0')}`,
    iban: `TEST-IBAN-${String(index + 1).padStart(4, '0')}`,
    synthetic: true,
    environment: TARGET_ENV,
    reference_code: reference(`PARTNER-${String(index + 1).padStart(3, '0')}`),
    city,
    country,
  }));
}

async function getPartnerMap() {
  const { data, error } = await supabase
    .from('partners')
    .select('id, slug')
    .eq('synthetic', true)
    .eq('environment', TARGET_ENV)
    .like('slug', 'sandbox-%');

  if (error) throw new Error(`[partners] ${error.message}`);

  const map = new Map();
  for (const row of data || []) {
    map.set(row.slug, row.id);
  }
  return map;
}

function buildProducts(categoryMap) {
  const egyptCities = ['Cairo', 'Giza', 'Alexandria', 'Hurghada', 'Sharm El Sheikh', 'Luxor', 'Aswan', 'Marsa Alam', 'New Alamein'];
  const saudiCases = ['Riyadh', 'Jeddah', 'Makkah', 'Madinah'];

  const products = [];

  for (let i = 1; i <= 30; i += 1) {
    const inSaudiCase = i % 8 === 0;
    const city = inSaudiCase ? saudiCases[(i / 8) % saudiCases.length | 0] : egyptCities[i % egyptCities.length];
    products.push({
      slug: `sandbox-drive-${String(i).padStart(2, '0')}`,
      name_ar: `مركبة درايف ${String(i).padStart(2, '0')}`,
      name_en: `Drive Vehicle ${String(i).padStart(2, '0')}`,
      description_ar: `مركبة اصطناعية للاختبار في ${city}`,
      description_en: `Synthetic drive inventory in ${city}`,
      category_id: categoryMap.get('sandbox-cars') || null,
      city,
      country: inSaudiCase ? 'Saudi Arabia' : 'Egypt',
      base_price: 1200 + i * 35,
      currency: i % 5 === 0 ? 'SAR' : 'EGP',
      status: 'sandbox',
      featured: i % 4 === 0,
      verified: true,
      shield_certified: i % 3 !== 0,
      synthetic: true,
      environment: TARGET_ENV,
      reference_code: reference(`DRIVE-${String(i).padStart(3, '0')}`),
      taxes_percent: inSaudiCase ? 15 : 14,
      insurance_amount: 150 + i,
      deposit_amount: 400 + i * 3,
      addons_amount: 90 + i * 2,
      max_guests: 4 + (i % 4),
    });
  }

  const stayConfigs = [
    { kind: 'hotel', count: 6, category: 'sandbox-hotels', base: 2200 },
    { kind: 'apartment', count: 8, category: 'sandbox-apartments', base: 1700 },
    { kind: 'villa', count: 5, category: 'sandbox-villas', base: 3100 },
    { kind: 'chalet', count: 5, category: 'sandbox-chalets', base: 2800 },
  ];

  let stayIndex = 1;
  for (const config of stayConfigs) {
    for (let i = 1; i <= config.count; i += 1) {
      const city = egyptCities[(stayIndex + i) % egyptCities.length];
      products.push({
        slug: `sandbox-stay-${config.kind}-${String(stayIndex).padStart(2, '0')}`,
        name_ar: `وحدة ${config.kind} ${String(stayIndex).padStart(2, '0')}`,
        name_en: `Stay ${config.kind} ${String(stayIndex).padStart(2, '0')}`,
        description_ar: `وحدة إقامة اصطناعية (${config.kind}) للاختبار في ${city}`,
        description_en: `Synthetic stay unit (${config.kind}) in ${city}`,
        category_id: categoryMap.get(config.category) || categoryMap.get('sandbox-apartments') || null,
        city,
        country: 'Egypt',
        base_price: config.base + i * 55,
        currency: i % 3 === 0 ? 'USD' : 'EGP',
        status: 'sandbox',
        featured: i === 1,
        verified: true,
        shield_certified: true,
        synthetic: true,
        environment: TARGET_ENV,
        reference_code: reference(`STAY-${String(stayIndex).padStart(3, '0')}`),
        taxes_percent: 14,
        insurance_amount: 220 + i * 2,
        deposit_amount: 900 + i * 20,
        addons_amount: 180 + i * 8,
        max_guests: config.kind === 'villa' || config.kind === 'chalet' ? 8 : 5,
      });
      stayIndex += 1;
    }
  }

  const extras = [
    ['concierge', 'تنسيق تنقل VIP', 'VIP Mobility Concierge', 850, 'EGP'],
    ['concierge', 'مساعد حجوزات مطاعم', 'Restaurant Booking Concierge', 420, 'EGP'],
    ['concierge', 'دعم 24 ساعة', '24/7 Personal Assistance', 510, 'SAR'],
    ['vip', 'مسار سريع بالمطار', 'Airport Fast Track', 780, 'SAR'],
    ['vip', 'استقبال شخصي فاخر', 'Premium Meet and Greet', 980, 'USD'],
    ['addons', 'شريحة بيانات سفر', 'Travel Data SIM', 95, 'EGP'],
    ['addons', 'تأمين رحلة موسع', 'Extended Trip Insurance', 210, 'USD'],
    ['addons', 'تسجيل دخول مبكر', 'Early Check-in Add-on', 160, 'EGP'],
  ];

  extras.forEach(([kind, nameAr, nameEn, price, currency], idx) => {
    const city = egyptCities[idx % egyptCities.length];
    products.push({
      slug: `sandbox-addon-${slugify(String(nameEn))}`,
      name_ar: String(nameAr),
      name_en: String(nameEn),
      description_ar: `خدمة إضافية اصطناعية للاختبار`,
      description_en: `Synthetic add-on service for testing`,
      category_id: categoryMap.get(`sandbox-${kind}`) || null,
      city,
      country: 'Egypt',
      base_price: Number(price),
      currency: String(currency),
      status: 'sandbox',
      featured: idx < 3,
      verified: true,
      shield_certified: true,
      synthetic: true,
      environment: TARGET_ENV,
      reference_code: reference(`ADDON-${String(idx + 1).padStart(3, '0')}`),
      taxes_percent: 14,
      insurance_amount: 0,
      deposit_amount: 0,
      addons_amount: 0,
      max_guests: 1,
    });
  });

  return products;
}

async function getProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('id, slug, base_price, currency, city, country, taxes_percent, insurance_amount, deposit_amount, addons_amount, max_guests')
    .eq('synthetic', true)
    .eq('environment', TARGET_ENV)
    .like('slug', 'sandbox-%');

  if (error) throw new Error(`[products] ${error.message}`);
  return data || [];
}

function buildImages(products) {
  const rows = [];
  for (const product of products) {
    for (let i = 1; i <= 3; i += 1) {
      rows.push({
        product_id: product.id,
        image_url: `https://picsum.photos/seed/${encodeURIComponent(product.slug)}-${i}/1280/860`,
        caption: `Synthetic image ${i} for ${product.slug}`,
        sort_order: i,
        is_primary: i === 1,
        synthetic: true,
        environment: TARGET_ENV,
        reference_code: reference(`IMG-${product.slug.toUpperCase()}-${i}`),
      });
    }
  }
  return rows;
}

function buildFeatures(products) {
  return products.flatMap((product, idx) => [
    {
      product_id: product.id,
      feature_text_ar: 'بيانات اصطناعية للاختبار فقط',
      feature_text_en: 'Synthetic inventory for local and staging only',
      synthetic: true,
      environment: TARGET_ENV,
      reference_code: reference(`FEAT-${idx + 1}-A`),
    },
    {
      product_id: product.id,
      feature_text_ar: `مدينة التشغيل: ${product.city}`,
      feature_text_en: `Routing city: ${product.city}`,
      synthetic: true,
      environment: TARGET_ENV,
      reference_code: reference(`FEAT-${idx + 1}-B`),
    },
  ]);
}

function buildPriceRules(products) {
  const today = new Date();
  const rows = [];

  for (const product of products) {
    const base = Number(product.base_price || 0);
    const currency = product.currency || 'EGP';

    rows.push({
      product_id: product.id,
      price: base,
      currency,
      valid_from: dateOnly(today),
      valid_to: dateOnly(dayOffset(today, 89)),
      rule_name: 'standard',
      synthetic: true,
      environment: TARGET_ENV,
      reference_code: reference(`PRICE-${product.slug}-STD`),
      is_weekend: false,
      is_seasonal: false,
      discount_percent: 0,
      taxes_percent: Number(product.taxes_percent || 0),
      insurance_amount: Number(product.insurance_amount || 0),
      deposit_amount: Number(product.deposit_amount || 0),
      addons_amount: Number(product.addons_amount || 0),
    });

    rows.push({
      product_id: product.id,
      price: Math.round(base * 1.12 * 100) / 100,
      currency,
      valid_from: dateOnly(today),
      valid_to: dateOnly(dayOffset(today, 89)),
      rule_name: 'weekend',
      synthetic: true,
      environment: TARGET_ENV,
      reference_code: reference(`PRICE-${product.slug}-WEEKEND`),
      is_weekend: true,
      is_seasonal: false,
      discount_percent: 0,
      taxes_percent: Number(product.taxes_percent || 0),
      insurance_amount: Number(product.insurance_amount || 0),
      deposit_amount: Number(product.deposit_amount || 0),
      addons_amount: Number(product.addons_amount || 0),
    });

    rows.push({
      product_id: product.id,
      price: Math.round(base * 1.26 * 100) / 100,
      currency,
      valid_from: dateOnly(dayOffset(today, 28)),
      valid_to: dateOnly(dayOffset(today, 60)),
      rule_name: 'season-peak',
      synthetic: true,
      environment: TARGET_ENV,
      reference_code: reference(`PRICE-${product.slug}-SEASON`),
      is_weekend: false,
      is_seasonal: true,
      discount_percent: 0,
      taxes_percent: Number(product.taxes_percent || 0),
      insurance_amount: Number(product.insurance_amount || 0),
      deposit_amount: Number(product.deposit_amount || 0),
      addons_amount: Number(product.addons_amount || 0),
    });

    rows.push({
      product_id: product.id,
      price: Math.round(base * 0.92 * 100) / 100,
      currency,
      valid_from: dateOnly(dayOffset(today, 61)),
      valid_to: dateOnly(dayOffset(today, 89)),
      rule_name: 'discount',
      synthetic: true,
      environment: TARGET_ENV,
      reference_code: reference(`PRICE-${product.slug}-DISCOUNT`),
      is_weekend: false,
      is_seasonal: false,
      discount_percent: 8,
      taxes_percent: Number(product.taxes_percent || 0),
      insurance_amount: Number(product.insurance_amount || 0),
      deposit_amount: Number(product.deposit_amount || 0),
      addons_amount: Number(product.addons_amount || 0),
    });
  }

  return rows;
}

function availabilityState(index, day) {
  const key = (index + day) % 20;
  if (key === 0 || key === 1) return 'blackout';
  if (key === 2 || key === 3) return 'maintenance';
  if (key >= 4 && key <= 6) return 'full';
  if (key >= 7 && key <= 10) return 'partially_booked';
  return 'available';
}

function buildAvailability(products) {
  const today = new Date();
  const rows = [];

  products.forEach((product, index) => {
    const base = Number(product.base_price || 0);
    const currency = product.currency || 'EGP';

    for (let d = 0; d < 90; d += 1) {
      const date = dayOffset(today, d);
      const state = availabilityState(index, d);
      const isWeekend = date.getUTCDay() === 5 || date.getUTCDay() === 6;
      const inSeason = d >= 28 && d <= 60;
      const discount = d >= 61 && d <= 89 ? 8 : 0;

      const normalPrice = base;
      const weekendPrice = Math.round(base * 1.12 * 100) / 100;
      const seasonalPrice = Math.round(base * 1.26 * 100) / 100;
      const gross = inSeason ? seasonalPrice : isWeekend ? weekendPrice : normalPrice;
      const discounted = Math.round(gross * (1 - discount / 100) * 100) / 100;

      const capacity = Math.max(1, Number(product.max_guests || 4));
      const bookedCount =
        state === 'available' ? 0 :
          state === 'partially_booked' ? Math.max(1, Math.floor(capacity * 0.5)) :
            state === 'full' ? capacity :
              0;

      rows.push({
        product_id: product.id,
        city: product.city || 'Cairo',
        partner_id: null,
        available: state === 'available' || state === 'partially_booked',
        date: dateOnly(date),
        availability_status: state,
        capacity,
        booked_count: bookedCount,
        price: discounted,
        currency,
        weekend_price: weekendPrice,
        seasonal_price: seasonalPrice,
        discount_percent: discount,
        taxes_percent: Number(product.taxes_percent || 0),
        insurance_amount: Number(product.insurance_amount || 0),
        deposit_amount: Number(product.deposit_amount || 0),
        addons_amount: Number(product.addons_amount || 0),
        notes: `Synthetic availability ${state}`,
        synthetic: true,
        environment: TARGET_ENV,
        reference_code: reference(`AVL-${product.slug}-${d + 1}`),
      });
    }
  });

  return rows;
}

function bookingBase(product, code, overrides = {}) {
  const now = new Date();
  const arrival = dayOffset(now, 7);
  const departure = dayOffset(now, 10);
  const amount = Number(product.base_price || 1000) * 3;

  return {
    user_id: null,
    product_id: product.id,
    product_name: product.name_en || product.slug,
    product_price: Number(product.base_price || 0),
    guest_name: 'Sandbox Guest',
    guest_phone: '+201000000000',
    guest_email: 'sandbox.guest@dir3com.test',
    arrival_date: dateOnly(arrival),
    departure_date: dateOnly(departure),
    guests: 2,
    city: product.city || 'Cairo',
    status: 'pending',
    payment_status: 'pending',
    currency: product.currency || 'EGP',
    total_amount: amount,
    total_price: amount,
    notes: 'Synthetic booking scenario',
    synthetic: true,
    environment: TARGET_ENV,
    reference_code: reference(`BOOK-${code}`),
    booking_reference: reference(`BOOKREF-${code}`),
    scenario_code: code,
    source_channel: 'dabra-sandbox',
    escalated_to_staff: false,
    escalation_reason: null,
    ...overrides,
  };
}

function buildBookings(products) {
  const safe = products.slice(0, 12);
  if (safe.length < 12) {
    throw new Error('Not enough synthetic products to create booking scenarios.');
  }

  const created = [];

  created.push(bookingBase(safe[0], 'NEW', { status: 'pending', payment_status: 'pending' }));
  created.push(bookingBase(safe[1], 'CONFIRMED', { status: 'confirmed', payment_status: 'paid' }));
  created.push(bookingBase(safe[2], 'CANCELLED', { status: 'cancelled', payment_status: 'refunded' }));
  created.push(bookingBase(safe[3], 'COMPLETED', { status: 'completed', payment_status: 'paid' }));
  created.push(bookingBase(safe[4], 'PAYMENT-FAILED', { status: 'failed', payment_status: 'failed', failure_reason: 'card_declined' }));

  const baseReschedule = bookingBase(safe[5], 'RESCHEDULE-BASE', { status: 'confirmed', payment_status: 'paid' });
  const followReschedule = bookingBase(safe[5], 'RESCHEDULE-UPDATED', {
    status: 'confirmed',
    payment_status: 'paid',
    rescheduled_from_booking_id: null,
    notes: 'Rescheduled synthetic booking',
  });

  created.push(baseReschedule);
  created.push(followReschedule);

  created.push(bookingBase(safe[6], 'AVAIL-CONFLICT', {
    status: 'failed',
    payment_status: 'voided',
    failure_reason: 'availability_conflict',
  }));

  const original = bookingBase(safe[7], 'DUPLICATE-ORIGINAL', { status: 'confirmed', payment_status: 'paid' });
  const duplicate = bookingBase(safe[7], 'DUPLICATE-REQUEST', {
    status: 'failed',
    payment_status: 'voided',
    failure_reason: 'duplicate_request',
    duplicate_of_booking_id: null,
  });
  created.push(original);
  created.push(duplicate);

  created.push(bookingBase(safe[8], 'MULTI-CURRENCY-USD', {
    currency: 'USD',
    total_amount: Number(safe[8].base_price || 1000) * 2,
    total_price: Number(safe[8].base_price || 1000) * 2,
    city: 'Cairo',
  }));

  created.push(bookingBase(safe[9], 'MULTI-COUNTRY-SA', {
    currency: 'SAR',
    city: 'Riyadh',
    notes: 'Saudi routing validation',
  }));

  created.push(bookingBase(safe[10], 'ESCALATED', {
    status: 'confirmed',
    payment_status: 'paid',
    escalated_to_staff: true,
    escalation_reason: 'vip_customization_required',
  }));

  return created;
}

async function createSyntheticDataset() {
  console.log(`[sandbox] Seeding synthetic dataset for ${TARGET_ENV} ...`);

  await ensureSandboxAccounts();

  const categories = buildCategories();
  await upsert('product_categories', categories, 'slug');

  const categoryMap = await getCategoryMap();
  const partners = buildPartners();
  await upsert('partners', partners, 'slug');

  const partnerMap = await getPartnerMap();
  const partnerServicesRows = [];
  const partnerCoverageRows = [];
  const serviceTypes = ['DIR3 Drive', 'DIR3 Stay', 'DIR3 Concierge', 'DIR3 VIP'];

  for (const [slug, partnerId] of partnerMap.entries()) {
    const idx = partnerServicesRows.length + 1;
    partnerServicesRows.push({
      partner_id: partnerId,
      service_type: serviceTypes[idx % serviceTypes.length],
      synthetic: true,
      environment: TARGET_ENV,
      reference_code: reference(`PS-${slug.toUpperCase()}`),
    });

    partnerCoverageRows.push({
      partner_id: partnerId,
      country: slug.includes('riyadh') || slug.includes('jeddah') || slug.includes('makkah') ? 'Saudi Arabia' : 'Egypt',
      city: slug.includes('riyadh') ? 'Riyadh' : slug.includes('jeddah') ? 'Jeddah' : slug.includes('makkah') ? 'Makkah' : 'Cairo',
      synthetic: true,
      environment: TARGET_ENV,
      reference_code: reference(`PC-${slug.toUpperCase()}`),
    });
  }

  await removeTableSlice('partner_services');
  await removeTableSlice('partner_coverage');
  await insert('partner_services', partnerServicesRows);
  await insert('partner_coverage', partnerCoverageRows);

  const products = buildProducts(categoryMap);
  await upsert('products', products, 'slug');

  const syntheticProducts = await getProducts();

  await removeTableSlice('product_images');
  await removeTableSlice('product_features');
  await removeTableSlice('product_prices');
  await removeTableSlice('product_availability');

  await insert('product_images', buildImages(syntheticProducts));
  await insert('product_features', buildFeatures(syntheticProducts));
  await insert('product_prices', buildPriceRules(syntheticProducts));

  const availabilityRows = buildAvailability(syntheticProducts);
  await insertChunked('product_availability', availabilityRows, 1000);

  await removeTableSlice('bookings');

  const seedBookings = buildBookings(syntheticProducts);
  const { data: bookingData, error: bookingInsertError } = await supabase
    .from('bookings')
    .insert(seedBookings)
    .select('id, reference_code');

  if (bookingInsertError) {
    throw new Error(`[bookings] ${bookingInsertError.message}`);
  }

  const byRef = new Map((bookingData || []).map((row) => [row.reference_code, row.id]));
  const updates = [];

  const rescheduleBaseId = byRef.get(reference('BOOK-RESCHEDULE-BASE'));
  const rescheduleUpdatedId = byRef.get(reference('BOOK-RESCHEDULE-UPDATED'));
  if (rescheduleBaseId && rescheduleUpdatedId) {
    updates.push({ id: rescheduleUpdatedId, rescheduled_from_booking_id: rescheduleBaseId });
  }

  const originalId = byRef.get(reference('BOOK-DUPLICATE-ORIGINAL'));
  const duplicateId = byRef.get(reference('BOOK-DUPLICATE-REQUEST'));
  if (originalId && duplicateId) {
    updates.push({ id: duplicateId, duplicate_of_booking_id: originalId });
  }

  for (const row of updates) {
    const { error } = await supabase.from('bookings').update(row).eq('id', row.id);
    if (error) {
      throw new Error(`[bookings.update] ${error.message}`);
    }
  }

  const statusRows = (bookingData || []).map((row) => ({
    booking_id: row.id,
    status: 'seeded',
    changed_by: null,
    notes: 'Synthetic scenario seeded',
    synthetic: true,
    environment: TARGET_ENV,
    reference_code: row.reference_code,
  }));

  await insert('booking_status_history', statusRows);

  const paymentRows = (bookingData || []).map((row, idx) => ({
    booking_id: row.id,
    customer_id: null,
    amount: 1000 + idx * 120,
    currency: idx % 2 === 0 ? 'EGP' : 'USD',
    provider: 'sandbox-gateway',
    status: idx % 5 === 0 ? 'failed' : 'completed',
    metadata: { synthetic: true, flow: 'sandbox-eval' },
    synthetic: true,
    environment: TARGET_ENV,
    reference_code: row.reference_code,
  }));

  await insert('payment_transactions', paymentRows);

  console.log(`[sandbox] Seed complete: ${syntheticProducts.length} products, ${availabilityRows.length} availability rows, ${seedBookings.length} bookings.`);
}

async function removeTableSlice(table) {
  const { error } = await supabase
    .from(table)
    .delete()
    .eq('synthetic', true)
    .eq('environment', TARGET_ENV)
    .not('id', 'is', null);

  if (error && !/column .* does not exist|Could not find the table|relation .* does not exist/i.test(error.message)) {
    throw new Error(`[${table}] ${error.message}`);
  }
}

async function insertChunked(table, rows, chunkSize) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    await insert(table, chunk);
  }
}

async function resetSandbox() {
  console.log('[sandbox] Reset start...');
  await purgeSynthetic();
  await createSyntheticDataset();
  console.log('[sandbox] Reset complete.');
}

async function purgeSynthetic() {
  console.log(`[sandbox] Purging synthetic rows for ${TARGET_ENV} ...`);
  await removeSyntheticRows();
  console.log('[sandbox] Purge complete.');
}

async function main() {
  if (command === 'seed') {
    await createSyntheticDataset();
    return;
  }

  if (command === 'purge') {
    await purgeSynthetic();
    return;
  }

  if (command === 'reset') {
    await resetSandbox();
    return;
  }

  fail('Usage: node scripts/sandbox/synthetic-dataset.mjs <seed|purge|reset>');
}

main().catch((error) => {
  console.error(`[sandbox] ${error.message}`);
  process.exitCode = 1;
});
