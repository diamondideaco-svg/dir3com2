'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdminActionAccess } from '@/lib/auth/admin';

export async function createCustomerAction(formData: FormData) {
  const { supabase } = await requireAdminActionAccess();
  const fullName = formData.get('fullName')?.toString() || '';
  const email = formData.get('email')?.toString() || '';
  const phone = formData.get('phone')?.toString() || '';
  const country = formData.get('country')?.toString() || '';
  const city = formData.get('city')?.toString() || '';
  const shieldLevel = formData.get('shieldLevel')?.toString() || 'DIR3 Shield';

  await supabase.from('customers').insert({ full_name: fullName, email, phone, country, city, shield_level: shieldLevel });
  revalidatePath('/admin/customers');
  redirect('/admin/customers?result=created');
}

export async function updateCustomerAction(formData: FormData) {
  const { supabase } = await requireAdminActionAccess();
  const id = formData.get('id')?.toString();
  if (!id) return;

  const updates: Record<string, unknown> = {};
  const fullName = formData.get('fullName')?.toString();
  if (fullName) updates.full_name = fullName;
  const phone = formData.get('phone')?.toString();
  if (phone) updates.phone = phone;
  const country = formData.get('country')?.toString();
  if (country) updates.country = country;
  const city = formData.get('city')?.toString();
  if (city) updates.city = city;
  const shieldLevel = formData.get('shieldLevel')?.toString();
  if (shieldLevel) updates.shield_level = shieldLevel;

  await supabase.from('customers').update(updates).eq('id', id);
  revalidatePath('/admin/customers');
}

export async function uploadDocumentsAction(formData: FormData) {
  const { supabase } = await requireAdminActionAccess();
  const customerId = formData.get('customerId')?.toString();
  const documentType = formData.get('documentType')?.toString() || 'passport';
  const fileUrl = formData.get('fileUrl')?.toString() || '';
  if (!customerId) return;

  await supabase.from('customer_documents').insert({ customer_id: customerId, document_type: documentType, file_url: fileUrl });
  revalidatePath('/my-documents');
}

export async function updateShieldLevelAction(formData: FormData) {
  const { supabase } = await requireAdminActionAccess();
  const id = formData.get('id')?.toString();
  const shieldLevel = formData.get('shieldLevel')?.toString();
  if (!id || !shieldLevel) return;

  await supabase.from('customers').update({ shield_level: shieldLevel }).eq('id', id);
  revalidatePath('/admin/customers');
  revalidatePath('/my-account');
  redirect('/admin/customers?result=shield_updated');
}

export async function deactivateCustomerAction(formData: FormData) {
  const { supabase } = await requireAdminActionAccess();
  const id = formData.get('id')?.toString();
  if (!id) return;

  await supabase.from('customers').update({ status: 'inactive' }).eq('id', id);
  revalidatePath('/admin/customers');
  redirect('/admin/customers?result=deactivated');
}
