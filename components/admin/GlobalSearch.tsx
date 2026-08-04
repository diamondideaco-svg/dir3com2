import { runGlobalSearch } from '@/lib/integration/search-engine';

export async function GlobalSearch({ query }: { query: string }) {
  const results = await runGlobalSearch(query);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
      <h3 className="text-lg font-semibold text-white">Global search</h3>
      {!query ? (
        <p className="mt-2 text-sm text-slate-500">Enter a customer, booking, product, or partner name.</p>
      ) : results.groups.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">No results found.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {results.groups.map((group) => (
            <div key={group.key}>
              <p className="text-sm font-medium text-slate-300">{group.title}</p>
              <div className="mt-2 space-y-2">
                {group.items.map((item: Record<string, unknown>, index: number) => {
                  const label = [
                    item.full_name,
                    item.company_name,
                    item.name,
                    item.booking_reference,
                    item.name_en,
                    item.request_type,
                  ].filter((value): value is string => typeof value === 'string' && value.length > 0);

                  return (
                    <div key={`${group.key}-${index}`} className="rounded-xl border border-slate-800 px-3 py-2 text-sm text-slate-400">
                      {label[0] ?? JSON.stringify(item)}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
