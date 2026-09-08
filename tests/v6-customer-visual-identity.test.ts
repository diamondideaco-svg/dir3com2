import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { placeDabraLauncher } from '../lib/dabra/floating-layout';
const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

// v6 DOCX b983f0cf…8a2 / PDF 290dbbe2…df1, pages 6–13.
// Exact original OOXML image1–8 bytes; no generated replacement or recoloring.
test('all seven full badges and the compact atlas remain byte-identical to approved v6', () => {
  const approved = {
    ceo: 'df2bb252e247d5b22a954a9d78589a6a516db47286dc4327ccf8af98b86663ab',
    admin: '3e3c3bfacad63642737aae6ac9e71bd9bdc90035dd058da1706ebf30d5a6705a',
    partner: '398fd2e52fa70cfb36bf88a5f6aa571ce2849d12b9bb62e4c8a17229f7c797d8',
    concierge: 'c68de6a56cb3debf1ae2e6ca08733049ff2908bad6905aaf9ad0f1236f8edff3',
    'travel-agent': '0e4771cf3358e9592606cb4b1ccb4b881a0240822102449970c528e976b357f8',
    'customer-service': '26a25e768cff93ef137dc48fe833342a8ba019622331d3385917f575d71426ae',
    'mall-center': 'b0ebf8ee734130e6dcb491915dc148d1a944a0d94e4d654f0a32eb548bf89c7d',
    'compact-atlas': 'a40f8db0ec27c1ddf6e02d6a5bd4da0aa7ce24f387e5d95b493e0b09c005f1ab',
  };
  for (const [name, hash] of Object.entries(approved)) {
    const bytes = readFileSync(new URL(`../public/brand/v6/dabra/${name}.png`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), hash, name);
  }
});

test('customer artwork uses approved compact cells, not full badges as tiny icons or role authority', () => {
  const identity = read('components/v6/DabraIdentity.tsx');
  assert.match(identity, /compact-atlas\.png/);
  assert.match(identity, /customer-service\.png/);
  assert.doesNotMatch(identity, /supabase|fetch\(|auth\.|capabilities|setRole|service_role/);
  const css = read('components/v6/v6.module.css');
  assert.match(css, /\.dabraCompact[^}]+width:64px; height:64px/);
  assert.match(css, /\.dabraIntroduction[^}]+220px/);
  assert.doesNotMatch(css, /data-theme=navy\] \.(sidebar|header|footer)[^{]*\{[^}]*background:#0d1b2a/);
  assert.match(css, /\.walletHero[^}]+background:#0d1b2a/);
});

test('customer launcher reuses canonical chat including locale reset and safety policy', () => {
  const shell = read('components/v6/Chrome.tsx'), chat = read('components/layout/FloatingDibrah.tsx');
  assert.match(shell, /viewer && path !== '\/my-account' && <div className=\{styles.customerLauncher\}/);
  assert.match(shell, /FloatingDibrah launcherIdentity=\{<DabraCompact/);
  assert.match(chat, /FloatingDibrahSession key=\{language\}/);
  assert.match(chat, /launcherIdentity \?\?/);
  assert.match(chat, /DIBRAH_POLICY_ACCEPTED_KEY/);
  assert.match(chat, /chatAbortRef\.current\?\.abort\(\)/);
  assert.match(chat, /fetch\('\/api\/ai2\/chat'/);
});

for (const language of ['ar', 'en'] as const) for (const width of [390, 1449]) {
  test(`approved compact launcher ${language}/${width} uses correct side and avoids live controls`, () => {
    const viewport = { left: 0, top: 0, width, height: 844 };
    const launcherWidth = width === 390 ? 74 : 230;
    const x = language === 'ar' ? 12 : width - launcherWidth - 12;
    const obstacle = { left: x, right: x + launcherWidth, top: 730, bottom: 790 };
    const result = placeDabraLauncher({ language, viewport, width: launcherWidth, height: 74, obstacles: [obstacle] });
    assert.equal(result.x, x);
    assert.equal(result.visible, true);
    assert.ok(result.y + 74 <= obstacle.top - 8 || result.y >= obstacle.bottom + 8);
  });
}

test('mobile document labels and actions retain original owner endpoint, welcome retains real destinations', () => {
  const docs = read('components/account/MyDocumentsContent.tsx');
  assert.match(docs, /styles.documentTable/);
  assert.match(docs, /data-label=\{ar \? 'الإجراءات' : 'Actions'\}/);
  assert.match(docs, /\/api\/customer\/documents\?documentId=/);
  assert.match(docs, /result\.ok \|\| !payload\?\.data\?\.id/);
  const welcome = read('components/v6/LoginSuccess.tsx');
  assert.match(welcome, /href=\{destination\}/);
  assert.match(welcome, /href="\/marketplace"/);
  assert.doesNotMatch(welcome, /welcomeArt|<Image/);
  assert.match(read('components/v6/v6.module.css'), /\.welcome \{[^}]+dir3com-login-background-approved\.png/);
});

test('Documents opts its informational heading/banner into canonical launcher avoidance', () => {
  assert.match(read('components/account/MyDocumentsContent.tsx'), /className=\{styles.documentsHeading\} data-dabra-avoid/);
  assert.match(read('components/layout/FloatingDibrah.tsx'), /\[data-dabra-avoid\]/);
  // Recorded 390x844 geometry: cards fill the lower viewport. The old collector
  // omitted the banner and parked the 74px launcher over its text at y≈385.
  const heading={left:16,right:374,top:202,bottom:405};
  const cards={left:16,right:374,top:501,bottom:1026};
  assert.match(read('components/v6/v6.module.css'), /@media\(max-width:720px\) \{ \.documentsHeading \{[^}]+margin-bottom:96px/);
  for(const language of ['ar','en'] as const) {
    const result=placeDabraLauncher({language,viewport:{left:0,top:0,width:390,height:844},width:74,height:74,obstacles:[heading,cards,{left:0,right:390,top:0,bottom:176}]});
    assert.equal(result.visible,true);
    assert.equal(result.x,language==='ar'?12:304);
    assert.ok(result.y>=heading.bottom+8);
    assert.ok(result.y+74<=cards.top-8);
  }
});
