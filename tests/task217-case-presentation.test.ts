import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { isValidElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import postcss from 'postcss';
import ts from 'typescript';
import { publicSitemapPaths } from '../lib/navigation/route-catalog';

const require = createRequire(import.meta.url);
function sourceModule(file: string, dependencies: Record<string, unknown>) {
  const exports: Record<string, unknown> = {};
  runInNewContext(ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require: (name: string) => dependencies[name] ?? require(name) });
  return exports;
}

test('Task217 private cases declare noindex without excluding public Support', async () => {
  const page = sourceModule('app/support/cases/page.tsx', {
    '@/components/public/CustomerCasesPage': { default: () => null },
  });
  const metadata = page.metadata as { robots?: { index?: boolean; follow?: boolean } } | undefined;
  assert.equal(metadata?.robots?.index, false);
  assert.equal(metadata?.robots?.follow, false);
  const settings = sourceModule('next.config.ts', {}).default as {
    headers: () => Promise<{ source: string; headers: { key: string; value: string }[] }[]>;
  };
  const rules = await settings.headers();
  const privateRule = rules.find(rule => rule.source === '/support/cases');
  assert.ok(privateRule);
  const directive = privateRule.headers.find(header => header.key.toLowerCase() === 'x-robots-tag');
  assert.match(directive?.value ?? '', /(?:^|,)\s*noindex(?:,|$)/);
  assert.equal(rules.every(rule => !rule.source.startsWith('/support') || rule.source === '/support/cases'), true);
  assert.equal(publicSitemapPaths.includes('/support'), true);
  assert.equal(publicSitemapPaths.includes('/support/cases'), false);
});

type Props = { children?: unknown; className?: string };
function elements(value: unknown): ReactElement<Props>[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!isValidElement<Props>(value)) return [];
  return [value, ...elements(value.props.children)];
}

function casePage(language: 'ar' | 'en') {
  // Actual component with synthetic state and all external effects disabled.
  // This is semantic/stylesheet evidence, not live browser or Auth acceptance.
  const snapshot = { identity: 'customer', busy: false, error: false, generation: 1, cases: {
    cases: [{ reference: 'CASE-SYNTHETIC-217', status: 'received', country: 'EG',
      updatedAt: '2026-11-04T00:00:00Z', events: [{ status: 'received', createdAt: '2026-11-04T00:00:00Z' }] }],
    truncated: false,
  } };
  const empty = ({ children }: Props) => children ?? null;
  const componentModule = sourceModule('components/public/CustomerCasesPage.tsx', {
    react: { ...require('react'), useEffect: () => undefined,
      useState: (initial: () => unknown) => [initial(), () => undefined],
      useSyncExternalStore: () => snapshot },
    'next/link': { default: empty },
    '@/components/i18n/LanguageProvider': { useLanguage: () => ({ language }) },
    '@/components/design-system': { SectionContainer: empty, ContentContainer: empty },
    '@/components/ui/button': { Button: empty },
    '@/components/public/ContactPublicPage': { default: () => null },
    '@/lib/contact/customer-case-session': { CustomerCaseSession: class {} },
    '@/lib/supabase/client': { supabase: {} },
  });
  return (componentModule.default as () => ReactElement)();
}

function themeColors(dark: boolean) {
  const variables: Record<string, string> = {};
  postcss.parse(readFileSync('app/globals.css', 'utf8')).walkRules(rule => {
    if (rule.selector === ':root' || (dark && rule.selector === "html[data-theme='dark']")) {
      rule.walkDecls(declaration => { variables[declaration.prop] = declaration.value; });
    }
  });
  return variables;
}

function luminance(hex: string) {
  assert.match(hex, /^#[a-f0-9]{6}$/i);
  const channels = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

test('Task217 actual AR/EN case cards retain readable text in both themes', () => {
  for (const language of ['ar', 'en'] as const) {
    const tree = casePage(language), card = elements(tree).find(element => element.type === 'article');
    assert.ok(card);
    const html = renderToStaticMarkup(tree);
    assert.ok(html.includes('CASE-SYNTHETIC-217'));
    assert.ok(html.includes(language === 'ar' ? 'مستلمة' : 'Received'));
    const classes = card.props.className ?? '';
    const backgroundToken = classes.match(/(?:^|\s)bg-\[var\((--[a-z-]+)\)\](?=\s|$)/)?.[1];
    const foregroundToken = classes.match(/(?:^|\s)text-\[var\((--[a-z-]+)\)\](?=\s|$)/)?.[1] ?? '--color-navy';
    for (const dark of [false, true]) {
      const variables = themeColors(dark);
      const background = classes.split(/\s+/).includes('bg-white') ? '#ffffff' : variables[backgroundToken ?? ''];
      const foreground = variables[foregroundToken];
      assert.ok(background && foreground, 'card colors must resolve from the actual supported theme utilities');
      const a = luminance(background), b = luminance(foreground);
      const contrast = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      assert.ok(contrast >= 4.5, language + ' ' + (dark ? 'dark' : 'light') + ' contrast ' + contrast);
    }
  }
});
