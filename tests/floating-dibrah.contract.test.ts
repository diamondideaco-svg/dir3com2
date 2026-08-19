'use strict';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const source = fs.readFileSync(path.join(process.cwd(), 'components/layout/FloatingDibrah.tsx'), 'utf8');

test('floating DABRA uses the live AI2 route and does not contain the old mock reply', () => {
  assert.match(source, /fetch\('\/api\/ai2\/chat'/);
  assert.doesNotMatch(source, /DEV-020.*LLM فعلي/);
});

test('floating DABRA policy and keyboard contract is present', () => {
  assert.match(source, /إخلاء مسؤولية/);
  assert.match(source, /الشروط والأحكام/);
  assert.match(source, /سياسة الخصوصية/);
  assert.match(source, /disabled=\{!policyChecked\}/);
  assert.match(source, /event\.key === 'Enter' && !event\.shiftKey/);
  assert.match(source, /event\.key === 'Escape'/);
});

test('floating DABRA has no hover-driven movement and keeps drag movement explicit', () => {
  assert.doesNotMatch(source, /whileHover=\{\{\s*y:/);
  assert.match(source, /pointermove/);
  assert.match(source, /Math\.hypot/);
});
