import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readFile } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
test('Montserrat uses the pinned licensed local asset through the actual local font loader', async () => {
  const source = readFileSync('app/layout.tsx', 'utf8');
  const ast = ts.createSourceFile('layout.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const google = ast.statements.filter(ts.isImportDeclaration).find(n => n.moduleSpecifier.getText(ast) === "'next/font/google'");
  assert.equal(google?.importClause?.namedBindings?.getText(ast), '{ Tajawal }');
  let call: ts.CallExpression | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'montserrat') {
      assert.ok(node.initializer && ts.isCallExpression(node.initializer)); call = node.initializer;
    }
    ts.forEachChild(node, visit);
  };
  visit(ast); assert.ok(call); assert.equal(call.expression.getText(ast), 'localFont');
  const options = vm.runInNewContext('(' + call.arguments[0].getText(ast) + ')');
  assert.equal(options.variable, '--font-montserrat'); assert.equal(options.display, 'swap');
  assert.deepEqual(Array.from(options.src, (s: { weight: string }) => s.weight), ['400', '500', '600', '700']);
  for (const src of options.src) { assert.equal(src.path, './fonts/montserrat/Montserrat[wght].ttf'); assert.equal(src.style, 'normal'); }
  const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
  const expected = '0f7b311b2f3279e4eef9b2f968bcdbab6e28f4daeb1f049f4f278a902bcd82f7';
  assert.equal(hash(readFileSync('app/fonts/montserrat/Montserrat[wght].ttf')), expected);
  assert.equal(hash(readFileSync('app/fonts/montserrat/OFL.txt')), '8b7141c03fa4f8d44e6345d5d4931709290f0f67875e452e95ac1fd3a027802e');
  const loader = require('next/dist/compiled/@next/font/dist/local/loader').default;
  let emissions = 0;
  const result = await loader({ functionName: '', variableName: 'montserrat', data: [options],
    resolve: async (path: string) => resolve('app', path), loaderContext: { fs: { readFile } },
    emitFontFile: (bytes: Buffer, ext: string, preload: boolean) => {
      assert.equal(hash(bytes), expected); assert.equal(ext, 'ttf'); assert.equal(preload, true); emissions++;
      return '/_next/static/media/montserrat.ttf';
    },
  });
  assert.equal(emissions, 4); assert.equal(result.variable, '--font-montserrat');
  for (const weight of ['400', '500', '600', '700']) assert.ok(result.css.includes('font-weight: ' + weight + ';'));
  assert.equal((result.css.match(/font-display: swap;/g) ?? []).length, 4);
  assert.ok(!/google|https:|turbopack-next/.test(result.css));
  assert.equal(result.adjustFontFallback.fallbackFont, 'Arial');
});
