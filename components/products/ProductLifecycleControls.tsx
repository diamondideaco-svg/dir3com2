'use client';

import Link from 'next/link';
import { archiveProductAction, publishProductAction, unpublishProductAction } from '@/lib/actions/product-actions';
import { useLanguage } from '@/components/i18n/LanguageProvider';

type Props = {
  id: string;
  slug: string;
  status: string;
  lifecycleVersion?: number | null;
};

export default function ProductLifecycleControls({ id, slug, status, lifecycleVersion }: Props) {
  const { language } = useLanguage();
  const ar = language === 'ar';
  const active = Number.isInteger(lifecycleVersion) && Number(lifecycleVersion) > 0;

  const confirmAction = (messageAr: string, messageEn: string) => (event: React.FormEvent<HTMLFormElement>) => {
    if (!window.confirm(ar ? messageAr : messageEn)) event.preventDefault();
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={`/admin/products/${encodeURIComponent(id)}`} className="min-h-10 rounded-full border border-[color:var(--color-border)] px-3 py-2 text-xs font-semibold text-[var(--color-navy)] hover:border-[#D4AF37]">
        {ar ? 'تعديل' : 'Edit'}
      </Link>
      <Link href={`/admin/products/${encodeURIComponent(id)}/preview`} className="min-h-10 rounded-full border border-[color:var(--color-border)] px-3 py-2 text-xs font-semibold text-[var(--color-navy)] hover:border-[#D4AF37]">
        {ar ? 'معاينة' : 'Preview'}
      </Link>

      {status === 'draft' ? (
        <form action={publishProductAction} onSubmit={confirmAction('نشر هذا المنتج في السوق؟', 'Publish this product to the Marketplace?')}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="expectedVersion" value={lifecycleVersion ?? ''} />
          <button disabled={!active} className="min-h-10 rounded-full bg-[#D4AF37] px-3 py-2 text-xs font-bold text-[#0D1B2A] disabled:cursor-not-allowed disabled:opacity-45">
            {ar ? 'نشر' : 'Publish'}
          </button>
        </form>
      ) : status === 'published' ? (
        <form action={unpublishProductAction} onSubmit={confirmAction('إلغاء نشر هذا المنتج وإعادته لمسودة؟', 'Unpublish this product and return it to draft?')}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="expectedVersion" value={lifecycleVersion ?? ''} />
          <button disabled={!active} className="min-h-10 rounded-full border border-[#D4AF37] px-3 py-2 text-xs font-bold text-[#8B6516] disabled:cursor-not-allowed disabled:opacity-45">
            {ar ? 'إلغاء النشر' : 'Unpublish'}
          </button>
        </form>
      ) : null}

      <form action={archiveProductAction} onSubmit={confirmAction('أرشفة المنتج؟ سيختفي من التشغيل اليومي مع بقاء السجل التاريخي.', 'Archive this product? It will leave daily operations while history is preserved.')}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="expectedVersion" value={lifecycleVersion ?? ''} />
        <button disabled={!active} className="min-h-10 rounded-full border border-red-300 px-3 py-2 text-xs font-semibold text-red-700 disabled:cursor-not-allowed disabled:opacity-45">
          {ar ? 'أرشفة' : 'Archive'}
        </button>
      </form>

      {!active ? (
        <span className="text-[11px] text-amber-700" role="status">
          {ar ? 'تفعيل دورة الحياة مطلوب' : 'Lifecycle activation required'}
        </span>
      ) : null}
      <span className="sr-only">{slug}</span>
    </div>
  );
}
