export const DABRA_CHAT_STREAM_CONTENT_TYPE = 'text/plain; charset=utf-8';
export const DABRA_CHAT_STREAM_CONTRACT_HEADER = 'X-DABRA-Response-Contract';
export const DABRA_CHAT_STREAM_CONTRACT_VERSION = 'assistant-text-v1';
export const DABRA_SAFE_EMPTY_ANSWER = 'خلني أرتبها لك بطريقة أوضح. وش تفضّل يكون الأولوية؟';
export const DABRA_SAFE_CHAT_ERROR = 'ما قدرت أوصل للمساعد الآن، لكن نقدر نكمل اختياراتك من السوق مباشرة.';

type AssistantPayload = { answer?: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function approvedAssistantAnswer(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  const answer = (payload as AssistantPayload).answer;
  if (typeof answer !== 'string') return null;
  const trimmed = answer.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function createDabraAssistantTextResponse(
  payload: unknown,
  options: { status?: number; fallback?: string } = {},
): Response {
  const answer = approvedAssistantAnswer(payload) ?? options.fallback ?? DABRA_SAFE_EMPTY_ANSWER;
  const encoder = new TextEncoder();
  const chunks = answer.match(/.{1,24}(?:\s|$)|.{1,24}/gu) ?? [answer];
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });

  return new Response(stream, {
    status: options.status ?? 200,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': DABRA_CHAT_STREAM_CONTENT_TYPE,
      [DABRA_CHAT_STREAM_CONTRACT_HEADER]: DABRA_CHAT_STREAM_CONTRACT_VERSION,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function safeAnswerFromJsonText(raw: string, fallback = DABRA_SAFE_EMPTY_ANSWER): string {
  try {
    return approvedAssistantAnswer(JSON.parse(raw)) ?? fallback;
  } catch {
    return fallback;
  }
}

export async function consumeDabraChatResponse(
  response: Response,
  onVisibleText: (answer: string) => void,
  fallback = DABRA_SAFE_EMPTY_ANSWER,
): Promise<string> {
  if (!response.ok) throw new Error(`DABRA chat request failed (${response.status})`);

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (contentType.includes('application/json')) {
    const raw = await response.text();
    const answer = safeAnswerFromJsonText(raw, fallback);
    onVisibleText(answer);
    return answer;
  }

  const streamContract = response.headers.get(DABRA_CHAT_STREAM_CONTRACT_HEADER);
  if (
    !contentType.startsWith('text/plain')
    || streamContract !== DABRA_CHAT_STREAM_CONTRACT_VERSION
    || !response.body
  ) {
    onVisibleText(fallback);
    return fallback;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let raw = '';
  let plainTextConfirmed = false;
  let looksLikeEnvelope = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    raw += decoder.decode(value, { stream: true });
    if (!plainTextConfirmed && !looksLikeEnvelope) {
      const firstVisibleCharacter = raw.trimStart()[0];
      if (firstVisibleCharacter === '{' || firstVisibleCharacter === '[') looksLikeEnvelope = true;
      else if (firstVisibleCharacter) plainTextConfirmed = true;
    }
    if (plainTextConfirmed) onVisibleText(raw);
  }
  raw += decoder.decode();

  const answer = looksLikeEnvelope
    ? safeAnswerFromJsonText(raw, fallback)
    : raw.trim() || fallback;
  onVisibleText(answer);
  return answer;
}
