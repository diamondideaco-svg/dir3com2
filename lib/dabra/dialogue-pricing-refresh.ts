import 'server-only';
import { createHash } from 'node:crypto';
import { APPROVED_DIALOGUE_STANDARD_PRICING } from './dialogue-pricing-approvals';
import type { AgentProviderId } from './agent-capabilities';
import type { DurableAccountChargeProof } from './dialogue-durable-authority';

export type PublicPricingAuthority = Pick<DurableAccountChargeProof, 'provider' | 'model' | 'pricingEvidenceSha256'> & Readonly<{ limitedOperation: Readonly<{ contractSha256: string }> }>;

const TTL_MS = 900000, MAX_BYTES = 2097152, FETCH_MS = 3000;
type Source = Readonly<{ model: string; url: string; pricing: string; fragment: string; format: 'markdown' | 'html' | 'gemini'; region: string; tariffBeforeMs: number | null }>;
/** A URL, parser meaning or rate change requires a new reviewed contract digest.
 * No URL, parser, rates or clock are accepted from the client or ENV. */
const sources: Readonly<Record<AgentProviderId, Source>> = Object.freeze({
  openai: { model: 'gpt-6-luna', url: 'https://developers.openai.com/api/docs/models/gpt-6-luna.md',
    pricing: 'f9083848feedd98bc6da2a74371778a40dfd959a6bc60ed0019956b253ba4b5a', fragment: '630071998d42a697ad40d324f88b02516d73cf500bdfda5cae18607371c83e77', format: 'markdown', region: 'provider-default-standard', tariffBeforeMs: null },
  anthropic: { model: 'claude-sonnet-5-5', url: 'https://platform.claude.com/docs/en/models/sonnet-5-5/overview.md',
    pricing: '97078a9f0fe05c81aafc8909295b404348606f4d572983bf2364201ca1737cb4', fragment: '5001e39ce7a58f4f5f17e20d5ff60925dd266749b83bf8a9d2b3fc973b22f0e3', format: 'markdown', region: 'provider-default-standard', tariffBeforeMs: null },
  gemini: { model: 'gemini-3.8-flash', url: 'https://aistudio.google.com/docs/pricing',
    pricing: '3eb3af6bedd4ea9270d45329f273b33a42a8fdb295934f5e48c987c7eac64a5f', fragment: '68fed00c4cd69d6d825f265c44b9246e637daf19a6f3a66f954d42ebee0c7e05', format: 'gemini', region: 'developer-api-standard', tariffBeforeMs: 1798761600000 },
  xai: { model: 'grok-4.20-0309-non-reasoning', url: 'https://docs.x.ai/developers/models/grok-4.20-0309-non-reasoning',
    pricing: 'fa66b834021e2d30ab2f62e32518c39fd7e93243ba476e9faf4c495e8a7904eb', fragment: '3d9c5062e66da8d7dc4053c796aeb6b8269623e446d6acf0093217cb9e6fc70f', format: 'html', region: 'provider-default-standard', tariffBeforeMs: null },
  deepseek: { model: 'deepseek-flash', url: 'https://api-docs.deepseek.com/quick_start/pricing/',
    pricing: '760a374be993aa01bd602bbdead31f1e58f642e473207e599816dc0790a28927', fragment: 'e5193131f2507895b0de9de233078876ba8e8c40bdaaad739cfe0d4579fed324', format: 'html', region: 'peak-ceiling-at-all-times', tariffBeforeMs: null },
  qwen: { model: 'qwen3.8-flash', url: 'https://www.alibabacloud.com/help/en/model-studio/model-pricing',
    pricing: '7559f2aeb7ea00f3d85592fa85371cc3a01ef1d1350b789e2b6a9239b1f635fb', fragment: 'a1a1be039332df9d947dcc065423b81c4886b79872b23ab3ec2177b5ce4fd3f0', format: 'html', region: 'singapore-international', tariffBeforeMs: null },
  mistral: { model: 'mistral-small-2603', url: 'https://docs.mistral.ai/inference/pricing',
    pricing: '72937a57dbc1f9145cbfcee02f2fb2188b7138bcd2814dbe104d6d03f48318b3', fragment: 'ce18d7f398dd149fb5b90348856c8c66a758f62d96cbc5f55968524f360ffc38', format: 'html', region: 'text-generalist-standard', tariffBeforeMs: null },
});
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const normal = (text: string) => text.replace(/\s+/g, ' ').trim();
function htmlText(text: string) {
  return normal(text.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#(?:39|x27);/g, "'").replace(/&nbsp;|&#160;/g, ' '));
}
function one<T>(values: readonly T[]) { return values.length === 1 ? values[0] : undefined; }
function fragment(provider: AgentProviderId, body: string): string | null {
  if (/<(?:iframe|frame)\b/i.test(body)) return null;
  const s = sources[provider];
  if (s.format === 'markdown') {
    if (!body.includes('Model ID: \x60' + s.model + '\x60')) return null;
    const heading = provider === 'openai' ? '## Pricing' : '### Pricing';
    const boundary = provider === 'openai' ? '#{1,2}' : '#{1,3}';
    const blocks = [...body.matchAll(new RegExp('(?:^|\\n)' + heading + '\\r?\\n([\\s\\S]*?)(?=\\n' + boundary + ' |$)', 'g'))];
    const block = one(blocks)?.[0];
    return block && block.includes(provider === 'openai' ? '1M tokens' : 'MTok') ? normal(block) : null;
  }
  if (provider === 'gemini') {
    const section = one([...body.matchAll(/(?:^|\n)## Gemini 3\.8 Flash[ \t]+\{% id="gemini-3\.8-flash" %\}([\s\S]*?)(?=\n## |$)/g)])?.[0];
    if (!section || !section.includes('*[\x60gemini-3.8-flash\x60]')) return null;
    const standard = one([...section.matchAll(/\{% tab title="Standard" %\}([\s\S]*?)\{% \/tab %\}/g)])?.[0];
    return standard && standard.includes('Paid Tier, per 1M tokens in USD')
      && standard.includes('Output price (including thinking tokens)') ? normal(standard) : null;
  }
  const tables = [...body.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)];
  if (provider === 'deepseek') {
    const table = one(tables.filter(t => htmlText(t[0]).startsWith('MODEL deepseek-flash ')));
    if (!table) return null;
    const after = body.slice(table.index + table[0].length).split(/<h2\b/i, 1)[0];
    return normal(htmlText(table[0]) + ' ' + htmlText(after));
  }
  if (provider === 'qwen') {
    const matches = tables.filter(t => htmlText(t[0]).includes('qwen3.8-flash ')
      && /Singapore\s*$/.test(htmlText(body.slice(Math.max(0, t.index - 1800), t.index))));
    const table = one(matches);
    if (!table) return null;
    const header = one([...table[0].matchAll(/<thead\b[^>]*>[\s\S]*?<\/thead>/gi)])?.[0];
    const row = one([...table[0].matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)].filter(r => /<p>qwen3\.8-flash<\/p>/.test(r[0])))?.[0];
    if (!header || !row || !htmlText(row).includes('International 0<Token≤1M')) return null;
    return normal('Singapore realtime nonbatch ' + htmlText(header) + ' ' + htmlText(row));
  }
  if (provider === 'mistral') {
    const groups = [...body.matchAll(/<div\b[^>]*\brole="group"[^>]*>[\s\S]*?<\/div>/gi)];
    const selected = (label: string, expected: string) => {
      const group = one(groups.filter(g => g[0].split('>')[0].includes('aria-label="' + label + '"')));
      if (!group) return false;
      const active = [...group[0].matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/gi)]
        .filter(b => /\baria-pressed="true"/.test(b[0].split('>')[0]));
      return active.length === 1 && htmlText(active[0][0]) === expected;
    };
    const regional = one([...body.matchAll(/<label\b[^>]*>[\s\S]*?<\/label>/gi)]
      .filter(l => htmlText(l[0]) === 'Regional inference'));
    if (!selected('Pricing mode','Standard') || !selected('Pricing currency','USD')
      || !regional || !/<button\b[^>]*role="checkbox"[^>]*aria-checked="false"/.test(regional[0])
      || /<input\b[^>]*\bchecked(?:=|\s|>)/i.test(regional[0])) return null;
    const table = one(tables.filter(t => htmlText(t[0]).startsWith('Model Input Cached input Output ')
      && t[0].includes('Mistral Small 4')));
    const row = table && one([...table[0].matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)]
      .filter(r => r[0].includes('Mistral Small 4') && r[0].includes('/models/mistral-small-4-0-26-03')))?.[0];
    if (!table || !row || !/^Prices \/M Tokens(?:\s|$)/.test(htmlText(body.slice(table.index + table[0].length)))) return null;
    return normal('Standard USD regional-inference-off text-only Model Input Cached input Output ' + htmlText(row) + ' Prices /M Tokens');
  }
  if (!htmlText(body).includes('Grok 4.20 (Non-Reasoning) grok-4.20-0309-non-reasoning')) return null;
  const heading = one([...body.matchAll(/<h2\b[^>]*>(?:(?!<\/h2>)[\s\S])*?<\/h2>/gi)].filter(h => htmlText(h[0]) === 'Pricing'));
  if (!heading) return null;
  const block = body.slice(heading.index + heading[0].length).split(/<h2\b/i, 1)[0];
  return htmlText(block);
}

export function approvedPublicPricingContract(provider: AgentProviderId, model: string, pricingDigest: string) {
  const s = sources[provider];
  if (!s || model !== s.model || pricingDigest !== s.pricing) return null;
  const rate = one(APPROVED_DIALOGUE_STANDARD_PRICING.filter(r => r.provider === provider && r.model === model
    && r.schema === 'reviewed-standard-pricing-v2' && r.sha256 === pricingDigest));
  if (!rate) return null;
  const contract = sha(JSON.stringify(['task217-public-pricing-contract-v1',provider,model,s.url,pricingDigest,s.fragment,
    'standard','USD',1000000,s.region,4096,1024,'text-only;no-tools;no-search;no-cache-write;nonbatch;no-premium',
    'all-generated-including-thinking',s.tariffBeforeMs]));
  return Object.freeze({ digest: contract, inputMicrosPerMillion: rate.inputMicrosPerMillion,
    outputMicrosPerMillion: rate.outputMicrosPerMillion, tariffBeforeMs: s.tariffBeforeMs });
}

export type PublicPricingObservation = Readonly<{
  schema: 'task217-public-pricing-observation-v1'; provider: AgentProviderId; model: string;
  approvedPricingDigest: string; approvedContractDigest: string; currency: 'USD'; unitTokens: 1000000;
  inputMicrosPerMillion: number; outputMicrosPerMillion: number;
  observedAtMs: number; expiresAtMs: number; bodySha256: string;
}>;
const issued = new WeakSet<PublicPricingObservation>();
const cache = new Map<string, PublicPricingObservation>();
const pending = new Map<string, Promise<PublicPricingObservation | null>>();

export function publicPricingObservationCurrent(value: PublicPricingObservation, proof: PublicPricingAuthority, now: number) {
  const contract = approvedPublicPricingContract(proof.provider, proof.model, proof.pricingEvidenceSha256);
  return issued.has(value) && contract !== null && Number.isSafeInteger(now) && now >= value.observedAtMs && now < value.expiresAtMs
    && value.expiresAtMs - value.observedAtMs <= TTL_MS && value.approvedContractDigest === contract.digest
    && value.approvedContractDigest === proof.limitedOperation.contractSha256 && value.approvedPricingDigest === proof.pricingEvidenceSha256
    && value.provider === proof.provider && value.model === proof.model
    && value.inputMicrosPerMillion === contract.inputMicrosPerMillion && value.outputMicrosPerMillion === contract.outputMicrosPerMillion;
}

/** The only observation constructor performs the actual allowlisted public GET.
 * Cache hits retain the original observation time. No raw body/Response is cached. */
export async function refreshPublicDialoguePricing(proof: PublicPricingAuthority, signal: AbortSignal): Promise<PublicPricingObservation | null> {
  let diagnosed = false;
  const reject = (reason: 'aborted' | 'contract_mismatch' | 'tariff_expired' | 'http'
    | 'redirect' | 'content_type' | 'body_unavailable' | 'body_limit' | 'extraction_failed'
    | 'fragment_hash_mismatch' | 'timeout' | 'fetch_or_decode_failed' | 'observation_invalid') => {
    if (!diagnosed) {
      diagnosed = true;
      // Fixed codes only. Never emit the source body, URL, proof, model or error.
      try { console.warn('DABRA_PUBLIC_PRICING', JSON.stringify({ reason, stage: 'preflight' })); } catch { /* No logging fallback. */ }
    }
    return null;
  };
  // A caller may cancel explicitly or supply AbortSignal.timeout. Classify only
  // the standard name; never log the caller's reason or error.
  const stopReason = () => signal.aborted && signal.reason?.name !== 'TimeoutError' ? 'aborted' as const : 'timeout' as const;
  const contract = approvedPublicPricingContract(proof.provider, proof.model, proof.pricingEvidenceSha256), s = sources[proof.provider];
  if (signal.aborted) return reject(stopReason());
  if (!contract || contract.digest !== proof.limitedOperation.contractSha256) return reject('contract_mismatch');
  const before = Date.now();
  if (s.tariffBeforeMs !== null && before >= s.tariffBeforeMs) return reject('tariff_expired');
  const key = contract.digest, hit = cache.get(key);
  if (hit && publicPricingObservationCurrent(hit, proof, before)) return hit;
  cache.delete(key);
  let work = pending.get(key);
  if (!work) {
    const controller = new AbortController(), bounded = AbortSignal.any([signal,controller.signal,AbortSignal.timeout(FETCH_MS)]);
    work = (async () => {
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      let stop: (() => void) | undefined;
      try {
        const stopped = new Promise<null>(resolve => {
          stop = () => { controller.abort(); void reader?.cancel().catch(() => {}); resolve(reject(stopReason())); };
          if (bounded.aborted) stop(); else bounded.addEventListener('abort', stop, { once: true });
        });
        const read = (async () => {
          const response = await fetch(s.url, { method: 'GET', redirect: 'error', credentials: 'omit', cache: 'no-store',
            headers: { Accept: s.format === 'html' ? 'text/html' : 'text/markdown,text/plain' }, signal: bounded });
          const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
          if (!response.ok) return reject('http');
          if (response.redirected || response.url !== s.url) return reject('redirect');
          if (!(s.format === 'html' ? contentType === 'text/html' : ['text/markdown','text/plain'].includes(contentType ?? ''))) return reject('content_type');
          if (!response.body) return reject('body_unavailable');
          const length = response.headers.get('content-length');
          if (length && (!/^[0-9]+$/.test(length) || Number(length) > MAX_BYTES)) return reject('body_limit');
          reader = response.body.getReader();
          const decoder = new TextDecoder('utf-8', { fatal: true }); let bytes = 0, body = '';
          while (true) {
            const part = await reader.read();
            if (bounded.aborted) return reject(stopReason());
            if (part.done) break;
            bytes += part.value.byteLength;
            if (bytes > MAX_BYTES) return reject('body_limit');
            body += decoder.decode(part.value, { stream: true });
          }
          body += decoder.decode();
          const extracted = fragment(proof.provider, body);
          if (!extracted) return reject('extraction_failed');
          if (sha(extracted) !== s.fragment) return reject('fragment_hash_mismatch');
          if (bounded.aborted) return reject(stopReason());
          const at = Date.now(), end = Math.min(at + TTL_MS, s.tariffBeforeMs ?? at + TTL_MS);
          const observation: PublicPricingObservation = Object.freeze({
            schema: 'task217-public-pricing-observation-v1', provider: proof.provider, model: proof.model,
            approvedPricingDigest: s.pricing, approvedContractDigest: contract.digest, currency: 'USD', unitTokens: 1000000,
            inputMicrosPerMillion: contract.inputMicrosPerMillion, outputMicrosPerMillion: contract.outputMicrosPerMillion,
            observedAtMs: at, expiresAtMs: end, bodySha256: sha(body),
          });
          issued.add(observation);
          return observation;
        })();
        return await Promise.race([read, stopped]);
      } catch { return reject(bounded.aborted ? stopReason() : 'fetch_or_decode_failed'); }
      finally {
        if (stop) bounded.removeEventListener('abort', stop);
        controller.abort(); void reader?.cancel().catch(() => {});
      }
    })();
    pending.set(key, work);
    void work.finally(() => { if (pending.get(key) === work) pending.delete(key); });
  }
  const observation = await work;
  if (signal.aborted) return reject(stopReason());
  if (!observation) return null;
  if (!publicPricingObservationCurrent(observation, proof, Date.now())) return reject('observation_invalid');
  cache.set(key, observation);
  return observation;
}
