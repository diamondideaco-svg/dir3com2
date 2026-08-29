import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDabraWelcomeMessage,
  DABRA_WELCOME_COPY,
  localizePersistedDabraWelcome,
} from '@/lib/dabra/welcome-locale';

test('fresh DABRA sessions use the active platform locale', () => {
  assert.equal(createDabraWelcomeMessage('ar').text, DABRA_WELCOME_COPY.ar);
  assert.equal(createDabraWelcomeMessage('en').text, DABRA_WELCOME_COPY.en);
});

test('locale switches replace only the current welcome seed', () => {
  assert.equal(localizePersistedDabraWelcome([createDabraWelcomeMessage('ar')], 'en')[0].text, DABRA_WELCOME_COPY.en);
  assert.equal(localizePersistedDabraWelcome([createDabraWelcomeMessage('en')], 'ar')[0].text, DABRA_WELCOME_COPY.ar);
});

test('persisted history localizes its welcome without deleting legitimate turns', () => {
  const userTurn = { id: 'user-1', role: 'user' as const, text: 'Keep this trip request.' };
  const assistantTurn = { id: 'assistant-1', role: 'assistant' as const, text: 'Existing answer.' };
  const english = localizePersistedDabraWelcome([createDabraWelcomeMessage('ar'), userTurn, assistantTurn], 'en');
  assert.deepEqual(english, [createDabraWelcomeMessage('en'), userTurn, assistantTurn]);
  const arabic = localizePersistedDabraWelcome([createDabraWelcomeMessage('en'), userTurn, assistantTurn], 'ar');
  assert.deepEqual(arabic, [createDabraWelcomeMessage('ar'), userTurn, assistantTurn]);
});

test('history without a welcome seed remains untouched', () => {
  const history = [{ id: 'user-1', role: 'user' as const, text: 'Existing request.' }];
  assert.strictEqual(localizePersistedDabraWelcome(history, 'en'), history);
});

test('resetting an empty conversation recreates the selected-locale welcome', () => {
  assert.deepEqual(localizePersistedDabraWelcome([], 'en'), [createDabraWelcomeMessage('en')]);
  assert.deepEqual(localizePersistedDabraWelcome([], 'ar'), [createDabraWelcomeMessage('ar')]);
});
