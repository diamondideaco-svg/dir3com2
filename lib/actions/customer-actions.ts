'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { assertCountryAllowed, requireScopedAdminActionAccess } from '@/lib/auth/admin';

async function requireCustomerInScope(id: string, permission: 'customers:read' | 'customers:write') {
  const context = await requireScopedAdminActionAccess(permission);
  const { data, error } = await context.supabase.from('customers').select('id, country').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('CUSTOMER_NOT_FOUND');
  assertCountryAllowed(context.scope, data.country);
  return context;
}

export async function createCustomerAction(formData: FormData) {
  const { supabase, scope } = await requireScopedAdminActionAccess('customers:write');
  const fullName = formData.get('fullName')?.toString() || '';
  const email = formData.get('email')?.toString() || '';
  const phone = formData.get('phone')?.toString() || '';
  const country = formData.get('country')?.toString() || '';
  const city = formData.get('city')?.toString() || '';
  const shieldLevel = formData.get('shieldLevel')?.toString() || 'DIR3 Shield';
  if (!fullName.trim() || !email.trim() || !country.trim()) throw new Error('CUSTOMER_REQUIRED_FIELDS_MISSING');
  assertCountryAllowed(scope, country);

  const { error } = await supabase.from('customers').insert({ full_name: fullName, email, phone, country, city, shield_level: shieldLevel });
  if (error) throw error;
  revalidatePath('/admin/customers');
  redirect('/admin/customers?result=created');
}

export async function updateCustomerAction(formData: FormData) {
  const id = formData.get('id')?.toString();
  if (!id) throw new Error('Customer id is required');
  const { supabase, scope } = await requireCustomerInScope(id, 'customers:write');

  const updates: Record<string, unknown> = {};
  const fullName = formData.get('fullName')?.toString();
  if (fullName) updates.full_name = fullName;
  const phone = formData.get('phone')?.toString();
  if (phone) updates.phone = phone;
  const country = formData.get('country')?.toString();
  if (country) {
    assertCountryAllowed(scope, country);
    updates.country = country;
  }
  const city = formData.get('city')?.toString();
  if (city) updates.city = city;
  const shieldLevel = formData.get('shieldLevel')?.toString();
  if (shieldLevel) updates.shield_level = shieldLevel;

  const { error } = await supabase.from('customers').update(updates).eq('id', id);
  if (error) throw error;
  revalidatePath('/admin/customers');
}

export async function uploadDocumentsAction(formData: FormData) {
  const customerId = formData.get('customerId')?.toString();
  const documentType = formData.get('documentType')?.toString() || 'passport';
  const fileUrl = formData.get('fileUrl')?.toString() || '';
  if (!customerId || !fileUrl) throw new Error('Document customer and URL are required');
  const { supabase } = await requireCustomerInScope(customerId, 'customers:write');

  const { error } = await supabase.from('customer_documents').insert({ customer_id: customerId, document_type: documentType, file_url: fileUrl });
  if (error) throw error;
  revalidatePath('/my-documents');
}

export async function updateShieldLevelAction(formData: FormData) {
  const id = formData.get('id')?.toString();
  const shieldLevel = formData.get('shieldLevel')?.toString();
  if (!id || !shieldLevel) throw new Error('Customer and shield level are required');
  const { supabase } = await requireCustomerInScope(id, 'customers:write');

  const { error } = await supabase.from('customers').update({ shield_level: shieldLevel }).eq('id', id);
  if (error) throw error;
  revalidatePath('/admin/customers');
  revalidatePath('/my-account');
  redirect('/admin/customers?result=shield_updated');
}

export async function deactivateCustomerAction(formData: FormData) {
  const id = formData.get('id')?.toString();
  if (!id) throw new Error('Customer id is required');
  const { supabase } = await requireCustomerInScope(id, 'customers:write');

  const { error } = await supabase.from('customers').update({ status: 'inactive' }).eq('id', id);
  if (error) throw error;
  revalidatePath('/admin/customers');
  redirect('/admin/customers?result=deactivated');
}
