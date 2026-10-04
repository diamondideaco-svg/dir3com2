type ConversationMessage = { id: string; role: 'user' | 'assistant'; text: string };

/** Locale is not an identity boundary. Keep completed conversation/preferences;
 * an aborted empty assistant placeholder must not become history. Authentication
 * changes still clear private state in the caller's separate identity handler.
 */
export function conversationForLocale<T extends ConversationMessage>(messages: T[], welcome: T): T[] {
  return [welcome, ...messages.filter(message => message.id !== 'welcome' && message.text.trim().length > 0)];
}
