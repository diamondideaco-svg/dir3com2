import { AI2_DABRA_CONVERSATION_COPY, AI2_DABRA_PROMPT_VERSION } from '../ai2/prompt/contract';

/* Server-only metadata survives object spread; JSON wire serialization ignores symbol keys. */
export const CORE_REQUIRED_DIALOGUE_UNITS = Symbol('dabra-core-required-dialogue-units');
export function coreRequiredDialogueUnits(reply: object): readonly string[] {
  const units: unknown = Reflect.get(reply, CORE_REQUIRED_DIALOGUE_UNITS);
  return Array.isArray(units) && units.every((unit: unknown): unit is string => typeof unit === 'string') ? units : [];
}

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

/** Current-turn dialogue takes precedence over inherited catalogue preferences. */
export function conversationIntent(message: string) {
  const text = message.normalize('NFKC').replace(/[\u064b-\u065f\u0670\u0640]/g, '').toLowerCase().replace(/[أإآ]/g, 'ا').trim().replace(/[!?.؟]+$/g, '').trim();
  if (/^(?:who are you|what is your name|مين انت|من انت|اسمك ايه|شو اسمك)$/.test(text)) return 'identity';
  if (/^(?:how are you|كيف حالك|كيفك|عامل ايه|شلونك)$/.test(text)) return 'social';
  if (/^(?:why (?:do you|are you) (?:keep )?repeating(?: yourself| the same (?:answer|reply))?|ليش بتكرر نفس الرد|ليه بتكرر نفس الرد|ليش تكرر نفس الرد)$/.test(text)) return 'repair';
  if (/^(?:explain(?: that| it)?(?: to me)?|طيب فهمني|فهمني|وضح لي)$/.test(text)) return 'explain';
  if (/^(?:(?:stop|drop|forget) (?:the )?(?:hotel|car|trip|previous) (?:topic|discussion)|stop talking about (?:the )?(?:hotel|car|trip)|وقف موضوع (?:الفندق|السيارة|الرحلة)|خلص موضوع (?:الفندق|السيارة|الرحلة)|غير الموضوع|i am asking something else|let[’']?s change the subject)$/.test(text)) return 'topic_change';
  return null;
}

/** Exact bounded small-talk recognition; this is not an NLU/model replacement. */
export function conversationReply(message: string, history: ReplyTurn[], locale: ReplyLocale) {
  const text = message.normalize('NFKC').replace(/[\u064b-\u065f\u0670\u0640]/g, '').trim().toLowerCase().replace(/[!?.،؟]+$/g, '').trim();
  const copy = AI2_DABRA_CONVERSATION_COPY[locale];
  const intent = conversationIntent(message), ar = locale === 'ar';
  if (intent === 'identity') return copy.identity;
  if (intent === 'social') return ar ? 'أنا جاهزة أساعدك. كيف أقدر أخدمك اليوم؟' : 'I am ready to help. What would you like to work on today?';
  if (intent === 'repair') return ar ? 'معك حق، ردي السابق لم يتابع سؤالك. اكتب النقطة التي تريدها وسأركز عليها بدل تكرار عرض الخدمة.' : 'You are right: my last reply did not address your question. Tell me the point you want to discuss and I will focus on it instead of repeating the service overview.';
  if (intent === 'topic_change') return ar ? 'حاضر، نترك الموضوع السابق. ما الذي تريد الحديث عنه الآن؟' : 'Of course, let us leave that topic. What would you like to discuss now?';
  if (intent === 'explain') return ar ? 'أي جزء تريد توضيحه: الخيارات، السعر، أم الخطوة التالية؟ سأشرحه مباشرة دون إعادة العرض كاملًا.' : 'Which part would you like me to explain: the options, the price, or the next step? I will explain that part without repeating the whole overview.';
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
