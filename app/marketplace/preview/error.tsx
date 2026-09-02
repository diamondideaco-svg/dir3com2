'use client';

export default function MarketplacePreviewError({ unstable_retry }: { unstable_retry: () => void }) {
  return (
    <main className="min-h-screen bg-[#faf8f4] px-4 py-16">
      <div className="mx-auto max-w-3xl rounded-[28px] border border-red-200 bg-white p-8 text-[#0d1b2a] shadow-[0_16px_45px_rgba(13,27,42,0.06)]" role="alert">
        <h1 className="text-2xl font-semibold">Provider preview unavailable / معاينة المزوّد غير متاحة</h1>
        <p className="mt-3 text-sm leading-7 text-[#64748b]">No substitute inventory, images, prices, or availability were shown. / لم يتم عرض مخزون أو صور أو أسعار أو توفر بديل.</p>
        <button type="button" onClick={unstable_retry} className="mt-6 min-h-11 rounded-full bg-[#0d1b2a] px-5 py-2 text-sm font-bold text-white">Retry / إعادة المحاولة</button>
      </div>
    </main>
  );
}
