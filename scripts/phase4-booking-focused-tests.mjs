import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const workspaceRoot = process.cwd();
const envPath = path.join(workspaceRoot, '.env.local');
const baseUrl = process.env.PHASE4_BASE_URL || 'http://localhost:3002';

function loadEnvFromFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing env file at ${filePath}`);
  }

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
      continue;
    }

    const [key, ...rest] = trimmed.split('=');
    const rawValue = rest.join('=').trim();
    const value = rawValue.startsWith('"') && rawValue.endsWith('"') ? rawValue.slice(1, -1) : rawValue;
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function toDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return toDateOnly(d);
}

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

async function postBooking(payload, accessToken) {
  const headers = { 'Content-Type': 'application/json' };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${baseUrl}/api/bookings`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

async function postBookingRaw(bodyText, accessToken) {
  const headers = { 'Content-Type': 'application/json' };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${baseUrl}/api/bookings`, {
    method: 'POST',
    headers,
    body: bodyText,
  });

  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

async function getQuote(params, accessToken) {
  const query = new URLSearchParams({ action: 'quote', ...params });
  const headers = {};
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${baseUrl}/api/bookings?${query.toString()}`, {
    method: 'GET',
    headers,
  });

  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

async function main() {
  loadEnvFromFile(envPath);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey || !serviceKey) {
    throw new Error('Missing Supabase env vars required for focused runtime tests.');
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const client = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const now = Date.now();
  const email = `phase4.runtime.${now}@dir3com.local`;
  const password = `Dir3com#${now}`;

  const arrival = addDays(20);
  const departure = addDays(23);
  const expiredTo = addDays(10);
  const validFromA = addDays(-30);
  const validFromB = addDays(-10);
  const validToB = addDays(60);
  const futureFrom = addDays(40);

  let qaUserId = null;
  let qaProductId = null;
  let qaInactiveProductId = null;
  let bookingReference = null;
  let runtimeBookingsCreated = 0;
  let invalidBookingsPersisted = 0;
  const cleanupCounts = {
    bookings: 0,
    productPrices: 0,
    products: 0,
    profiles: 0,
    users: 0,
  };

  const results = [];

  function test(name, condition, details = '') {
    results.push({ name, pass: Boolean(condition), details });
    if (!condition) {
      throw new Error(`Test failed: ${name}${details ? ` (${details})` : ''}`);
    }
  }

  try {
    const userCreate = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'Phase4 Focused QA' },
    });
    if (userCreate.error || !userCreate.data?.user?.id) {
      throw new Error(`Unable to create test auth user: ${userCreate.error?.message || 'unknown'}`);
    }
    qaUserId = userCreate.data.user.id;

    const profileUpsert = await admin
      .from('profiles')
      .upsert({
        id: qaUserId,
        full_name: 'Phase4 Focused QA',
        email,
        role: 'customer',
        status: 'active',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

    if (profileUpsert.error) {
      // Some environments block profile writes; booking route auth still works with Supabase user identity.
    }

    const signIn = await client.auth.signInWithPassword({ email, password });
    if (signIn.error || !signIn.data?.session?.access_token) {
      throw new Error(`Unable to sign in test user: ${signIn.error?.message || 'no token'}`);
    }
    const accessToken = signIn.data.session.access_token;

    const productSlug = `qa-phase4-${now}`;
    const productInsert = await admin
      .from('products')
      .insert({
        name_ar: 'منتج Phase4 QA',
        name_en: 'Phase4 QA Product',
        slug: productSlug,
        status: 'active',
        base_price: 150,
        currency: 'SAR',
      })
      .select('*')
      .single();

    if (productInsert.error || !productInsert.data?.id) {
      throw new Error(`Unable to create test product: ${productInsert.error?.message || 'unknown'}`);
    }
    qaProductId = productInsert.data.id;

    const inactiveProductInsert = await admin
      .from('products')
      .insert({
        name_ar: 'منتج غير نشط Phase4 QA',
        name_en: 'Phase4 QA Inactive Product',
        slug: `${productSlug}-inactive`,
        status: 'inactive',
        base_price: 320,
        currency: 'SAR',
      })
      .select('*')
      .single();

    if (inactiveProductInsert.error || !inactiveProductInsert.data?.id) {
      throw new Error(`Unable to create inactive test product: ${inactiveProductInsert.error?.message || 'unknown'}`);
    }
    qaInactiveProductId = inactiveProductInsert.data.id;

    const bulkCompetingRows = Array.from({ length: 520 }, (_, index) => ({
      product_id: qaProductId,
      price: 180 + (index % 20),
      currency: 'SAR',
      valid_from: validFromA,
      valid_to: null,
      rule_name: `bulk_${index}`,
    }));

    const decisiveWinnerPrice = 777;
    const seededRows = [
      ...bulkCompetingRows,
      { product_id: qaProductId, price: 999, currency: 'SAR', valid_from: addDays(-60), valid_to: expiredTo, rule_name: 'expired_high' },
      { product_id: qaProductId, price: 400, currency: 'SAR', valid_from: futureFrom, valid_to: null, rule_name: 'future' },
      { product_id: qaProductId, price: 200, currency: 'SAR', valid_from: validFromA, valid_to: null, rule_name: 'eligible_old' },
      { product_id: qaProductId, price: 210, currency: 'SAR', valid_from: validFromA, valid_to: null, rule_name: 'eligible_same_from_newer' },
      // This row is intentionally appended after the first 500+ competing rows.
      { product_id: qaProductId, price: decisiveWinnerPrice, currency: 'SAR', valid_from: validFromB, valid_to: validToB, rule_name: 'eligible_latest_from_after_500' },
    ];

    const pricesInsert = await admin
      .from('product_prices')
      .insert(seededRows);

    if (pricesInsert.error) {
      throw new Error(`Unable to seed product_prices: ${pricesInsert.error.message}`);
    }

    const validQuote = await getQuote({ product_id: qaProductId, arrival_date: arrival, departure_date: departure, guests: '2' }, accessToken);
    test('1. Valid real calendar date accepted', validQuote.status === 200, `status=${validQuote.status}`);

    const invalidDateQuote = await getQuote({ product_id: qaProductId, arrival_date: '2026-02-31', departure_date: departure, guests: '2' }, accessToken);
    test('2. 2026-02-31 rejected', invalidDateQuote.status === 400, `status=${invalidDateQuote.status}`);

    const fractionalGuests = await getQuote({ product_id: qaProductId, arrival_date: arrival, departure_date: departure, guests: '1.4' }, accessToken);
    test('3. Fractional guests rejected', fractionalGuests.status === 400, `status=${fractionalGuests.status}`);

    const zeroGuests = await getQuote({ product_id: qaProductId, arrival_date: arrival, departure_date: departure, guests: '0' }, accessToken);
    const negativeGuests = await getQuote({ product_id: qaProductId, arrival_date: arrival, departure_date: departure, guests: '-1' }, accessToken);
    test('4. Zero/negative guests rejected', zeroGuests.status === 400 && negativeGuests.status === 400, `zero=${zeroGuests.status} neg=${negativeGuests.status}`);

    test('5. Valid UUID passes validation', validQuote.status === 200);

    const hyphenUuid = await getQuote({ product_id: '------------------------------------', arrival_date: arrival, departure_date: departure, guests: '2' }, accessToken);
    test('6. 36 hyphens rejected before DB access', hyphenUuid.status === 400, `status=${hyphenUuid.status}`);

    const malformedUuid = await getQuote({ product_id: 'bad-uuid', arrival_date: arrival, departure_date: departure, guests: '2' }, accessToken);
    test('7. Malformed UUID controlled 4xx', malformedUuid.status >= 400 && malformedUuid.status < 500, `status=${malformedUuid.status}`);

    const quoteData = validQuote.body?.data;
    test('8. Current effective product price selected', Number(quoteData?.unitPrice) === decisiveWinnerPrice, `unit=${quoteData?.unitPrice}`);
    test('9. Expired price ignored', Number(quoteData?.unitPrice) !== 999, `unit=${quoteData?.unitPrice}`);
    test('10. Future price ignored', Number(quoteData?.unitPrice) !== 400, `unit=${quoteData?.unitPrice}`);
    test('11. Multiple eligible price records deterministic', Number(quoteData?.unitPrice) === decisiveWinnerPrice, `unit=${quoteData?.unitPrice}`);
    test('16. >500 competing prices boundary honored', seededRows.length > 500 && Number(quoteData?.unitPrice) === decisiveWinnerPrice, `seeded=${seededRows.length} unit=${quoteData?.unitPrice}`);

    const tamperPayload = {
      product_id: qaProductId,
      guest_name: 'Tamper Test',
      guest_phone: '0500000000',
      arrival_date: arrival,
      departure_date: departure,
      guests: 2,
      city: 'Riyadh',
      product_price: 1,
      total_price: 1,
      total_amount: 1,
      currency: 'USD',
    };
    const tamperResponse = await postBooking(tamperPayload, accessToken);
    test('14. Client attempt to send price fields rejected', tamperResponse.status === 400, `status=${tamperResponse.status}`);

    const postMalformedProductIdPayload = {
      product_id: 'bad-uuid',
      guest_name: 'Product Validation QA',
      guest_phone: '0500000010',
      guest_email: email,
      arrival_date: arrival,
      departure_date: departure,
      guests: 2,
      city: 'Riyadh',
    };
    const postMalformedProductIdResponse = await postBooking(postMalformedProductIdPayload, accessToken);
    test('POST rejects malformed product identifier', postMalformedProductIdResponse.status === 400, `status=${postMalformedProductIdResponse.status}`);

    const postNonexistentProductPayload = {
      product_id: randomUUID(),
      guest_name: 'Product Validation QA',
      guest_phone: '0500000011',
      guest_email: email,
      arrival_date: arrival,
      departure_date: departure,
      guests: 2,
      city: 'Riyadh',
    };
    const postNonexistentProductResponse = await postBooking(postNonexistentProductPayload, accessToken);
    test('POST rejects nonexistent product', postNonexistentProductResponse.status === 404, `status=${postNonexistentProductResponse.status}`);

    const postInactiveProductPayload = {
      product_id: qaInactiveProductId,
      guest_name: 'Product Validation QA',
      guest_phone: '0500000012',
      guest_email: email,
      arrival_date: arrival,
      departure_date: departure,
      guests: 2,
      city: 'Riyadh',
    };
    const postInactiveProductResponse = await postBooking(postInactiveProductPayload, accessToken);
    test('POST rejects inactive product', postInactiveProductResponse.status === 400, `status=${postInactiveProductResponse.status}`);

    const postMalformedDatePayload = {
      product_id: qaProductId,
      guest_name: 'Date Validation QA',
      guest_phone: '0500000013',
      guest_email: email,
      arrival_date: '2026-02-31',
      departure_date: departure,
      guests: 2,
      city: 'Riyadh',
    };
    const postMalformedDateResponse = await postBooking(postMalformedDatePayload, accessToken);
    test('POST rejects malformed arrival date', postMalformedDateResponse.status === 400, `status=${postMalformedDateResponse.status}`);

    const postMalformedDeparturePayload = {
      product_id: qaProductId,
      guest_name: 'Date Validation QA',
      guest_phone: '0500000014',
      guest_email: email,
      arrival_date: arrival,
      departure_date: 'not-a-date',
      guests: 2,
      city: 'Riyadh',
    };
    const postMalformedDepartureResponse = await postBooking(postMalformedDeparturePayload, accessToken);
    test('POST rejects malformed departure date', postMalformedDepartureResponse.status === 400, `status=${postMalformedDepartureResponse.status}`);

    const postInvalidRangePayload = {
      product_id: qaProductId,
      guest_name: 'Date Validation QA',
      guest_phone: '0500000015',
      guest_email: email,
      arrival_date: departure,
      departure_date: departure,
      guests: 2,
      city: 'Riyadh',
    };
    const postInvalidRangeResponse = await postBooking(postInvalidRangePayload, accessToken);
    test('POST rejects departure <= arrival', postInvalidRangeResponse.status === 400, `status=${postInvalidRangeResponse.status}`);

    const malformedGuestBasePayload = {
      product_id: qaProductId,
      guest_name: 'Malformed Guest QA',
      guest_phone: '0500000009',
      guest_email: email,
      arrival_date: arrival,
      departure_date: departure,
      city: 'Riyadh',
      notes: 'phase4 malformed guests',
    };

    const malformedGuestCases = [
      { name: 'POST guest rejects nonnumeric string', payload: { ...malformedGuestBasePayload, guests: 'abc' } },
      { name: 'POST guest rejects string NaN', payload: { ...malformedGuestBasePayload, guests: 'NaN' } },
      { name: 'POST guest rejects string Infinity', payload: { ...malformedGuestBasePayload, guests: 'Infinity' } },
      { name: 'POST guest rejects string negative infinity', payload: { ...malformedGuestBasePayload, guests: '-Infinity' } },
      { name: 'POST guest rejects boolean', payload: { ...malformedGuestBasePayload, guests: true } },
      { name: 'POST guest rejects array', payload: { ...malformedGuestBasePayload, guests: [2] } },
      { name: 'POST guest rejects object', payload: { ...malformedGuestBasePayload, guests: { value: 2 } } },
      { name: 'POST guest rejects fractional value', payload: { ...malformedGuestBasePayload, guests: 1.5 } },
      { name: 'POST guest rejects zero', payload: { ...malformedGuestBasePayload, guests: 0 } },
      { name: 'POST guest rejects negative value', payload: { ...malformedGuestBasePayload, guests: -1 } },
      { name: 'POST guest rejects out of range value', payload: { ...malformedGuestBasePayload, guests: 21 } },
    ];

    for (const malformedCase of malformedGuestCases) {
      const malformedResponse = await postBooking(malformedCase.payload, accessToken);
      test(malformedCase.name, malformedResponse.status === 400, `status=${malformedResponse.status}`);
    }

    const malformedNaNBody = JSON.stringify(malformedGuestBasePayload).replace('}', ',"guests":NaN}');
    const malformedRawNaNResponse = await postBookingRaw(malformedNaNBody, accessToken);
    test('POST guest rejects JavaScript NaN numeric payload', malformedRawNaNResponse.status === 400, `status=${malformedRawNaNResponse.status}`);

    const malformedInfinityBody = JSON.stringify(malformedGuestBasePayload).replace('}', ',"guests":Infinity}');
    const malformedRawInfinityResponse = await postBookingRaw(malformedInfinityBody, accessToken);
    test('POST guest rejects JavaScript Infinity numeric payload', malformedRawInfinityResponse.status === 400, `status=${malformedRawInfinityResponse.status}`);

    const { count: invalidPersistedCount, error: invalidCountError } = await admin
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', qaUserId)
      .in('guest_name', ['Malformed Guest QA', 'Product Validation QA', 'Date Validation QA']);

    if (invalidCountError) {
      throw new Error(`Unable to verify invalid booking persistence: ${invalidCountError.message}`);
    }

    invalidBookingsPersisted = Number(invalidPersistedCount || 0);
    test('Invalid booking persistence count remains zero', invalidBookingsPersisted === 0, `count=${invalidBookingsPersisted}`);

    const validPayload = {
      product_id: qaProductId,
      guest_name: 'Valid Booking QA',
      guest_phone: '0500000001',
      guest_email: email,
      arrival_date: arrival,
      departure_date: departure,
      guests: 2,
      city: 'Riyadh',
      notes: 'phase4 focused tests',
    };

    const validBooking = await postBooking(validPayload, accessToken);
    bookingReference = validBooking.body?.data?.booking_reference || null;
    runtimeBookingsCreated += validBooking.status === 200 ? 1 : 0;
    test('12. Authoritative server total returned to client', validBooking.status === 200 && Number.isFinite(Number(validBooking.body?.data?.quote?.totalAmount)), `status=${validBooking.status}`);

    const bookingQuote = validBooking.body?.data?.quote;
    test('13. UI total matches authoritative server amount', Number(bookingQuote?.totalAmount) === Number(quoteData?.totalAmount), `quoteTotal=${bookingQuote?.totalAmount} preQuote=${quoteData?.totalAmount}`);

    const { data: bookingRows, error: bookingLookupError } = await admin
      .from('bookings')
      .select('user_id,product_id,product_price,total_price,total_amount,currency,booking_reference,arrival_date,departure_date,guests')
      .eq('booking_reference', bookingReference)
      .limit(1);

    if (bookingLookupError || !Array.isArray(bookingRows) || bookingRows.length === 0) {
      throw new Error(`Unable to verify persisted booking: ${bookingLookupError?.message || 'not found'}`);
    }

    const persisted = bookingRows[0];
    const expectedTotal = roundMoney(decisiveWinnerPrice * 3 * 2);
    test('15. Authenticated ownership preserved', persisted.user_id === qaUserId, `persistedUser=${persisted.user_id}`);
    test('Persisted authoritative product identity', persisted.product_id === qaProductId, `product=${persisted.product_id}`);
    test('Persisted booking reference format', /^DIR3-\d+-\d{4}$/.test(String(persisted.booking_reference || '')), `reference=${persisted.booking_reference}`);
    test('Persisted booking guest/date fields match request', Number(persisted.guests) === 2 && persisted.arrival_date === arrival && persisted.departure_date === departure, `guests=${persisted.guests} arrival=${persisted.arrival_date} departure=${persisted.departure_date}`);
    test('Persisted authoritative amounts', Number(persisted.product_price) === decisiveWinnerPrice && Number(persisted.total_price) === expectedTotal && Number(persisted.total_amount) === expectedTotal && String(persisted.currency).toUpperCase() === 'SAR');

    console.log(JSON.stringify({
      ok: true,
      baseUrl,
      projectRefFromUrl: new URL(supabaseUrl).host.split('.')[0],
      runtimeBookingsCreated,
      invalidBookingsPersisted,
      cleanupCounts,
      results,
    }, null, 2));
  } finally {
    if (qaUserId) {
      const { data: deletedBookings, error: bookingsCleanupError } = await admin
        .from('bookings')
        .delete()
        .eq('user_id', qaUserId)
        .select('id');

      if (!bookingsCleanupError && Array.isArray(deletedBookings)) {
        cleanupCounts.bookings += deletedBookings.length;
      }
    }

    if (qaProductId) {
      const { data: deletedProductPrices, error: pricesCleanupError } = await admin
        .from('product_prices')
        .delete()
        .eq('product_id', qaProductId)
        .select('id');

      if (!pricesCleanupError && Array.isArray(deletedProductPrices)) {
        cleanupCounts.productPrices += deletedProductPrices.length;
      }

      const { data: deletedProduct, error: productCleanupError } = await admin
        .from('products')
        .delete()
        .eq('id', qaProductId)
        .select('id');

      if (!productCleanupError && Array.isArray(deletedProduct)) {
        cleanupCounts.products += deletedProduct.length;
      }
    }

    if (qaInactiveProductId) {
      const { data: deletedInactiveProduct, error: inactiveProductCleanupError } = await admin
        .from('products')
        .delete()
        .eq('id', qaInactiveProductId)
        .select('id');

      if (!inactiveProductCleanupError && Array.isArray(deletedInactiveProduct)) {
        cleanupCounts.products += deletedInactiveProduct.length;
      }
    }

    if (qaUserId) {
      const { data: deletedProfiles, error: profilesCleanupError } = await admin
        .from('profiles')
        .delete()
        .eq('id', qaUserId)
        .select('id');

      if (!profilesCleanupError && Array.isArray(deletedProfiles)) {
        cleanupCounts.profiles += deletedProfiles.length;
      }

      const userDelete = await admin.auth.admin.deleteUser(qaUserId);
      if (!userDelete.error) {
        cleanupCounts.users += 1;
      }
    }

    console.log(JSON.stringify({
      cleanupSummary: {
        runtimeBookingsCreated,
        invalidBookingsPersisted,
        cleanupCounts,
      },
    }, null, 2));
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error?.message || String(error) }, null, 2));
  process.exitCode = 1;
});
