'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { assertCountryAllowed, requireScopedAdminActionAccess } from '@/lib/auth/admin';
import { sanitizeBoolean, sanitizeNumber, sanitizeText } from '@/lib/security/validation';

async function requireProductInScope(id: string, permission: 'products:read' | 'products:write') {
  const context = await requireScopedAdminActionAccess(permission);
  const { data, error } = await context.supabase.from('products').select('id, country').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('PRODUCT_NOT_FOUND');
  assertCountryAllowed(context.scope, data.country);
  return context;
}

export async function createProductAction(formData: FormData) {
  const { supabase, scope } = await requireScopedAdminActionAccess('products:write');
  const nameAr = sanitizeText(formData.get('nameAr')?.toString(), '').slice(0, 120);
  const nameEn = sanitizeText(formData.get('nameEn')?.toString(), '').slice(0, 120);
  const slug = sanitizeText(formData.get('slug')?.toString(), nameEn.toLowerCase().replace(/\s+/g, '-')).slice(0, 120);
  const categoryId = sanitizeText(formData.get('categoryId')?.toString(), '');
  const basePrice = sanitizeNumber(formData.get('basePrice'), 0);
  const country = sanitizeText(formData.get('country')?.toString(), '').slice(0, 80);
  const city = sanitizeText(formData.get('city')?.toString(), '').slice(0, 80);
  const status = sanitizeText(formData.get('status')?.toString(), 'draft').slice(0, 40);
  const featured = sanitizeBoolean(formData.get('featured'));
  const verified = sanitizeBoolean(formData.get('verified'));
  const shieldCertified = sanitizeBoolean(formData.get('shieldCertified'));

  if (!nameAr && !nameEn) throw new Error('PRODUCT_NAME_REQUIRED');
  if (!country) throw new Error('PRODUCT_COUNTRY_REQUIRED');
  assertCountryAllowed(scope, country);

  const { error } = await supabase.from('products').insert({
    category_id: categoryId || null,
    name_ar: nameAr,
    name_en: nameEn,
    slug,
    country,
    city,
    base_price: Math.max(0, basePrice),
    status,
    featured,
    verified,
    shield_certified: shieldCertified,
  });
  if (error) throw error;

  revalidatePath('/admin/products');
  redirect('/admin/products?result=created');
}

export async function updateProductAction(formData: FormData) {
  const id = formData.get('id')?.toString();
  if (!id) throw new Error('Product id is required');
  const { supabase, scope } = await requireProductInScope(id, 'products:write');

  const updates: Record<string, unknown> = {};
  const nameAr = formData.get('nameAr')?.toString();
  if (nameAr) updates.name_ar = nameAr;
  const nameEn = formData.get('nameEn')?.toString();
  if (nameEn) updates.name_en = nameEn;
  const country = formData.get('country')?.toString();
  if (country) {
    assertCountryAllowed(scope, country);
    updates.country = country;
  }
  const city = formData.get('city')?.toString();
  if (city) updates.city = city;
  const status = formData.get('status')?.toString();
  if (status) updates.status = status;
  const featured = formData.get('featured')?.toString();
  if (featured) updates.featured = featured === 'on';
  const verified = formData.get('verified')?.toString();
  if (verified) updates.verified = verified === 'on';
  const shieldCertified = formData.get('shieldCertified')?.toString();
  if (shieldCertified) updates.shield_certified = shieldCertified === 'on';

  const { error } = await supabase.from('products').update(updates).eq('id', id);
  if (error) throw error;
  revalidatePath('/admin/products');
}

export async function deleteProductAction(formData: FormData) {
  const id = formData.get('id')?.toString();
  if (!id) throw new Error('Product id is required');
  const { supabase } = await requireProductInScope(id, 'products:write');

  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) throw error;
  revalidatePath('/admin/products');
  redirect('/admin/products?result=deleted');
}

export async function uploadImagesAction(formData: FormData) {
  const productId = formData.get('productId')?.toString();
  const files = formData.getAll('images');
  if (!productId) throw new Error('Product id is required');
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

  revalidatePath('/admin/products');
}

export async function assignPartnerAction(formData: FormData) {
  const productId = formData.get('productId')?.toString();
  const partnerId = formData.get('partnerId')?.toString();
  const city = formData.get('city')?.toString() || '';
  if (!productId || !partnerId) throw new Error('Product and partner are required');
  const { supabase, scope } = await requireProductInScope(productId, 'products:write');
  const { data: partner, error: partnerError } = await supabase.from('partners').select('id, country').eq('id', partnerId).maybeSingle();
  if (partnerError) throw partnerError;
  if (!partner) throw new Error('PARTNER_NOT_FOUND');
  assertCountryAllowed(scope, partner.country);

  const { error } = await supabase.from('product_availability').insert({ product_id: productId, city, partner_id: partnerId, available: true });
  if (error) throw error;
  revalidatePath('/admin/products');
}

export async function publishProductAction(formData: FormData) {
  const id = formData.get('id')?.toString();
  if (!id) throw new Error('Product id is required');
  const { supabase } = await requireProductInScope(id, 'products:write');

  const { error } = await supabase.from('products').update({ status: 'published', verified: true }).eq('id', id);
  if (error) throw error;
  revalidatePath('/admin/products');
  redirect('/admin/products?result=published');
}
