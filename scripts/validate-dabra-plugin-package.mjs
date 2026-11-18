import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pluginRoot = join(projectRoot, 'plugins', 'dabra');
const manifestPath = join(pluginRoot, '.codex-plugin', 'plugin.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const openai = manifest.extensions?.['com.openai'];
const review = openai?.review;
const publication = openai?.publication;
const mcpConfigPath = join(pluginRoot, '.mcp.json');
const mcpConfig = JSON.parse(readFileSync(mcpConfigPath, 'utf8'));

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

check(manifest.name === 'dabra', 'Package name must remain dabra.');
check(manifest.version === '2.0.0', 'Version must be 2.0.0.');
check(manifest.interface?.displayName === 'DABRA', 'Display name must be DABRA.');
check((manifest.interface?.displayName?.length ?? 0) <= 30, 'Display name exceeds 30 characters.');
check((manifest.interface?.shortDescription?.length ?? 0) <= 30, 'Short description exceeds 30 characters.');
check((manifest.interface?.longDescription?.length ?? 0) <= 4000, 'Long description exceeds 4000 characters.');
check(Array.isArray(manifest.interface?.defaultPrompt) && manifest.interface.defaultPrompt.length <= 3, 'At most three starter prompts are allowed.');
for (const prompt of manifest.interface?.defaultPrompt ?? []) {
  check(prompt.length <= 128, `Starter prompt exceeds 128 characters: ${prompt}`);
  check(!prompt.includes('@'), `Starter prompt contains an MCP mention: ${prompt}`);
}

for (const field of ['websiteURL', 'supportURL', 'privacyPolicyURL', 'termsOfServiceURL']) {
  const value = manifest.interface?.[field];
  check(typeof value === 'string' && value.startsWith('https://') && value.length <= 1024, `${field} must be a valid HTTPS URL.`);
}

const positive = review?.test_cases?.positive;
const negative = review?.test_cases?.negative;
check(Array.isArray(positive) && positive.length === 5, 'Exactly five positive review cases are required.');
check(Array.isArray(negative) && negative.length === 3, 'Exactly three negative review cases are required.');
for (const [index, testCase] of (positive ?? []).entries()) {
  check(Boolean(testCase.description), `Positive case ${index + 1} needs a description.`);
  check(Boolean(testCase.prompt), `Positive case ${index + 1} needs a prompt.`);
  check(Boolean(testCase.tools_triggered), `Positive case ${index + 1} needs tools_triggered.`);
  check(Boolean(testCase.expected_behavior), `Positive case ${index + 1} needs expected_behavior.`);
}
for (const [index, testCase] of (negative ?? []).entries()) {
  check(Boolean(testCase.description), `Negative case ${index + 1} needs a description.`);
  check(Boolean(testCase.prompt), `Negative case ${index + 1} needs a prompt.`);
}

check(review?.commerce === false, 'DABRA V2 must remain non-commerce.');
check(review?.demo_recording_url?.startsWith('https://'), 'A public HTTPS demo recording URL is required.');
check(typeof publication?.release_notes === 'string' && publication.release_notes.length > 0, 'Release notes are required.');
check(Boolean(publication?.translations?.['ar-SA']?.subtitle), 'Arabic subtitle is required.');
check(Boolean(publication?.translations?.['ar-SA']?.description), 'Arabic description is required.');

for (const assetField of ['composerIcon', 'logo']) {
  const assetReference = manifest.interface?.[assetField];
  const assetPath = assetReference ? resolve(pluginRoot, assetReference) : '';
  const assetRelativePath = assetPath ? relative(pluginRoot, assetPath) : '';
  const assetIsPackaged = Boolean(assetReference)
    && assetRelativePath !== ''
    && !assetRelativePath.startsWith(`..${sep}`)
    && assetRelativePath !== '..'
    && !isAbsolute(assetRelativePath);
  check(assetIsPackaged, `${assetField} must resolve inside the plugin package.`);
  check(assetIsPackaged && existsSync(assetPath), `${assetField} asset is missing.`);
  if (existsSync(assetPath) && assetPath.endsWith('.png')) {
    const bytes = readFileSync(assetPath);
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    check(width === height && width >= 48 && width <= 4096, `${assetField} must be square and 48-4096 pixels.`);
    check(bytes.length <= 5 * 1024 * 1024, `${assetField} exceeds 5 MiB.`);
  }
}

const walk = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const absolute = join(directory, entry.name);
  return entry.isDirectory() ? walk(absolute) : [absolute];
});
const packagedFiles = walk(pluginRoot);
check(!packagedFiles.some((file) => relative(pluginRoot, file).split(sep).some((segment) => segment === 'node_modules' || segment === '.git')), 'Package contains repository metadata or node_modules.');

const mcpServers = mcpConfig?.mcpServers;
const dabraServer = mcpServers?.dabra;
check(mcpServers && typeof mcpServers === 'object' && !Array.isArray(mcpServers), '.mcp.json must contain an mcpServers object.');
check(dabraServer && typeof dabraServer === 'object' && !Array.isArray(dabraServer), '.mcp.json must define the dabra server.');
check(typeof dabraServer?.url === 'string', 'The dabra MCP server must define a URL.');
try {
  const mcpUrl = new URL(dabraServer?.url);
  check(mcpUrl.protocol === 'https:' && Boolean(mcpUrl.hostname), 'The dabra MCP URL must use public HTTPS.');
} catch {
  check(false, 'The dabra MCP URL must be a valid absolute URL.');
}
for (const file of packagedFiles.filter((candidate) => statSync(candidate).size <= 1024 * 1024 && /\.(?:json|md|txt)$/i.test(candidate))) {
  const text = readFileSync(file, 'utf8');
  check(!/(?:BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|sk-[A-Za-z0-9_-]{20,}|(?:service[_ -]?role[_ -]?key|api[_ -]?key|access[_ -]?token)\s*[:=]\s*["']?[A-Za-z0-9_-]{16,})/i.test(text), `Potential secret found in ${file}.`);
}

if (failures.length > 0) {
  console.error(JSON.stringify({ status: 'FAIL', failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    status: 'PASS',
    version: manifest.version,
    positiveCases: positive.length,
    negativeCases: negative.length,
    mcpServer: dabraServer.url,
    files: packagedFiles.map((file) => file.slice(pluginRoot.length + 1).replaceAll('\\', '/')),
  }, null, 2));
}
