import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import postcss from 'postcss';

const read = (file: string) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const css = read('components/v6/v6.module.css');
const source = read('components/account/MyDocumentsContent.tsx');
const start = '/* My Documents desktop-only visual round.';
const end = '/* End My Documents desktop-only visual round. */';
const block = css.slice(css.indexOf(start), css.indexOf(end) + end.length);
const scope = '.root:has(.sidebar a[href="/my-documents"][aria-current=page])';

test('documents visual styles are desktop-only and route-contained', () => {
  assert.ok(css.includes(start));
  postcss.parse(block).walkRules(rule => {
    if (rule.selector === '.documentDesktopIcon,.documentEmptyIcon') {
      assert.equal(rule.nodes.map(n => n.toString()).join(';'), 'display:none');
      return;
    }
    for (const selector of rule.selectors) assert.ok(selector.startsWith(scope));
    assert.equal(rule.parent?.type, 'atrule');
    assert.equal((rule.parent as postcss.AtRule).params, '(min-width:1051px)');
  });
  assert.doesNotMatch(block, /\.header|row-reverse|scaleX|\.customerLauncher|url\(/);
});

test('documents preserve mobile icons and use the approved premium desktop family', () => {
  for (const icon of ['LuFileText', 'LuShieldCheck', 'LuIdCard', 'LuCarFront', 'LuBookOpenCheck']) assert.ok(source.includes(icon));
  assert.ok(source.includes("'Driving licenses',FiTruck,LuCarFront"));
  assert.ok(source.includes('<Icon className={styles.documentMobileIcon} />'));
  assert.ok(source.includes('<DesktopIcon className={styles.documentDesktopIcon} strokeWidth={1.75} aria-hidden="true" />'));
  assert.ok(block.includes('width:56px; height:56px; padding:14px;'));
  assert.ok(block.includes('color:var(--gold); stroke-width:1.75;'));
  assert.doesNotMatch(source, /DabraCompact|DabraIntroduction/);
});

test('documents footer uses exact approved My Bookings master without changing structure', () => {
  const master = new Map<string, string>();
  postcss.parse(css).walkRules(rule => {
    if (rule.selector.includes('/my-bookings') && rule.selector.includes('[data-footer-')) {
      master.set(rule.selector.replaceAll('/my-bookings', '/my-documents'), rule.nodes.map(n => n.toString()).join(';'));
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

test('one shared launcher receives documents Customer Service desktop context', () => {
  const chrome = read('components/v6/Chrome.tsx');
  assert.equal((chrome.match(/<FloatingDibrah\s/g) || []).length, 1);
  assert.ok(chrome.includes("?? (path === '/my-documents' ? { greeting: ar ? 'مرحبًا، أنا الدبرة' : \"Hi, I'm DABRA\", role: ar ? 'خدمة العملاء' : 'Customer Service' } : undefined)"));
  assert.ok(chrome.includes("desktopArtwork={path === '/my-documents' ? 'customer-service' : undefined}"));
  assert.ok(chrome.includes("artwork={path === '/my-documents' ? 'mall-center' : 'customer-service'}"));
  const identity = read('components/v6/DabraIdentity.tsx');
  assert.equal((identity.slice(0, identity.indexOf('export function DabraIntroduction')).match(/<Image /g) || []).length, 1);
  assert.ok(identity.includes('style={{ left: cells[artwork] }}'));
  assert.ok(block.includes('.dabraCompact[data-dabra-desktop-artwork] img { left:var(--dabra-desktop-left) !important; }'));
});

test('document truth, owner read, upload validation, signed routes and pagination remain intact', () => {
  const page = read('app/my-documents/page.tsx');
  for (const contract of [".eq('owner_type', 'customer')", ".eq('owner_id', user.id)", "redirect(buildLoginTarget('/my-documents'))"]) assert.ok(page.includes(contract));
  for (const contract of [
    "documentsState.status === 'error' ? <LoadError />",
    "file.size > 4 * 1024 * 1024",
    "fetch('/api/customer/documents',{method:'POST',body:form})",
    "if (!result.ok || !payload?.data?.id)",
    "document.storage_bucket === 'customer-documents'",
    "'/api/customer/documents?documentId='+document.id",
    "'&download=1'",
    "filtered.slice((current-1)*10,current*10)",
    "normalizeVerificationStatus(document.verification_requests?.status ?? document.verification_status)",
    "const documents = documentsState.status === 'ready' ? documentsState.documents : [];"
  ]) assert.ok(source.includes(contract), contract);
  assert.ok(source.includes("!filtered.length ? <div className={styles.empty}><LuFileText"));
});
