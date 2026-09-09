export const productResultMessages: Record<string, { ar: string; en: string }> = {
  created: { ar: 'تم إنشاء المنتج كمسودة بنجاح.', en: 'Product created as a draft successfully.' },
  updated: { ar: 'تم حفظ المسودة بنجاح.', en: 'Draft saved successfully.' },
  published: { ar: 'تم نشر المنتج بنجاح.', en: 'Product published successfully.' },
  unpublished: { ar: 'تم إلغاء نشر المنتج وإعادته لمسودة.', en: 'Product unpublished and returned to draft.' },
  archived: { ar: 'تمت أرشفة المنتج مع الحفاظ على السجل التاريخي.', en: 'Product archived; history is preserved.' },
  publish_blocked: {
    ar: 'لم يتم نشر المنتج لأن بيانات الجاهزية التشغيلية غير مكتملة أو غير موثّقة. راجع سبب الحظر الظاهر بجانب إجراءات المنتج ثم عدّل المسودة.',
    en: 'The product was not published because operational readiness is incomplete or unverified. Review the blocker shown beside the product actions, then update the draft.',
  },
};

const expectedPublishBlocks = new Set([
  'PRODUCT_SYNTHETIC_BLOCKED',
  'PRODUCT_ENVIRONMENT_BLOCKED',
  'PRODUCT_FAMILY_REQUIRED',
  'PRODUCT_SUPPLY_NOT_AUTHORITATIVE',
  'PRODUCT_SUPPLIER_NOT_VERIFIED',
  'PRODUCT_TRANSACTION_PATH_UNSUPPORTED',
  'PRODUCT_INSTANT_SUPPLY_UNPROVEN',
  'PRODUCT_COUNTRY_REQUIRED',
  'COUNTRY_SCOPE_FORBIDDEN',
  'OPERATIONAL_ACCESS_DENIED',
]);

export function isExpectedPublishBlock(error: { message?: string } | null): boolean {
  return Boolean(error?.message && expectedPublishBlocks.has(error.message));
}

export function isProductVersionConflict(error: { message?: string } | null): boolean {
  return error?.message === 'PRODUCT_VERSION_STALE';
}

export const productConflictMessage = {
  ar: 'تغيّر المنتج منذ فتح هذه الصفحة. لم تُحفظ هذه المحاولة. راجع النسخة الحالية قبل إجراء تعديل جديد.',
  en: 'This product changed since you opened the page. This attempt was not saved. Review the current version before making a new change.',
};
