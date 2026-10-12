import { existsSync, statSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');

function resolveTypeScriptPath(specifier, parentURL) {
  let candidate;
  if (specifier.startsWith('next/')) {
    const nextEntry = resolvePath(projectRoot, 'node_modules', `${specifier}.js`);
    return existsSync(nextEntry) && statSync(nextEntry).isFile() ? pathToFileURL(nextEntry).href : null;
  }
  if (specifier.startsWith('@/')) {
    candidate = resolvePath(projectRoot, specifier.slice(2));
  } else if ((specifier.startsWith('./') || specifier.startsWith('../')) && parentURL?.startsWith('file:')) {
    candidate = resolvePath(dirname(fileURLToPath(parentURL)), specifier);
  } else {
    return null;
  }

  for (const path of [candidate, `${candidate}.ts`, `${candidate}.tsx`, resolvePath(candidate, 'index.ts')]) {
    if (existsSync(path) && statSync(path).isFile()) return pathToFileURL(path).href;
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    const url = resolveTypeScriptPath(specifier, context.parentURL);
    return url ? { url, shortCircuit: true } : nextResolve(specifier, context);
  },
});
