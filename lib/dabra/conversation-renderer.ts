import { AI2_DABRA_CONVERSATION_COPY, AI2_DABRA_PROMPT_VERSION } from '../ai2/prompt/contract';

export type ReplyLocale = 'ar' | 'en';
export type ReplyTurn = { role: 'user' | 'assistant'; content: string };
/** Constructed by server tools only, never from provider or history assertions. */
export type ServerReplySegment =
  | { kind: 'fact'; text: string }
  | { kind: 'link'; label: string; href: string };

export function serverReplySegments() {
  const segments: ServerReplySegment[] = [];
  return {
    segments,
    get length() { return segments.length; },
    push(...values: Array<string | ServerReplySegment>) {
      segments.push(...values.map(value => typeof value === 'string' ? { kind: 'fact' as const, text: value } : value));
    },
  };
}

export function serverReplyLink(label: string, href: string): ServerReplySegment {
  return { kind: 'link', label, href };
}

export const PLATFORM_CHARACTER_VERSION = AI2_DABRA_PROMPT_VERSION;

/** Exact bounded small-talk recognition; this is not an NLU/model replacement. */
export function conversationReply(message: string, history: ReplyTurn[], locale: ReplyLocale) {
  const text = message.normalize('NFKC').replace(/[\u064b-\u065f\u0670\u0640]/g, '').trim().toLowerCase().replace(/[!?.،؟]+$/g, '').trim();
  const copy = AI2_DABRA_CONVERSATION_COPY[locale];
  if (/^(?:thanks|thank you|شكرا|شكراً|مشكور|تسلم)$/.test(text)) return copy.thanks;
  if (/^(?:hi|hello|hey|good morning|good evening|مرحبا|هلا|اهلا|أهلا|السلام عليكم|صباح الخير|مساء الخير)$/.test(text)) {
    // Presence is used only to suppress introduction, never as verified facts or memory.
    return history.slice(-8).some(turn => turn.role === 'assistant') ? copy.greeting : `${copy.identity}\n${copy.greeting}`;
  }
  return null;
}

/** Facts and links are serialized verbatim; only server-selected conversational copy is added. */
export function renderServerReply(segments: readonly ServerReplySegment[], locale: ReplyLocale, message: string, outcome: 'read_only' | 'unavailable' = 'read_only') {
  const copy = AI2_DABRA_CONVERSATION_COPY[locale];
  const lines = segments.map(segment => segment.kind === 'fact' ? segment.text : `[${segment.label}](${segment.href})`);
  // Retain existing platform link wire format so Web actions and streaming stay compatible.
  // No execution-success branch exists: this path can only read or provide guidance.
  if (outcome === 'unavailable') lines.unshift(copy.unavailable);
  else if (/\b(?:anxious|worried|scared)\b|قلقان|خايف|خائف|متوتر/.test(message.toLowerCase())) lines.unshift(copy.anxiety);
  return lines.join('\n\n');
}
