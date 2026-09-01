export default function MarketplacePreviewLoading() {
  return (
    <main className="min-h-screen bg-[#faf8f4] px-4 py-16" aria-busy="true">
      <div className="mx-auto max-w-7xl rounded-[28px] border border-[#d4af37]/25 bg-white p-8 text-[#0d1b2a] shadow-[0_16px_45px_rgba(13,27,42,0.06)]" role="status" aria-live="polite">
        <p className="font-semibold">Loading provider results… / جاري تحميل نتائج المزوّد…</p>
        <p className="mt-2 text-sm text-[#64748b]">No inventory or availability is asserted until the provider response completes.</p>
      </div>
    </main>
  );
}
