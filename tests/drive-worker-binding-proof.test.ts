import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function loadProof(worker?: string) {
  const exports: { prepareExistingWorkerBindingProof?: () => { expectedWorkerSha256: string } | null } = {};
  const code = ts.transpileModule(readFileSync('lib/admin/drive-worker-binding-proof.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(code, {
    exports,
    process: { env: { DIR3COM_WHATSAPP_WORKER_SECRET: worker } },
    require(name: string) {
      if (name === 'server-only') return {};
      if (name === 'node:crypto') return { createHash };
      throw new Error('Unexpected proof dependency: ' + name);
    },
  });
  assert.ok(exports.prepareExistingWorkerBindingProof);
  return exports.prepareExistingWorkerBindingProof;
}

test('trusted proof uses the exact runtime worker with a domain-separated UTF-8 digest only', () => {
  const worker = 'SYNTHETIC-ONLY-WORKER-CREDENTIAL-' + 'a'.repeat(20);
  const proof = loadProof(worker)()!;
  assert.deepEqual(Object.keys(proof), ['expectedWorkerSha256']);
  assert.equal(proof.expectedWorkerSha256,
    createHash('sha256').update('task166-existing-worker-v1:' + worker, 'utf8').digest('hex'));
  assert.equal(JSON.stringify(proof).includes(worker), false);
  assert.notEqual(proof.expectedWorkerSha256, loadProof(worker + ' ')()!.expectedWorkerSha256,
    'The preparation path must not trim or normalize the runtime credential');
});

test('missing or out-of-bounds runtime worker cannot produce a permit proof', () => {
  for (const worker of [undefined, '', 'a'.repeat(31), 'a'.repeat(513)]) {
    assert.equal(loadProof(worker)(), null);
  }
  for (const worker of ['a'.repeat(32), 'a'.repeat(512)]) {
    assert.match(loadProof(worker)()!.expectedWorkerSha256, /^[0-9a-f]{64}$/);
  }
});

test('a caller argument cannot substitute the runtime credential used for permit preparation', () => {
  const worker = 'SYNTHETIC-ONLY-TRUSTED-RUNTIME-WORKER';
  const prepare = loadProof(worker);
  const baseline = prepare()!.expectedWorkerSha256;
  const suppliedArgument = prepare as (untrusted: string) => { expectedWorkerSha256: string };
  assert.equal(suppliedArgument('DIFFERENT-SYNTHETIC-ONLY-CALLER-WORKER').expectedWorkerSha256, baseline);
});
