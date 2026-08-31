import type { SessionRole } from '@/lib/auth/identity-contract';
import type { AppLanguage } from '@/lib/i18n/config';

export const customerHubCopy = {
  ar: {
    account: {
      eyebrow: 'حسابي',
      title: 'لوحة العميل',
      bookings: 'حجوزاتي',
      wallet: 'محفظتي',
      documents: 'مستنداتي',
      profile: 'ملفي',
      defaultCustomer: 'عميل dir3com',
      accountStatus: 'حالة الحساب',
      joinedAt: 'تاريخ الانضمام',
      manageBookings: 'إدارة الحجوزات',
      viewBookings: 'عرض الحجوزات',
      accountDocuments: 'مستندات الحساب',
      viewDocuments: 'عرض المستندات',
    },
    documents: {
      eyebrow: 'مستنداتي',
      title: 'المستندات',
      back: 'العودة',
      error: 'تعذر تحميل مستنداتك حالياً. حاول مرة أخرى لاحقاً، أو تواصل مع الدعم إذا استمرت المشكلة.',
      empty: 'لا توجد مستندات مرتبطة بحسابك حالياً.',
      expiryDate: 'تاريخ الانتهاء',
      notSpecified: 'غير محدد',
    },
    profile: {
      eyebrow: 'ملفي',
      title: 'الملف الشخصي',
      back: 'العودة',
      name: 'الاسم',
      email: 'البريد الإلكتروني',
      phone: 'الهاتف',
      role: 'الدور',
      status: 'الحالة',
      updatedAt: 'آخر تحديث',
      empty: 'لم يتم العثور على ملف شخصي مرتبط بحسابك بعد.',
    },
    unknownRole: 'دور غير معروف',
    unknownStatus: 'حالة غير معروفة',
  },
  en: {
    account: {
      eyebrow: 'My account',
      title: 'Customer dashboard',
      bookings: 'My bookings',
      wallet: 'My wallet',
      documents: 'My documents',
      profile: 'My profile',
      defaultCustomer: 'dir3com customer',
      accountStatus: 'Account status',
      joinedAt: 'Joined',
      manageBookings: 'Manage bookings',
      viewBookings: 'View bookings',
      accountDocuments: 'Account documents',
      viewDocuments: 'View documents',
    },
    documents: {
      eyebrow: 'My documents',
      title: 'Documents',
      back: 'Back',
      error: 'We could not load your documents right now. Try again later, or contact support if the problem continues.',
      empty: 'There are no documents linked to your account yet.',
      expiryDate: 'Expiry date',
      notSpecified: 'Not specified',
    },
    profile: {
      eyebrow: 'My profile',
      title: 'Profile',
      back: 'Back',
      name: 'Name',
      email: 'Email',
      phone: 'Phone',
      role: 'Role',
      status: 'Status',
      updatedAt: 'Last updated',
      empty: 'No profile is linked to your account yet.',
    },
    unknownRole: 'Unknown role',
    unknownStatus: 'Unknown status',
  },
} as const;

const roleLabels: Record<AppLanguage, Record<SessionRole | 'unassigned', string>> = {
  ar: { customer: 'عميل', admin: 'مسؤول', partner: 'شريك', staff: 'موظف', unassigned: 'غير معيّن' },
  en: { customer: 'Customer', admin: 'Admin', partner: 'Partner', staff: 'Staff', unassigned: 'Unassigned' },
};

const statusLabels: Record<AppLanguage, Record<string, string>> = {
  ar: {
    active: 'نشط',
    pending: 'قيد الانتظار',
    approved: 'معتمد',
    rejected: 'مرفوض',
    verified: 'موثّق',
    unverified: 'غير موثّق',
    unassigned: 'غير معيّن',
    under_review: 'قيد المراجعة',
    expired: 'منتهي',
    suspended: 'موقوف',
  },
  en: {
    active: 'Active',
    pending: 'Pending',
    approved: 'Approved',
    rejected: 'Rejected',
    verified: 'Verified',
    unverified: 'Unverified',
    unassigned: 'Unassigned',
    under_review: 'Under review',
    expired: 'Expired',
    suspended: 'Suspended',
  },
};

function normalizedEnumKey(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/[\s-]+/g, '_') ?? '';
}

function humanizeUnknown(value: string | null | undefined) {
  const cleaned = value?.trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ') ?? '';
  if (!cleaned) return '';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function getCustomerRoleLabel(
  role: SessionRole | null,
  roleRaw: string | null | undefined,
  language: AppLanguage,
) {
  if (role) return roleLabels[language][role];
  const normalizedRawRole = normalizedEnumKey(roleRaw);
  if (normalizedRawRole === 'unassigned' || !normalizedRawRole) return roleLabels[language].unassigned;
  return `${customerHubCopy[language].unknownRole}: ${humanizeUnknown(roleRaw)}`;
}

export function getCustomerStatusLabel(status: string | null | undefined, language: AppLanguage) {
  const key = normalizedEnumKey(status) || 'unassigned';
  return statusLabels[language][key] ?? `${customerHubCopy[language].unknownStatus}: ${humanizeUnknown(status)}`;
}

export function getVerificationStatusLabel(status: string | null | undefined, language: AppLanguage) {
  return getCustomerStatusLabel(status, language);
}

export function formatCustomerHubDate(value: string | null | undefined, language: AppLanguage) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(language === 'ar' ? 'ar-SA' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}
