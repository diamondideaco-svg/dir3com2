export default function AdminAssignmentLoading() {
  return (
    <div className="min-h-screen bg-[#0D1B2A] px-4 py-8 text-white" dir="rtl">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 animate-pulse">
          <div className="h-4 w-40 rounded bg-white/10" />
          <div className="mt-3 h-8 w-64 rounded bg-white/10" />
        </div>
        <div className="space-y-4">
          <div className="h-32 rounded-[1.5rem] border border-white/10 bg-white/5" />
          <div className="h-32 rounded-[1.5rem] border border-white/10 bg-white/5" />
        </div>
      </div>
    </div>
  );
}