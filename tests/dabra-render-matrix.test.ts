import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const pilotPage = fs.readFileSync(path.join(process.cwd(), 'app/ai/pilot/page.tsx'), 'utf8');
const shell = fs.readFileSync(path.join(process.cwd(), 'components/layout/SiteShell.tsx'), 'utf8');

test('pilot route has one canonical DABRA mount and no legacy pilot chat mount', () => {
  assert.doesNotMatch(pilotPage, /PilotChatPanel|DabraJourneyPanel/);
  assert.equal((shell.match(/<FloatingDibrah\s*\/>/g) || []).length, 1);
  assert.match(shell, /<FloatingDibrah\s*\/>/);
});