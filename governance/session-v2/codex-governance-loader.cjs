// Actions github-script is CommonJS; import the current ESM API without require-style imports.
async function load() { return import('./codex-governance.mjs'); }
module.exports = { load };
