export const productResultMessages: Record<string, { ar: string; en: string }> = {
  created: { ar: 'تم إنشاء المنتج كمسودة بنجاح.', en: 'Product created as a draft successfully.' },
  updated: { ar: 'تم حفظ المسودة بنجاح.', en: 'Draft saved successfully.' },
  published: { ar: 'تم نشر المنتج بنجاح.', en: 'Product published successfully.' },
  unpublished: { ar: 'تم إلغاء نشر المنتج وإعادته لمسودة.', en: 'Product unpublished and returned to draft.' },
  archived: { ar: 'تمت أرشفة المنتج مع الحفاظ على السجل التاريخي.', en: 'Product archived; history is preserved.' },
};

export function isProductVersionConflict(error: { message?: string } | null): boolean {
  return error?.message === 'PRODUCT_VERSION_STALE';
}

export const productConflictMessage = {
  ar: 'تغيّر المنتج منذ فتح هذه الصفحة. لم تُحفظ هذه المحاولة. راجع النسخة الحالية قبل إجراء تعديل جديد.',
  en: 'This product changed since you opened the page. This attempt was not saved. Review the current version before making a new change.',
};
