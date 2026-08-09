import { supabaseAdmin } from '@/lib/supabase/server';

export type SandboxEnvironment = 'local' | 'staging';

export type SandboxSearchInput = {
  query?: string;
  city?: string;
  category?: string;
  currency?: string;
  limit?: number;
};

export type SandboxQuoteInput = {
  productId: string;
  arrivalDate: string;
  departureDate: string;
  guests: number;
};

export type SandboxCreateBookingInput = SandboxQuoteInput & {
  guestName: string;
  guestPhone: string;
  guestEmail?: string;
  notes?: string;
  sourceChannel?: string;
};

export type SandboxModifyBookingInput = {
  bookingId: string;
  arrivalDate: string;
  departureDate: string;
  guests?: number;
  notes?: string;
};

export type SandboxEscalationInput = {
  bookingId: string;
  reason: string;
};

function assertSandboxEnv(value: string | undefined): SandboxEnvironment {
  const normalized = String(value || 'local').trim().toLowerCase();
  if (normalized === 'staging') return 'staging';
  return 'local';
}

function ensureClient() {
  if (!supabaseAdmin) {
    throw new Error('SUPABASE_ADMIN_UNAVAILABLE');
  }

  return supabaseAdmin;
}

function daysBetween(arrivalDate: Date, departureDate: Date) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.max(1, Math.ceil((departureDate.getTime() - arrivalDate.getTime()) / msPerDay));
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function toDate(value: string) {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('INVALID_DATE');
  }
  return parsed;
}

function inNonProduction() {
  const appEnv = String(process.env.NEXT_PUBLIC_APP_ENV || process.env.APP_ENV || process.env.NODE_ENV || '').toLowerCase();
  if (appEnv === 'production') {
    throw new Error('SANDBOX_BLOCKED_IN_PRODUCTION');
  }
}

export async function sandboxSearch(environment: SandboxEnvironment, input: SandboxSearchInput) {
  inNonProduction();
  const client = ensureClient();
  const limit = Math.min(Math.max(Number(input.limit || 12), 1), 50);

  let query = client
    .from('products')
    .select('id,slug,name_ar,name_en,description_ar,city,country,base_price,currency,category_id,taxes_percent,insurance_amount,deposit_amount,addons_amount,max_guests')
    .eq('synthetic', true)
    .eq('environment', environment)
    .eq('status', 'sandbox')
    .limit(limit);

  if (input.city) {
    query = query.ilike('city', `%${input.city.trim()}%`);
  }

  if (input.currency) {
    query = query.eq('currency', input.currency.trim().toUpperCase());
  }

  if (input.query) {
    const q = input.query.trim().replace(/[,%]/g, '');
    if (q) {
      query = query.or(`name_ar.ilike.%${q}%,name_en.ilike.%${q}%,description_ar.ilike.%${q}%,city.ilike.%${q}%`);
    }
  }

  const { data: products, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  if (!products?.length || !input.category) {
    return products ?? [];
  }

  const { data: categories } = await client
    .from('product_categories')
    .select('id, slug')
    .eq('synthetic', true)
    .eq('environment', environment);

  const categoryById = new Map((categories || []).map((row) => [row.id, row.slug]));
  const categoryNeedle = input.category.toLowerCase();

  return (products || []).filter((product) => {
    const slug = String(categoryById.get(product.category_id) || '').toLowerCase();
    return slug.includes(categoryNeedle);
  });
}

export async function sandboxCompare(environment: SandboxEnvironment, productIds: string[]) {
  inNonProduction();
  const client = ensureClient();

  const ids = [...new Set(productIds.filter(Boolean))].slice(0, 5);
  if (!ids.length) {
    return [];
  }

  const { data, error } = await client
    .from('products')
    .select('id,slug,name_ar,name_en,city,country,base_price,currency,taxes_percent,insurance_amount,deposit_amount,addons_amount,max_guests')
    .in('id', ids)
    .eq('synthetic', true)
    .eq('environment', environment)
    .eq('status', 'sandbox');

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

export async function sandboxAvailability(environment: SandboxEnvironment, productId: string, fromDate: string, toDate: string) {
  inNonProduction();
  const client = ensureClient();

  const { data, error } = await client
    .from('product_availability')
    .select('date,availability_status,available,capacity,booked_count,price,currency,weekend_price,seasonal_price,discount_percent,taxes_percent,insurance_amount,deposit_amount,addons_amount,notes')
    .eq('synthetic', true)
    .eq('environment', environment)
    .eq('product_id', productId)
    .gte('date', fromDate)
    .lte('date', toDate)
    .order('date', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

export async function sandboxQuote(environment: SandboxEnvironment, input: SandboxQuoteInput) {
  inNonProduction();
  const client = ensureClient();

  const guests = Math.max(1, Math.min(Number(input.guests || 1), 12));
  const arrival = toDate(input.arrivalDate);
  const departure = toDate(input.departureDate);

  if (departure <= arrival) {
    throw new Error('INVALID_RANGE');
  }

  const nights = daysBetween(arrival, departure);

  const { data: product, error: productError } = await client
    .from('products')
    .select('id,slug,name_ar,name_en,city,base_price,currency,taxes_percent,insurance_amount,deposit_amount,addons_amount,max_guests')
    .eq('id', input.productId)
    .eq('synthetic', true)
    .eq('environment', environment)
    .eq('status', 'sandbox')
    .maybeSingle();

  if (productError) throw new Error(productError.message);
  if (!product) throw new Error('PRODUCT_NOT_FOUND');

  if (product.max_guests && guests > product.max_guests) {
    throw new Error('GUESTS_EXCEED_MAX');
  }

  const from = input.arrivalDate;
  const to = input.departureDate;
  const availability = await sandboxAvailability(environment, input.productId, from, to);

  if (!availability.length) {
    throw new Error('NO_AVAILABILITY');
  }

  const blocked = availability.find((row) => ['full', 'maintenance', 'blackout'].includes(String(row.availability_status || '').toLowerCase()));
  if (blocked) {
    throw new Error(`UNAVAILABLE:${blocked.availability_status}`);
  }

  const dailySubtotal = availability.reduce((sum, row) => sum + Number(row.price || product.base_price || 0), 0);
  const subtotal = roundMoney(dailySubtotal * guests);
  const taxRate = Number(product.taxes_percent || 0) / 100;
  const taxes = roundMoney(subtotal * taxRate);
  const insurance = roundMoney(Number(product.insurance_amount || 0));
  const deposit = roundMoney(Number(product.deposit_amount || 0));
  const addons = roundMoney(Number(product.addons_amount || 0));
  const total = roundMoney(subtotal + taxes + insurance + deposit + addons);

  return {
    productId: product.id,
    productName: product.name_ar || product.name_en || product.slug,
    productCity: product.city || null,
    currency: product.currency || 'EGP',
    nights,
    guests,
    subtotal,
    taxes,
    insurance,
    deposit,
    addons,
    total,
    availability,
  };
}

export async function sandboxCreateBooking(environment: SandboxEnvironment, input: SandboxCreateBookingInput) {
  inNonProduction();
  const client = ensureClient();
  const quote = await sandboxQuote(environment, input);

  const bookingReference = `TEST-BOOK-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;

  const payload = {
    user_id: null,
    product_id: input.productId,
    product_name: quote.productName,
    product_price: quote.subtotal / Math.max(1, quote.nights * quote.guests),
    guest_name: input.guestName,
    guest_phone: input.guestPhone,
    guest_email: input.guestEmail || null,
    arrival_date: input.arrivalDate,
    departure_date: input.departureDate,
    guests: quote.guests,
    city: quote.productCity || null,
    status: 'pending',
    payment_status: 'pending',
    currency: quote.currency,
    total_amount: quote.total,
    total_price: quote.total,
    notes: input.notes || 'Synthetic booking',
    booking_reference: bookingReference,
    synthetic: true,
    environment,
    reference_code: bookingReference,
    scenario_code: 'sandbox_create',
    source_channel: input.sourceChannel || 'dabra-ai2-sandbox',
  };

  const { data, error } = await client.from('bookings').insert(payload).select('id, booking_reference, status, payment_status, total_amount, currency').maybeSingle();
  if (error) {
    throw new Error(error.message);
  }

  return { booking: data, quote };
}

export async function sandboxModifyBooking(environment: SandboxEnvironment, input: SandboxModifyBookingInput) {
  inNonProduction();
  const client = ensureClient();

  const { data: existing, error: existingError } = await client
    .from('bookings')
    .select('id,product_id,guest_name,guest_phone,guest_email,guests,booking_reference')
    .eq('id', input.bookingId)
    .eq('synthetic', true)
    .eq('environment', environment)
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);
  if (!existing) throw new Error('BOOKING_NOT_FOUND');

  const quote = await sandboxQuote(environment, {
    productId: existing.product_id,
    arrivalDate: input.arrivalDate,
    departureDate: input.departureDate,
    guests: input.guests || existing.guests || 1,
  });

  const updatePayload = {
    arrival_date: input.arrivalDate,
    departure_date: input.departureDate,
    guests: quote.guests,
    total_amount: quote.total,
    total_price: quote.total,
    notes: input.notes || 'Synthetic booking modified',
    scenario_code: 'sandbox_modified',
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await client
    .from('bookings')
    .update(updatePayload)
    .eq('id', input.bookingId)
    .select('id,booking_reference,status,payment_status,total_amount,currency,arrival_date,departure_date,guests')
    .maybeSingle();

  if (error) throw new Error(error.message);

  return { booking: data, quote };
}

export async function sandboxCancelBooking(environment: SandboxEnvironment, bookingId: string, reason: string) {
  inNonProduction();
  const client = ensureClient();

  const { data, error } = await client
    .from('bookings')
    .update({
      status: 'cancelled',
      payment_status: 'refunded',
      notes: reason,
      scenario_code: 'sandbox_cancelled',
      updated_at: new Date().toISOString(),
    })
    .eq('id', bookingId)
    .eq('synthetic', true)
    .eq('environment', environment)
    .select('id,booking_reference,status,payment_status,notes,updated_at')
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('BOOKING_NOT_FOUND');

  return data;
}

export async function sandboxEscalateBooking(environment: SandboxEnvironment, input: SandboxEscalationInput) {
  inNonProduction();
  const client = ensureClient();

  const { data, error } = await client
    .from('bookings')
    .update({
      escalated_to_staff: true,
      escalation_reason: input.reason,
      notes: `Escalated: ${input.reason}`,
      scenario_code: 'sandbox_escalated',
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.bookingId)
    .eq('synthetic', true)
    .eq('environment', environment)
    .select('id,booking_reference,status,escalated_to_staff,escalation_reason,updated_at')
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('BOOKING_NOT_FOUND');

  return data;
}

export function resolveSandboxEnvironment() {
  return assertSandboxEnv(process.env.SANDBOX_TARGET_ENV || process.env.NEXT_PUBLIC_APP_ENV);
}
