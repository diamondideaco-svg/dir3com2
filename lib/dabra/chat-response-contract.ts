export const DABRA_CHAT_STREAM_CONTENT_TYPE = 'text/plain; charset=utf-8';
export const DABRA_CHAT_STREAM_CONTRACT_HEADER = 'X-DABRA-Response-Contract';
export const DABRA_CHAT_STREAM_CONTRACT_VERSION = 'assistant-text-v1';
export const DABRA_CHAT_ANSWER_BYTES_HEADER = 'X-DABRA-Answer-Bytes';
const MAX_ANSWER_BYTES = 256000; // Bounded UTF-8 bytes, independent of HTTP compression.
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
  const chunks = answer.match(/[\s\S]{1,24}/gu) ?? [answer];
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
      [DABRA_CHAT_ANSWER_BYTES_HEADER]: String(encoder.encode(answer).byteLength),
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function safeAnswerFromJsonText(raw: string, fallback = DABRA_SAFE_EMPTY_ANSWER, onInvalidTransport?: () => void): string {
  try {
    const answer = approvedAssistantAnswer(JSON.parse(raw));
    if (answer) return answer;
  } catch { /* An HTTP200 body does not prove a delivered answer. */ }
  onInvalidTransport?.();
  return fallback;
}

export async function consumeDabraChatResponse(
  response: Response,
  onVisibleText: (answer: string) => void,
  fallback = DABRA_SAFE_EMPTY_ANSWER,
  onInvalidTransport?: () => void,
): Promise<string> {
  if (!response.ok) throw new Error(`DABRA chat request failed (${response.status})`);

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (contentType.includes('application/json')) {
    const raw = await response.text();
    const answer = safeAnswerFromJsonText(raw, fallback, onInvalidTransport);
    onVisibleText(answer);
    return answer;
  }

  const streamContract = response.headers.get(DABRA_CHAT_STREAM_CONTRACT_HEADER);
  const byteHeader = response.headers.get(DABRA_CHAT_ANSWER_BYTES_HEADER) ?? '';
  const expectedBytes = /^[1-9][0-9]{0,5}$/.test(byteHeader) ? Number(byteHeader) : NaN;
  if (
    !contentType.startsWith('text/plain')
    || streamContract !== DABRA_CHAT_STREAM_CONTRACT_VERSION
    || !response.body
    || !Number.isSafeInteger(expectedBytes) || expectedBytes <= 0 || expectedBytes > MAX_ANSWER_BYTES
  ) {
    onInvalidTransport?.();
    onVisibleText(fallback);
    return fallback;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let raw = '';
  let receivedBytes = 0;
  let plainTextConfirmed = false;
  let looksLikeEnvelope = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    receivedBytes += value.byteLength;
    if (receivedBytes > expectedBytes || receivedBytes > MAX_ANSWER_BYTES) {
      // Cancel immediately without waiting on a source that ignores cancellation.
      void reader.cancel().catch(() => {});
      onInvalidTransport?.();
      onVisibleText(fallback);
      return fallback;
    }
    raw += decoder.decode(value, { stream: true });
    if (!plainTextConfirmed && !looksLikeEnvelope) {
      const firstVisibleCharacter = raw.trimStart()[0];
      if (firstVisibleCharacter === '{' || firstVisibleCharacter === '[') looksLikeEnvelope = true;
      else if (firstVisibleCharacter) plainTextConfirmed = true;
    }
    if (plainTextConfirmed) onVisibleText(raw);
  }
  raw += decoder.decode();
  if (receivedBytes !== expectedBytes) {
    onInvalidTransport?.();
    onVisibleText(fallback);
    return fallback;
  }

  let answer = looksLikeEnvelope ? safeAnswerFromJsonText(raw, fallback, onInvalidTransport) : raw.trim();
  if (!answer) { onInvalidTransport?.(); answer = fallback; }
  onVisibleText(answer);
  return answer;
}
