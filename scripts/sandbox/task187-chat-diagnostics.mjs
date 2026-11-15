// Only fixed categories can leave the isolated child. Never forward its stderr,
// assertion values, credentials, paths or stack to CI logs.
const phases = new Set(['configuration','schema','route_import','authentication','profiles','continuity_rpc','chat_json','chat_multipart','invalid_body','receipt']);
const kinds = new Set(['assertion','type','other']);
export function task187ChatDiagnosticLine(phase,kind) {
  return phases.has(phase) && kinds.has(kind) ? `TASK187_CHAT_DIAGNOSTIC=${phase}:${kind}` : null;
}
export function readTask187ChatDiagnostic(error,stderr) {
  if (error?.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' || typeof stderr !== 'string' || Buffer.byteLength(stderr,'utf8') >= 32768) return null;
  const matches = stderr.split(/\r?\n/).filter(line=>/^TASK187_CHAT_DIAGNOSTIC=[a-z_]+:[a-z]+$/.test(line));
  if (matches.length !== 1) return null;
  const [phase,kind] = matches[0].slice('TASK187_CHAT_DIAGNOSTIC='.length).split(':');
  return phases.has(phase) && kinds.has(kind) ? {phase,kind} : null;
}
