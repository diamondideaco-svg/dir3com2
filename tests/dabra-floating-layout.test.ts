import assert from 'node:assert/strict';
import test from 'node:test';
import { placeDabraLauncher, type DabraObstacle } from '@/lib/dabra/floating-layout';

const mobile = { left: 0, top: 0, width: 390, height: 844 };
const input = { language: 'en' as const, viewport: mobile, width: 50, height: 56, obstacles: [] as DabraObstacle[] };
const overlaps = (p: { x: number; y: number }, width: number, height: number, r: DabraObstacle) =>
  p.x < r.right && p.x + width > r.left && p.y < r.bottom && p.y + height > r.top;

test('launcher owns locale-correct sides on mobile and desktop', () => {
  for (const viewport of [mobile, { ...mobile, width: 1440, height: 1000 }]) {
    for (const language of ['ar', 'en'] as const) {
      const p = placeDabraLauncher({ ...input, viewport, language });
      assert.equal(p.visible, true);
      assert.equal(p.x, language === 'ar' ? 12 : viewport.width - 62);
      assert.ok(p.y >= 84 && p.y + 56 <= viewport.height - 12);
    }
  }
});

test('Home return-date regression never overlaps the actual input', () => {
  const obstacle = { left: 17, right: 358, top: 709, bottom: 757 };
  const p = placeDabraLauncher({ ...input, obstacles: [obstacle] });
  assert.equal(p.visible, true);
  assert.equal(overlaps(p, 50, 56, obstacle), false);
});

test('landscape resize redocks and avoids pickup controls instead of retaining portrait coordinates', () => {
  const viewport = { ...mobile, width: 844, height: 390 };
  const obstacle = { left: 17, right: 812, top: 349, bottom: 397 };
  const p = placeDabraLauncher({ ...input, width: 228, viewport, obstacles: [obstacle] });
  assert.equal(p.visible, true);
  assert.equal(p.x, 604);
  assert.equal(overlaps(p, 228, 56, obstacle), false);
});

test('route changes avoid request and provider-checkout CTAs on either side', () => {
  const obstacles = [{ left: 8, right: 382, top: 680, bottom: 756 }, { left: 8, right: 382, top: 772, bottom: 832 }];
  for (const language of ['ar', 'en'] as const) {
    const p = placeDabraLauncher({ ...input, language, obstacles });
    assert.equal(p.visible, true);
    assert.ok(obstacles.every(r => !overlaps(p, 50, 56, r)));
  }
});

test('fully occupied viewport hides the optional launcher rather than covering a control', () => {
  assert.equal(placeDabraLauncher({ ...input, obstacles: [{ left: 0, right: 390, top: 0, bottom: 844 }] }).visible, false);
  assert.equal(placeDabraLauncher({ ...input, viewport: { ...mobile, height: 120 } }).visible, false);
});

test('keyboard visual viewport offsets and remembered dock preferences remain bounded', () => {
  const viewport = { left: 0, top: 100, width: 390, height: 360 };
  const p = placeDabraLauncher({ ...input, viewport, preference: { side: 'left', bottomGap: 10000 } });
  assert.equal(p.visible, true);
  assert.equal(p.x, 12);
  assert.ok(p.y >= 184 && p.y + 56 <= 448);
});

test('unrelated opposite-side controls do not displace the launcher', () => {
  const p = placeDabraLauncher({ ...input, obstacles: [{ left: 0, right: 100, top: 0, bottom: 844 }] });
  assert.deepEqual(p, placeDabraLauncher(input));
});
