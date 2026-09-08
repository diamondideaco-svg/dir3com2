import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import postcss from 'postcss';

const read = (file: string) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const phone = '(max-width:720px)';
const files = [
  ['components/v6/v6.module.css', '/* MOBILE REVIEW RESTORATION'],
  ['components/v6/welcome-desktop.module.css', '/* Phone restoration'],
  ['components/v6/support-desktop.module.css', '/* Phone-only restoration'],
  ['components/v6/request-detail-desktop.module.css', '/* Phone-only layout'],
  ['components/auth/password-recovery.module.css', '/* Expose the existing'],
  ['components/layout/FloatingDibrahIdentity.module.css', '/* Existing contextual'],
  ['app/(auth)/register/register.module.css', '/* Mobile review:'],
] as const;

test('every new responsive block is bounded to phones; desktop rules remain separate', () => {
  for (const [file, marker] of files) {
    const css = read(file);
    assert.ok(css.includes(marker), file);
    const ast = postcss.parse(css.slice(css.indexOf(marker)));
    const block = ast.nodes.find(n => n.type === 'atrule');
    assert.ok(block && block.type === 'atrule');
    assert.equal(block.params, phone, file);
    block.walkRules(rule => {
      assert.doesNotMatch(rule.selector, /^(html|body|:root)\b/);
      assert.doesNotMatch(rule.toString(), /row-reverse|scaleX\(-1\)/);
    });
  }
});

test('the same approved shell is selected on phones and desktop, never as authority', () => {
  const frame = read('components/v6/ProfileDesktopFrame.tsx');
  assert.ok(frame.includes("const reviewQuery = '(max-width:720px), (min-width:1051px)'"));
  assert.match(frame, /useSyncExternalStore\(subscribeReview, reviewSnapshot, serverSnapshot\)/);
  assert.match(frame, /media.removeEventListener\('change', onChange\)/);
  assert.doesNotMatch(frame, /fetch\(|supabase|localStorage|redirect\(/);
  for (const file of ['components/layout/SiteShell.tsx', 'components/account/MyProfileContent.tsx']) {
    assert.match(read(file), /useCustomerReviewLayout\(\)/);
  }
});

test('mobile scenes reuse CEO assets without changing the source image or mirroring', () => {
  const mobile = read('components/v6/v6.module.css').split('/* MOBILE REVIEW RESTORATION')[1];
  assert.match(mobile, /login-success-luxury-lounge-ceo\.png/);
  assert.match(mobile, /golden_hour_over_the_rugged_desert_canyon\.png/);
  assert.match(read('app/(auth)/register/register.module.css').split('/* Mobile review:')[1], /register-seaside-ceo-approved\.png/);
  assert.match(mobile, /footer::after \{ content:none; display:none; \}/);
});

test('welcome phone layout reflows existing real copy/actions instead of legacy signature', () => {
  const css = read('components/v6/welcome-desktop.module.css');
  assert.match(css, /\.host > :not\(\.desktop\) \{ display:none; \}/);
  const source = read('components/v6/LoginSuccess.tsx');
  assert.match(source, /Ezhalni — إزهلني!/);
  assert.match(source, /href="\/marketplace"/);
  assert.match(source, /href=\{destination\}/);
  assert.match(css, /\.actions > a \{ width:100%; min-height:48px/);
});

test('recovery link is reachable on phones without absolute positioning or auth mutation', () => {
  const mobile = read('components/auth/password-recovery.module.css').split('/* Expose the existing')[1].split('@media (min-width:1051px)')[0];
  assert.match(mobile, /\.loginEntry \{ display:flex/);
  assert.match(mobile, /min-height:44px/);
  assert.doesNotMatch(mobile, /position:absolute/);
  assert.match(read('app/(auth)/login/page.tsx'), /href="\/auth\/forgot-password"/);
});

test('mobile DABRA preserves shared launcher and contextual role; financial and request truth are unchanged', () => {
  const mobile = read('components/v6/v6.module.css').split('/* MOBILE REVIEW RESTORATION')[1];
  assert.match(mobile, /\.dabraIntroduction > div \{ display:grid; min-width:0; row-gap:6px/);
  assert.match(mobile, /\.dabraIntroduction a \{ justify-self:start/);
  const chrome = read('components/v6/Chrome.tsx');
  assert.equal((chrome.match(/<FloatingDibrah /g) || []).length, 1);
  assert.match(read('components/layout/FloatingDibrahIdentity.module.css'), /@media\(max-width:720px\)/);
  const floating = read('components/layout/FloatingDibrah.tsx');
  assert.match(floating, /group fixed z-50/);
  assert.match(floating, /placeDabraLauncher/);
  assert.match(floating, /data-dabra-avoid/);
  assert.match(floating, /pathname === '\/my-bookings' && window.innerWidth <= 720 \? ', main p' : ''/);
  const request = read('components/account/MarketplaceRequestDetail.tsx');
  assert.match(request, /not a confirmed booking/);
  assert.match(request, /No confirmed payment/);
});
