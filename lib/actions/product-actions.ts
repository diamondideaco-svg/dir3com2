'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { sanitizeBoolean, sanitizeNumber, sanitizeText } from '@/lib/security/validation';

export async function createProductAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const nameAr = sanitizeText(formData.get('nameAr')?.toString(), '').slice(0, 120);
  const nameEn = sanitizeText(formData.get('nameEn')?.toString(), '').slice(0, 120);
  const slug = sanitizeText(formData.get('slug')?.toString(), nameEn.toLowerCase().replace(/\s+/g, '-')).slice(0, 120);
  const categoryId = sanitizeText(formData.get('categoryId')?.toString(), '');
  const basePrice = sanitizeNumber(formData.get('basePrice'), 0);
  const city = sanitizeText(formData.get('city')?.toString(), '').slice(0, 80);
  const status = sanitizeText(formData.get('status')?.toString(), 'draft').slice(0, 40);
  const featured = sanitizeBoolean(formData.get('featured'));
  const verified = sanitizeBoolean(formData.get('verified'));
  const shieldCertified = sanitizeBoolean(formData.get('shieldCertified'));

  await supabase.from('products').insert({
    category_id: categoryId || null,
    name_ar: nameAr,
    name_en: nameEn,
    slug,
    city,
    base_price: Math.max(0, basePrice),
    status,
    featured,
    verified,
    shield_certified: shieldCertified,
  });

  revalidatePath('/admin/products');
}

export async function updateProductAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const id = formData.get('id')?.toString();
  if (!id) return;

  const updates: Record<string, unknown> = {};
  const nameAr = formData.get('nameAr')?.toString();
  if (nameAr) updates.name_ar = nameAr;
  const nameEn = formData.get('nameEn')?.toString();
  if (nameEn) updates.name_en = nameEn;
  const status = formData.get('status')?.toString();
  if (status) updates.status = status;
  const featured = formData.get('featured')?.toString();
  if (featured) updates.featured = featured === 'on';
  const verified = formData.get('verified')?.toString();
  if (verified) updates.verified = verified === 'on';
  const shieldCertified = formData.get('shieldCertified')?.toString();
  if (shieldCertified) updates.shield_certified = shieldCertified === 'on';

  await supabase.from('products').update(updates).eq('id', id);
  revalidatePath('/admin/products');
}

export async function deleteProductAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const id = formData.get('id')?.toString();
  if (!id) return;

  await supabase.from('products').delete().eq('id', id);
  revalidatePath('/admin/products');
}

export async function uploadImagesAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const productId = formData.get('productId')?.toString();
  const files = formData.getAll('images');
  if (!productId) return;

  for (const file of files) {
    if (file instanceof File) {
      await supabase.from('product_images').insert({
        product_id: productId,
        image_url: `/images/${file.name}`,
      });
    }
  }

  revalidatePath('/admin/products');
}

export async function assignPartnerAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const productId = formData.get('productId')?.toString();
  const partnerId = formData.get('partnerId')?.toString();
  const city = formData.get('city')?.toString() || '';
  if (!productId || !partnerId) return;

  await supabase.from('product_availability').insert({ product_id: productId, city, partner_id: partnerId, available: true });
  revalidatePath('/admin/products');
}

export async function publishProductAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const id = formData.get('id')?.toString();
  if (!id) return;

  await supabase.from('products').update({ status: 'published', verified: true }).eq('id', id);
  revalidatePath('/admin/products');
}
