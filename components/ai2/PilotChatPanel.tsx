'use client';

import { useMemo, useState } from 'react';

type SafeSource = {
  sourceName?: string;
};

type SafeHandoff = {
  safeSummary?: string | null;
};

type SafePilotResponse = {
  status?: 'ok' | 'rejected' | 'unavailable' | 'error';
  message?: string;
  data?: {
    clarificationNeeded?: boolean;
  } | null;
  sources?: SafeSource[];
  handoff?: SafeHandoff;
};

function toSafeStatusLabel(status: SafePilotResponse['status']) {
  if (status === 'ok') return 'Completed safely';
  if (status === 'rejected') return 'Rejected by safety controls';
  if (status === 'unavailable') return 'Temporarily unavailable';
  return 'Unable to process now';
}

function safeSourceLabel(source: SafeSource) {
  if (source.sourceName) {
    return source.sourceName;
  }
  return 'Approved source';
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
        status: payload?.status,
        message: payload?.message,
        data: payload?.data && typeof payload.data === 'object'
          ? { clarificationNeeded: Boolean((payload.data as { clarificationNeeded?: boolean }).clarificationNeeded) }
          : null,
        handoff: {
          safeSummary: payload?.handoff?.safeSummary ?? null,
        },
        sources: Array.isArray(payload?.sources)
          ? payload.sources.map((source) => ({
              sourceName: source?.sourceName,
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
          <p className="text-sm font-medium text-cyan-200">{toSafeStatusLabel(response.status)}</p>
          <p className="text-sm leading-6 text-slate-200">{response.message || 'No safe message available.'}</p>

          {response.data?.clarificationNeeded ? (
            <p className="text-xs text-slate-300">This response needs clarification before continuing.</p>
          ) : null}

          {response.handoff?.safeSummary ? (
            <p className="text-xs text-slate-300">{response.handoff.safeSummary}</p>
          ) : null}

          {sources.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {sources.map((label) => (
                <span key={label} className="rounded-full border border-white/15 bg-slate-800 px-3 py-1 text-xs text-slate-300">
                  {label}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
