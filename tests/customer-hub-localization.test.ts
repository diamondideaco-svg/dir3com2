import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  customerHubCopy,
  formatCustomerHubDate,
  getCustomerRoleLabel,
  getCustomerStatusLabel,
  getVerificationStatusLabel,
} from '@/lib/i18n/customer-hub';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('My Documents exposes complete Arabic and English system copy', () => {
  assert.equal(customerHubCopy.ar.documents.title, 'المستندات');
  assert.equal(customerHubCopy.en.documents.title, 'Documents');
  assert.equal(customerHubCopy.ar.documents.empty, 'لا توجد مستندات مرتبطة بحسابك حالياً.');
  assert.equal(customerHubCopy.en.documents.empty, 'There are no documents linked to your account yet.');
  assert.equal(customerHubCopy.ar.documents.error.startsWith('تعذر تحميل'), true);
  assert.equal(customerHubCopy.en.documents.error.startsWith('We could not load'), true);
});

test('Profile and My Account expose complete Arabic and English system copy', () => {
  assert.equal(customerHubCopy.ar.profile.title, 'الملف الشخصي');
  assert.equal(customerHubCopy.en.profile.title, 'Profile');
  assert.equal(customerHubCopy.ar.account.title, 'لوحة العميل');
  assert.equal(customerHubCopy.en.account.title, 'Customer dashboard');
  assert.doesNotMatch(JSON.stringify(customerHubCopy.en), /[\u0600-\u06ff]/u);
  assert.match(JSON.stringify(customerHubCopy.ar), /[\u0600-\u06ff]/u);
});

test('role and status values are localized with truthful unknown fallbacks', () => {
  assert.equal(getCustomerRoleLabel('customer', 'customer', 'ar'), 'عميل');
  assert.equal(getCustomerRoleLabel('customer', 'customer', 'en'), 'Customer');
  assert.equal(getCustomerStatusLabel('active', 'ar'), 'نشط');
  assert.equal(getCustomerStatusLabel('active', 'en'), 'Active');
  assert.equal(getCustomerStatusLabel(null, 'ar'), 'غير معيّن');
  assert.equal(getCustomerStatusLabel(null, 'en'), 'Unassigned');
  assert.equal(getVerificationStatusLabel('Under Review', 'ar'), 'قيد المراجعة');
  assert.equal(getVerificationStatusLabel('Under Review', 'en'), 'Under review');
  assert.equal(getCustomerStatusLabel('manual_check', 'en'), 'Unknown status: Manual check');
});

test('Customer Hub client surfaces bind copy and direction to the authoritative language context', () => {
  for (const file of [
    'components/account/MyDocumentsContent.tsx',
    'components/account/MyProfileContent.tsx',
    'components/account/MyAccountContent.tsx',
  ]) {
    const source = read(file);
    assert.match(source, /useLanguage\(\)/);
    assert.match(source, /dir=\{direction\}/);
    assert.doesNotMatch(source, /dir="rtl"/);
  }

  assert.match(read('app/my-documents/page.tsx'), /<MyDocumentsContent documentsState=\{documentsState\}/);
  assert.match(read('app/my-profile/page.tsx'), /<MyProfileContent customer=\{customer\}/);
  assert.match(read('app/my-account/page.tsx'), /<MyAccountContent/);
});

test('Customer Hub dates are deterministic across server and client rendering', () => {
  const value = '2026-08-31T23:30:00.000-05:00';
  assert.equal(formatCustomerHubDate(value, 'en'), formatCustomerHubDate(value, 'en'));
  assert.equal(formatCustomerHubDate(value, 'ar'), formatCustomerHubDate(value, 'ar'));
  assert.equal(formatCustomerHubDate('invalid', 'en'), '—');
  assert.match(read('lib/i18n/customer-hub.ts'), /timeZone: 'UTC'/);
});
