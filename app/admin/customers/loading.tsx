export default function AdminCustomersLoading() {
  return (
    <div className="min-h-screen bg-[#0D1B2A] px-4 py-8 text-white" dir="rtl">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 animate-pulse">
          <div className="h-4 w-28 rounded bg-white/10" />
          <div className="mt-3 h-8 w-60 rounded bg-white/10" />
        </div>
        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-6 animate-pulse">
            <div className="h-10 rounded bg-white/10" />
            <div className="mt-3 h-10 rounded bg-white/10" />
            <div className="mt-3 h-10 rounded bg-white/10" />
          </div>
          <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-6 animate-pulse">
            <div className="h-10 rounded bg-white/10" />
            <div className="mt-3 h-10 rounded bg-white/10" />
            <div className="mt-3 h-10 rounded bg-white/10" />
          </div>
        </div>
      </div>
    </div>
  );
}
