'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';

type ChatSource = {
  sourceId: string;
  sourceName: string;
  language: 'ar' | 'en' | 'bilingual';
  updateState: 'approved';
};

type ChatResponse = {
  answer: string;
  sources: ChatSource[];
  language: 'ar' | 'en';
  groundingStatus: 'grounded' | 'fallback-no-source' | 'fallback-provider-unavailable';
};

type ChatMessage = {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  language?: 'ar' | 'en';
  groundingStatus?: ChatResponse['groundingStatus'];
  sources?: ChatSource[];
};

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: 'welcome',
    role: 'assistant',
    text: 'Ask in Arabic or English. I will answer only from the approved DIR3COM registry and stay inside the controlled pilot scope.',
    language: 'en',
    groundingStatus: 'grounded',
    sources: [],
  },
];

const STATUS_LABELS: Record<ChatResponse['groundingStatus'], string> = {
  grounded: 'Grounded',
  'fallback-no-source': 'Fallback: no source',
  'fallback-provider-unavailable': 'Fallback: provider unavailable',
};

export default function AiPilotPage() {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const message = draft.trim();

    if (!message || isSending) {
      return;
    }

    const userMessage: ChatMessage = {
      id: `${Date.now()}-user`,
      role: 'user',
      text: message,
    };

    setMessages((current) => [...current, userMessage]);
    setDraft('');
    setIsSending(true);

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message }),
      });

      const data = (await response.json()) as Partial<ChatResponse> & { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? 'Chat endpoint failed.');
      }

      setMessages((current) => [
        ...current,
        {
          id: `${Date.now()}-assistant`,
          role: 'assistant',
          text: data.answer ?? 'No response returned.',
          language: data.language,
          groundingStatus: data.groundingStatus,
          sources: data.sources ?? [],
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: `${Date.now()}-error`,
          role: 'assistant',
          text: error instanceof Error ? error.message : 'Chat unavailable right now.',
          language: 'en',
          groundingStatus: 'fallback-no-source',
          sources: [],
        },
      ]);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.18),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(14,165,233,0.18),_transparent_24%),linear-gradient(180deg,_#07111f_0%,_#030712_100%)] px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-7xl gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-[2rem] border border-white/10 bg-white/6 p-6 shadow-2xl shadow-cyan-950/20 backdrop-blur xl:p-8">
          <div className="space-y-6">
            <div>
              <p className="text-xs uppercase tracking-[0.45em] text-cyan-300">AI Controlled Pilot</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                DABRA chat, grounded in approved DIR3COM sources only
              </h1>
              <p className="mt-4 max-w-xl text-sm leading-7 text-slate-300">
                This pilot keeps memory inside the current session, avoids vector search and open-web retrieval,
                and returns the sources used with every grounded answer.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              {[
                'Approved sources only',
                'No vector database',
                'No open-web retrieval',
                'No long-term memory',
              ].map((item) => (
                <div key={item} className="rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm text-slate-200">
                  {item}
                </div>
              ))}
            </div>

            <div className="rounded-[1.75rem] border border-emerald-400/20 bg-emerald-400/10 p-5 text-sm leading-6 text-emerald-50">
              <p className="font-medium text-white">Fallback rule</p>
              <p className="mt-2 text-emerald-50/90">
                If a question is not covered by the approved registry, the endpoint says so clearly instead of guessing.
              </p>
            </div>

            <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-5">
              <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Session only</p>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                The conversation state lives only in this browser session. No persistent memory, no tool calling, and no
                production AI path are enabled in this slice.
              </p>
            </div>
          </div>
        </section>

        <section className="flex min-h-[680px] flex-col rounded-[2rem] border border-white/10 bg-slate-950/80 shadow-2xl shadow-slate-950/50 backdrop-blur">
          <header className="border-b border-white/10 px-5 py-4 sm:px-6">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.4em] text-cyan-300">DABRA</p>
                <h2 className="mt-2 text-xl font-semibold text-white">Controlled chat interface</h2>
              </div>
              <div className="ml-auto flex flex-wrap gap-2">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">Registry-only</span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">Arabic + English</span>
              </div>
            </div>
          </header>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
            {messages.map((message) => (
              <article key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[92%] rounded-[1.5rem] border px-4 py-3 shadow-lg sm:max-w-[80%] ${
                    message.role === 'user'
                      ? 'border-cyan-400/20 bg-cyan-400/15 text-white'
                      : 'border-white/10 bg-white/6 text-slate-100'
                  }`}
                >
                  <p className="whitespace-pre-wrap text-sm leading-6">{message.text}</p>

                  {message.role === 'assistant' ? (
                    <div className="mt-3 space-y-3 border-t border-white/10 pt-3">
                      <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.3em] text-slate-400">
                        <span>{STATUS_LABELS[message.groundingStatus ?? 'grounded']}</span>
                        {message.language ? <span>{message.language === 'ar' ? 'Arabic' : 'English'}</span> : null}
                      </div>

                      {message.sources && message.sources.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {message.sources.map((source) => (
                            <span
                              key={source.sourceId}
                              className="rounded-full border border-white/10 bg-slate-900/70 px-3 py-1 text-[11px] text-slate-200"
                            >
                              {source.sourceName} · {source.updateState}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </article>
            ))}
            <div ref={bottomRef} />
          </div>

          <form onSubmit={handleSubmit} className="border-t border-white/10 p-4 sm:p-5">
            <label className="sr-only" htmlFor="ai-message">
              Message
            </label>
            <textarea
              id="ai-message"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={4}
              placeholder="Ask about approved DIR3COM scope, grounding, source attribution, or the controlled pilot rules..."
              className="w-full resize-none rounded-[1.5rem] border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/40 focus:ring-2 focus:ring-cyan-400/20"
            />

            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-xs leading-5 text-slate-500">
                The response is returned from the server and stays inside the current session only.
              </p>
              <button
                type="submit"
                disabled={isSending || draft.trim().length === 0}
                className="inline-flex items-center justify-center rounded-full bg-cyan-400 px-5 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
              >
                {isSending ? 'Sending...' : 'Send'}
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
