'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { assertCountryAllowed, requireScopedAdminActionAccess } from '@/lib/auth/admin';
import { sanitizeBoolean, sanitizeNumber, sanitizeText } from '@/lib/security/validation';

const PRODUCT_FAMILIES = ['drive', 'stay', 'fly', 'concierge', 'vip'] as const;
const FULFILMENT_STATES = ['verified_requestable', 'verified_quote', 'live_bookable', 'unavailable', 'availability_unknown'] as const;
const TRANSACTION_METHODS = ['instant_booking', 'request_to_confirm', 'request_quote'] as const;
const SUPPLY_TYPES = ['verified_local_partner', 'global_travel_partner', 'dir3com_managed', 'unknown'] as const;

function enumValue<T extends readonly string[]>(value: FormDataEntryValue | null, allowed: T, fallback: T[number]): T[number] {
  const normalized = sanitizeText(value?.toString(), fallback);
  return (allowed as readonly string[]).includes(normalized) ? (normalized as T[number]) : fallback;
}

function cleanSlug(value: FormDataEntryValue | null, seed: string) {
  const raw = sanitizeText(value?.toString(), seed)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 120);
  return raw || `product-${Date.now()}`;
}

async function requireProductInScope(id: string, permission: 'products:read' | 'products:write') {
  const context = await requireScopedAdminActionAccess(permission);
  const { data, error } = await context.supabase
    .from('products')
    .select('id, country, lifecycle_version, status, deleted_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('PRODUCT_NOT_FOUND');
  assertCountryAllowed(context.scope, data.country);
  return { ...context, product: data };
}

function parseVersion(value: FormDataEntryValue | null) {
  const version = Number(value);
  if (!Number.isInteger(version) || version < 1) throw new Error('PRODUCT_VERSION_REQUIRED');
  return version;
}

function readLifecycleFields(formData: FormData) {
  const nameAr = sanitizeText(formData.get('nameAr')?.toString(), '').slice(0, 120);
  const nameEn = sanitizeText(formData.get('nameEn')?.toString(), '').slice(0, 120);
  if (!nameAr && !nameEn) throw new Error('PRODUCT_NAME_REQUIRED');

  const country = sanitizeText(formData.get('country')?.toString(), '').slice(0, 80);
  if (!country) throw new Error('PRODUCT_COUNTRY_REQUIRED');

  const seed = nameEn || nameAr || 'product';
  return {
    nameAr,
    nameEn,
    slug: cleanSlug(formData.get('slug'), seed),
    basePrice: Math.max(0, sanitizeNumber(formData.get('basePrice'), 0)),
    country,
    city: sanitizeText(formData.get('city')?.toString(), '').slice(0, 80),
    marketplaceFamily: enumValue(formData.get('marketplaceFamily'), PRODUCT_FAMILIES, 'drive'),
    fulfilmentState: enumValue(formData.get('fulfilmentState'), FULFILMENT_STATES, 'verified_requestable'),
    transactionMethod: enumValue(formData.get('transactionMethod'), TRANSACTION_METHODS, 'request_to_confirm'),
    supplyType: enumValue(formData.get('supplyType'), SUPPLY_TYPES, 'unknown'),
    supplierVerified: sanitizeBoolean(formData.get('supplierVerified')),
    featured: sanitizeBoolean(formData.get('featured')),
    shieldCertified: sanitizeBoolean(formData.get('shieldCertified')),
    reason: sanitizeText(formData.get('reason')?.toString(), '').slice(0, 300),
  };
}

function refreshProductSurfaces() {
  revalidatePath('/admin/products');
  revalidatePath('/marketplace');
}

export async function createProductAction(formData: FormData) {
  const { supabase, scope, user, role } = await requireScopedAdminActionAccess('products:write');
  const fields = readLifecycleFields(formData);
  assertCountryAllowed(scope, fields.country);

  const { error } = await supabase.rpc('create_product_draft_lifecycle', {
    p_actor_user_id: user.id,
    p_actor_role: role,
    p_name_ar: fields.nameAr,
    p_name_en: fields.nameEn,
    p_slug: fields.slug,
    p_base_price: fields.basePrice,
    p_country: fields.country,
    p_city: fields.city,
    p_marketplace_family: fields.marketplaceFamily,
    p_fulfilment_state: fields.fulfilmentState,
    p_transaction_method: fields.transactionMethod,
    p_supply_type: fields.supplyType,
    p_supplier_verified: fields.supplierVerified,
    p_featured: fields.featured,
    p_shield_certified: fields.shieldCertified,
    p_reason: fields.reason || 'Admin draft created',
  });
  if (error) throw new Error(error.message || 'PRODUCT_CREATE_FAILED');

  refreshProductSurfaces();
  redirect('/admin/products?result=created');
}

export async function updateProductAction(formData: FormData) {
  const id = formData.get('id')?.toString();
  if (!id) throw new Error('PRODUCT_ID_REQUIRED');
  const expectedVersion = parseVersion(formData.get('expectedVersion'));
  const { supabase, scope, user, role } = await requireProductInScope(id, 'products:write');
  const fields = readLifecycleFields(formData);
  assertCountryAllowed(scope, fields.country);

  const { error } = await supabase.rpc('update_product_draft_lifecycle', {
    p_actor_user_id: user.id,
    p_actor_role: role,
    p_product_id: id,
    p_expected_version: expectedVersion,
    p_name_ar: fields.nameAr,
    p_name_en: fields.nameEn,
    p_slug: fields.slug,
    p_base_price: fields.basePrice,
    p_country: fields.country,
    p_city: fields.city,
    p_marketplace_family: fields.marketplaceFamily,
    p_fulfilment_state: fields.fulfilmentState,
    p_transaction_method: fields.transactionMethod,
    p_supply_type: fields.supplyType,
    p_supplier_verified: fields.supplierVerified,
    p_featured: fields.featured,
    p_shield_certified: fields.shieldCertified,
    p_reason: fields.reason || 'Admin draft updated',
  });
  if (error) throw new Error(error.message || 'PRODUCT_UPDATE_FAILED');

  refreshProductSurfaces();
  redirect('/admin/products?result=updated');
}

export async function publishProductAction(formData: FormData) {
  const id = formData.get('id')?.toString();
  if (!id) throw new Error('PRODUCT_ID_REQUIRED');
  const expectedVersion = parseVersion(formData.get('expectedVersion'));
  const { supabase, user, role } = await requireProductInScope(id, 'products:write');
  const reason = sanitizeText(formData.get('reason')?.toString(), 'Admin publish').slice(0, 300);

  const { error } = await supabase.rpc('publish_product_lifecycle', {
    p_actor_user_id: user.id,
    p_actor_role: role,
    p_product_id: id,
    p_expected_version: expectedVersion,
    p_reason: reason,
  });
  if (error) throw new Error(error.message || 'PRODUCT_PUBLISH_FAILED');

  refreshProductSurfaces();
  redirect('/admin/products?result=published');
}

export async function unpublishProductAction(formData: FormData) {
  const id = formData.get('id')?.toString();
  if (!id) throw new Error('PRODUCT_ID_REQUIRED');
  const expectedVersion = parseVersion(formData.get('expectedVersion'));
  const { supabase, user, role } = await requireProductInScope(id, 'products:write');
  const reason = sanitizeText(formData.get('reason')?.toString(), 'Admin unpublish').slice(0, 300);

  const { error } = await supabase.rpc('unpublish_product_lifecycle', {
    p_actor_user_id: user.id,
    p_actor_role: role,
    p_product_id: id,
    p_expected_version: expectedVersion,
    p_reason: reason,
  });
  if (error) throw new Error(error.message || 'PRODUCT_UNPUBLISH_FAILED');

  refreshProductSurfaces();
  redirect('/admin/products?result=unpublished');
}

export async function archiveProductAction(formData: FormData) {
  const id = formData.get('id')?.toString();
  if (!id) throw new Error('PRODUCT_ID_REQUIRED');
  const expectedVersion = parseVersion(formData.get('expectedVersion'));
  const { supabase, user, role } = await requireProductInScope(id, 'products:write');
  const reason = sanitizeText(formData.get('reason')?.toString(), 'Admin archive').slice(0, 300);

  const { error } = await supabase.rpc('archive_product_lifecycle', {
    p_actor_user_id: user.id,
    p_actor_role: role,
    p_product_id: id,
    p_expected_version: expectedVersion,
    p_reason: reason,
  });
  if (error) throw new Error(error.message || 'PRODUCT_ARCHIVE_FAILED');

  refreshProductSurfaces();
  redirect('/admin/products?result=archived');
}

export async function deleteProductAction(formData: FormData) {
  return archiveProductAction(formData);
}

export async function uploadImagesAction(formData: FormData) {
  const productId = formData.get('productId')?.toString();
  const files = formData.getAll('images');
  if (!productId) throw new Error('PRODUCT_ID_REQUIRED');
  const { supabase } = await requireProductInScope(productId, 'products:write');

  for (const file of files) {
    if (file instanceof File) {
      const { error } = await supabase.from('product_images').insert({
        product_id: productId,
        image_url: `/images/${file.name}`,
      });
      if (error) throw error;
    }
  }

  refreshProductSurfaces();
}

export async function assignPartnerAction(formData: FormData) {
  const productId = formData.get('productId')?.toString();
  const partnerId = formData.get('partnerId')?.toString();
  const city = formData.get('city')?.toString() || '';
  if (!productId || !partnerId) throw new Error('PRODUCT_AND_PARTNER_REQUIRED');
  const { supabase, scope } = await requireProductInScope(productId, 'products:write');
  const { data: partner, error: partnerError } = await supabase.from('partners').select('id, country').eq('id', partnerId).maybeSingle();
  if (partnerError) throw partnerError;
  if (!partner) throw new Error('PARTNER_NOT_FOUND');
  assertCountryAllowed(scope, partner.country);

  const { error } = await supabase.from('product_availability').insert({ product_id: productId, city, partner_id: partnerId, available: true });
  if (error) throw error;
  refreshProductSurfaces();
}
