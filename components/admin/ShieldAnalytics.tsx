export function ShieldAnalytics() {
  const shields = [
    { label: 'DIR3 Shield', customers: 12, partners: 6, products: 8 },
    { label: 'DIR3 Tactical Shield', customers: 8, partners: 5, products: 5 },
    { label: 'DIR3 Ballistic Shield', customers: 6, partners: 4, products: 4 },
    { label: 'DIR3 Elite Shield', customers: 3, partners: 2, products: 3 },
    { label: 'DIR3 VIP Shield', customers: 2, partners: 1, products: 2 },
  ];

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
      <h3 className="text-lg font-semibold text-white">Shield analytics</h3>
      <div className="mt-4 space-y-2">
        {shields.map((shield) => (
          <div key={shield.label} className="rounded-xl border border-slate-800 px-3 py-2 text-sm text-slate-300">
            <div className="flex items-center justify-between">
              <span>{shield.label}</span>
              <span className="text-slate-400">{shield.customers} customers</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">Partners: {shield.partners} • Products: {shield.products}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
