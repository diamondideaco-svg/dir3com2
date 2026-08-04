import { buildAiFoundationSnapshot } from '@/lib/ai/foundation';

export default function AiPilotPage() {
  const foundation = buildAiFoundationSnapshot();

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <div className="mx-auto max-w-4xl space-y-8">
        <section className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl shadow-cyan-950/30">
          <p className="text-sm uppercase tracking-[0.35em] text-cyan-300">AI Foundation Pilot</p>
          <h1 className="mt-3 text-4xl font-semibold">DABRA foundation online for controlled pilot use</h1>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-300">
            This surface exposes the smallest approved AI slice only. It does not enable bookings,
            payments, long-term memory, tool calling, or production AI.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-5">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Assistant</p>
            <p className="mt-2 text-2xl font-medium text-white">{foundation.assistant}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-5">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Pilot Scope</p>
            <p className="mt-2 text-2xl font-medium text-white">{foundation.pilotScope}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-5">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Production AI</p>
            <p className="mt-2 text-2xl font-medium text-rose-300">{foundation.secretStatus.productionAiAllowed ? 'ALLOWED' : 'BLOCKED'}</p>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-semibold text-white">System Prompt</h2>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-300">{foundation.systemPrompt}</p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-semibold text-white">Knowledge Base</h2>
            <div className="mt-4 space-y-4">
              {foundation.knowledgeBase.map((item) => (
                <article key={item.id} className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                  <p className="text-sm font-medium text-cyan-200">{item.title}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{item.summary}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-6">
          <h2 className="text-lg font-semibold text-white">Secret Protection</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs uppercase tracking-[0.3em] text-slate-500">Provider configured</dt>
              <dd className="mt-2 text-sm text-slate-200">{foundation.secretStatus.providerConfigured ? 'YES' : 'NO'}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.3em] text-slate-500">Provider name</dt>
              <dd className="mt-2 text-sm text-slate-200">{foundation.secretStatus.providerName}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.3em] text-slate-500">Version</dt>
              <dd className="mt-2 text-sm text-slate-200">{foundation.version}</dd>
            </div>
          </dl>
        </section>
      </div>
    </main>
  );
}
