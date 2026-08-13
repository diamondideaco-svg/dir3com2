'use client';

import { useMemo, useState } from 'react';

type SafeSource = {
  sourceName: string;
  sourceType?: 'internal' | 'web';
  url?: string;
};

type SafePilotResponse = {
  answer?: string;
  sources?: SafeSource[];
  provider?: 'local' | 'openai';
  retrievalMode?: 'internal-rag' | 'openai-web-search';
  groundingStatus?: 'grounded' | 'grounded-global-web' | 'fallback-no-source' | 'fallback-provider-unavailable';
  language?: 'ar' | 'en';
};

function toSafeStatusLabel(payload: SafePilotResponse) {
  if (payload.groundingStatus === 'grounded-global-web') return 'Grounded by global web';
  if (payload.groundingStatus === 'grounded') return 'Grounded by internal sources';
  if (payload.groundingStatus === 'fallback-provider-unavailable') return 'Provider unavailable fallback';
  return 'Fallback without approved source';
}

function safeSourceLabel(source: SafeSource) {
  const label = (source.sourceName || '').trim();
  if (label) {
    return label;
  }
  return source.sourceType === 'web' ? 'Global web source' : 'Approved internal source';
}

export function PilotChatPanel() {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<SafePilotResponse | null>(null);
  const [errorState, setErrorState] = useState<string | null>(null);

  const sources = useMemo(() => {
    if (!Array.isArray(response?.sources)) {
      return [];
    }
    return response.sources.map((source) => safeSourceLabel(source));
  }, [response]);

  async function submitPrompt() {
    const trimmed = message.trim();
    if (!trimmed || loading) {
      return;
    }

    setLoading(true);
    setErrorState(null);
    setResponse(null);

    try {
      const apiResponse = await fetch('/api/ai2/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: trimmed }),
      });

      const payload = (await apiResponse.json().catch(() => ({}))) as SafePilotResponse;

      if (apiResponse.status === 401) {
        setErrorState('يرجى تسجيل الدخول للوصول إلى تجربة المساعد.');
        return;
      }

      if (apiResponse.status === 403) {
        setErrorState('هذا الحساب غير مخوّل حاليًا لاستخدام Pilot AI.');
        return;
      }

      if (apiResponse.status === 429) {
        setErrorState('تم بلوغ حد الطلبات مؤقتًا. يرجى المحاولة بعد قليل.');
        return;
      }

      if (!apiResponse.ok) {
        setErrorState('تعذر إكمال الطلب حاليًا. حاول مرة أخرى لاحقًا.');
        return;
      }

      setResponse({
        answer: payload?.answer,
        provider: payload?.provider,
        retrievalMode: payload?.retrievalMode,
        groundingStatus: payload?.groundingStatus,
        language: payload?.language,
        sources: Array.isArray(payload?.sources)
          ? payload.sources.map((source) => ({
              sourceName: source?.sourceName || '',
              sourceType: source?.sourceType,
              url: source?.url,
            }))
          : [],
      });
    } catch {
      setErrorState('تعذر الاتصال بالخدمة. تحقق من الشبكة ثم أعد المحاولة.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
      <h2 className="text-lg font-semibold text-white">Pilot Assistant</h2>
      <p className="mt-2 text-sm text-slate-300">عرض آمن للرسائل المعتمدة فقط.</p>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="اكتب سؤالك"
          className="w-full rounded-xl border border-white/20 bg-slate-900/70 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
        />
        <button
          type="button"
          onClick={submitPrompt}
          disabled={loading || !message.trim()}
          className="rounded-xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:bg-cyan-900"
        >
          {loading ? 'جاري الإرسال...' : 'إرسال'}
        </button>
      </div>

      {errorState ? (
        <div className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {errorState}
        </div>
      ) : null}

      {response ? (
        <div className="mt-4 space-y-3 rounded-2xl border border-white/10 bg-slate-900/70 p-4">
          <p className="text-sm font-medium text-cyan-200">{toSafeStatusLabel(response)}</p>
          <p className="text-sm leading-6 text-slate-200">{response.answer || 'No safe answer available.'}</p>
          <p className="text-xs text-slate-400">
            Provider: {response.provider || 'local'} | Retrieval: {response.retrievalMode || 'internal-rag'}
          </p>

          {sources.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {response.sources?.map((source) => (
                source.url ? (
                  <a
                    key={`${source.sourceName}-${source.url}`}
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-200"
                  >
                    {safeSourceLabel(source)}
                  </a>
                ) : (
                  <span key={source.sourceName} className="rounded-full border border-white/15 bg-slate-800 px-3 py-1 text-xs text-slate-300">
                    {safeSourceLabel(source)}
                  </span>
                )
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
