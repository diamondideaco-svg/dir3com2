import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import postcss from 'postcss';

const read = (file: string) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const css = read('components/v6/v6.module.css');
const source = read('components/v6/Favorites.tsx');
const start = '/* Favorites desktop-only visual round.';
const end = '/* End Favorites desktop-only visual round. */';
const block = css.slice(css.indexOf(start), css.indexOf(end) + end.length);
const scope = '.root:has(.sidebar a[href="/favorites"][aria-current=page])';

test('Favorites visuals are desktop-only and cannot change approved routes or mobile', () => {
  assert.ok(css.includes(start));
  postcss.parse(block).walkRules(rule => {
    if (rule.selector === '.favoritesDesktopIcon,.favoritesEmptyIcon') {
      assert.equal(rule.nodes.map(n => n.toString()).join(';'), 'display:none');
      return;
    }
    for (const selector of rule.selectors) assert.ok(selector.startsWith(scope));
    assert.equal(rule.parent?.type, 'atrule');
    assert.equal((rule.parent as postcss.AtRule).params, '(min-width:1051px)');
  });
  assert.doesNotMatch(block, /\.header|row-reverse|scaleX|\.customerLauncher|url\(/);
});

test('Favorites desktop icons reuse the approved family and retain the original mobile icons', () => {
  const account = read('components/account/MyAccountContent.tsx');
  for (const icon of ['LuHotel', 'LuCarFront', 'LuConciergeBell', 'LuCrown', 'LuPlane']) {
    assert.ok(source.includes(icon));
    assert.ok(account.includes(icon));
  }
  assert.ok(source.includes("'Drive',FiTruck,LuCarFront"));
  assert.ok(source.includes('<Icon className={styles.favoritesMobileIcon}/>'));
  assert.ok(source.includes('<DesktopIcon className={styles.favoritesDesktopIcon} strokeWidth={1.75} aria-hidden="true"/>'));
  assert.ok(block.includes('width:56px; height:56px; padding:14px;'));
  assert.ok(block.includes('color:var(--gold); stroke-width:1.75;'));
  assert.doesNotMatch(source, /DabraCompact|DabraIntroduction/);
});

test('Favorites footer matches all seven My Bookings master declarations', () => {
  const master = new Map<string, string>();
  postcss.parse(css).walkRules(rule => {
    if (rule.selector.includes('/my-bookings') && rule.selector.includes('[data-footer-')) {
      master.set(rule.selector.replaceAll('/my-bookings', '/favorites'), rule.nodes.map(n => n.toString()).join(';'));
    }
  });
  let matched = 0;
  postcss.parse(block).walkRules(rule => {
    if (rule.selector.includes('[data-footer-')) {
      assert.equal(rule.nodes.map(n => n.toString()).join(';'), master.get(rule.selector));
      matched++;
    }
  });
  assert.equal(matched, 7);
});

test('Favorites passes Concierge context to the existing single global launcher', () => {
  const chrome = read('components/v6/Chrome.tsx');
  assert.equal((chrome.match(/<FloatingDibrah\s/g) || []).length, 1);
  assert.ok(chrome.includes("?? (path === '/favorites' ? { greeting: ar ? 'مرحبًا، أنا الدبرة' : \"Hi, I'm DABRA\", role: ar ? 'الكونسيرج' : 'Concierge' } : undefined)"));
  assert.ok(chrome.includes("artwork={path === '/my-documents' ? 'mall-center' : 'customer-service'}"));
  assert.ok(read('components/layout/FloatingDibrahIdentity.module.css').includes('@media(min-width:1051px)'));
});

test('Favorites keeps owner persistence, errors, filters, sorting, manage and content-led populated state', () => {
  for (const contract of [
    "const owner = 'user:'+userId",
    "readPersisted(localStorage.getItem(storageKey(owner,'favorites')),owner,validatePersistedFavorites)",
    "if (!saved.length) {setLoading(false);return;}",
    "new AbortController()",
    "throw new Error('FAVORITES_READ_INCOMPLETE')",
    "localStorage.setItem(storageKey(owner,'favorites'),JSON.stringify(createPersisted(next,owner)))",
    "sort==='name'",
    "aria-pressed={manage}",
    "onClick={()=>remove(service.id)}",
    "service.transactionMethod==='request_to_confirm'",
    "service.basePrice>0?service.basePrice+' '+service.currency:'—'",
    "failed?<LoadError/>:visible.length?<div className={styles.favoritesGrid}",
    "No saved services in this view.",
    "href=\"/marketplace\""
  ]) assert.ok(source.includes(contract), contract);
  assert.ok(source.includes('</article>)}</div>:<div className={styles.empty}><LuHeart className={styles.favoritesEmptyIcon}'));
});
