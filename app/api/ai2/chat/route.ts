import type { SuccessfulTaskContinuityBinding } from '@/lib/dabra/continuity-chat-server';
import { selectSuccessfulTaskPilot, successfulTaskProductionGate } from '@/lib/dabra/successful-task-production-policy';
import { successfulTaskChatResponse } from '@/lib/dabra/successful-task-chat';
import { conversationIntent } from '@/lib/dabra/conversation-renderer';
import { after, NextRequest, NextResponse } from 'next/server';
import { platformCurrency, platformContext, platformConversationScope, platformFamilies, refinePlatformTrip, hasActivePlatformDriveDialogue } from '@/lib/dabra/platform-assistant';
type AI2ChatTurn = { role: 'user' | 'assistant'; content: string };
import { createDabraAssistantTextResponse } from '@/lib/dabra/chat-response-contract';
import { validateAndNormalizeDocumentFile } from '@/lib/security/document-validation';
import { DABRA_LOCALE_ERROR, parseDabraLocale } from '@/lib/dabra/locale-contract';
import { getCurrencySnapshot } from '@/lib/currency/service';
import { parseDisplayCurrency } from '@/lib/currency/display';
import { agentIntent, type AgentContext } from '@/lib/dabra/agent-contract';
import { getAgentDialoguePolicy } from '@/lib/dabra/agent-dialogue';
import { runInternalAgentTask } from '@/lib/dabra/agent-handoff';
import { parseContinuityChatTrip } from '@/lib/dabra/continuity-chat';
export const dynamic = 'force-dynamic';

type AI2ChatRequest = {
  message?: string;
  requestId?: string;
  currency?: string;
  history?: Array<{ role?: string; content?: string }>;
  mode?: 'chat' | 'travel-plan';
  stream?: boolean;
  locale?: 'ar' | 'en';
  continuityTrip?: unknown;
};

type ParsedChatRequest = { body: AI2ChatRequest | null; attachmentCount: number; attachmentError: boolean };

const MAX_HISTORY_TURNS = 8;
const MAX_TURN_LENGTH = 500;
const MAX_ATTACHMENTS = 3;
async function parseChatRequest(request: NextRequest): Promise<ParsedChatRequest> {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.startsWith('multipart/form-data')) {
    try { return { body: (await request.json()) as AI2ChatRequest, attachmentCount: 0, attachmentError: false }; }
    catch { return { body: null, attachmentCount: 0, attachmentError: false }; }
  }
  try {
    const form = await request.formData();
    const streamValue = form.get('stream');
    const rawHistory = form.get('history');
    let history: AI2ChatRequest['history'];
    if (typeof rawHistory === 'string') {
      try { history = JSON.parse(rawHistory) as AI2ChatRequest['history']; } catch { history = []; }
    }
    const stream = streamValue === 'true' ? true : streamValue === 'false' || streamValue === null ? undefined : streamValue as unknown as boolean;
    const modeValue = form.get('mode');
    const mode = modeValue === 'chat' || modeValue === 'travel-plan' ? modeValue : undefined;
    const localeValue = form.get('locale');
    const locale = parseDabraLocale(localeValue);
    const body: AI2ChatRequest = { currency: typeof form.get('currency') === 'string' ? String(form.get('currency')) : undefined, message: String(form.get('message') ?? ''), history, stream, mode, locale: locale ?? undefined };
    const rawTrip = form.get('continuityTrip');
    if (rawTrip !== null) {
      try { body.continuityTrip = typeof rawTrip === 'string' ? JSON.parse(rawTrip) : null; }
      catch { body.continuityTrip = null; }
    }
    const files = form.getAll('attachment');
    if (files.length > MAX_ATTACHMENTS || files.some((item) => !(item instanceof File))) return { body, attachmentCount: 0, attachmentError: true };
    const seen = new Set<string>();
    for (const item of files) {
      const validated = await validateAndNormalizeDocumentFile(item);
      if (!validated.ok) return { body, attachmentCount: 0, attachmentError: true };
      const digestInput = Uint8Array.from(validated.data.bytes).buffer;
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', digestInput))).map((byte) => byte.toString(16).padStart(2, '0')).join('');
      seen.add(digest);
    }
    return { body, attachmentCount: seen.size, attachmentError: false };
  } catch {
    return { body: null, attachmentCount: 0, attachmentError: true };
  }
}

function sanitizeHistory(raw: AI2ChatRequest['history']): AI2ChatTurn[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((entry): entry is { role: string; content: string } =>
      Boolean(entry) && (entry?.role === 'user' || entry?.role === 'assistant') && typeof entry?.content === 'string' && entry.content.trim().length > 0,
    )
    .slice(-MAX_HISTORY_TURNS)
    .map((entry) => ({ role: entry.role as AI2ChatTurn['role'], content: entry.content.trim().slice(0, MAX_TURN_LENGTH) }));
}

export async function POST(request: NextRequest) {
  const pilot = await selectSuccessfulTaskPilot(request);
  if (pilot.kind === 'unavailable') return NextResponse.json({ saved: false, error: 'Task unavailable.' }, {
    status: 503, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization' },
  });
  const productionPolicy = pilot.kind === 'pilot' ? pilot : null;
  // Public discovery is read-only. Submission uses the existing authenticated REQ flow.
  const parsed = await parseChatRequest(request);
  const { body } = parsed;
  const locale = parseDabraLocale(body?.locale) ?? (/[؀-ۿ]/u.test(body?.message ?? '') ? 'ar' : 'en');

  if (body?.locale !== undefined && !parseDabraLocale(body.locale)) {
    return NextResponse.json({ error: 'Invalid locale.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }

  if (body?.stream !== undefined && typeof body.stream !== 'boolean') {
    return NextResponse.json(
      { error: 'Invalid stream mode.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  if (parsed.attachmentError) {
    if (body?.stream === true) return createDabraAssistantTextResponse(null, { status: 400, fallback: DABRA_LOCALE_ERROR[locale] });
    return NextResponse.json({ error: 'Invalid attachment.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }

  const message = typeof body?.message === 'string' ? body.message.trim().slice(0, MAX_TURN_LENGTH) : '';

  // Intent and topic scope use user text only; this note is server-owned model context.
  const serverAttachmentNote = parsed.attachmentCount
    ? (locale === 'ar' ? `[أرفق المستخدم ${parsed.attachmentCount} ملفًا تحقق الخادم من سلامة نوعه. محتوى الملفات غير مُرسل إلى مزود الذكاء الاصطناعي، فلا تدّعِ قراءته.]` : `[The user attached ${parsed.attachmentCount} server-validated file(s). Their contents are not sent to the AI provider, so do not claim to have read them.]`)
    : undefined;
  let scopedMessage = message;

  if (!message) {
    if (body?.stream === true) {
      return createDabraAssistantTextResponse(null, { status: 400, fallback: DABRA_LOCALE_ERROR[locale] });
    }
    return NextResponse.json(
      {
        error: 'Message is required.',
      },
      {
        status: 400,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  const rawRequestId = request.headers.get('X-DABRA-Request-Id') ?? body?.requestId;
  const requestId = typeof rawRequestId === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(rawRequestId)
    ? rawRequestId.toLowerCase() : undefined;
  if (rawRequestId !== undefined && rawRequestId !== null && !requestId) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400, headers: { 'Cache-Control': 'private, no-store' } });
  }
  let history = sanitizeHistory(body?.history);
  let trip = null;
  let continuityBinding: Readonly<{ revision: number; generation: number }> | undefined;
  let successfulTaskContinuityBinding: SuccessfulTaskContinuityBinding | undefined;
  let tripIsCurrent: (() => Promise<boolean>) | undefined;
  if (body?.continuityTrip !== undefined) {
    const input = parseContinuityChatTrip(body.continuityTrip);
    if (!input) return NextResponse.json({ error: 'Invalid continuity context.' }, { status: 400, headers: { 'Cache-Control': 'private, no-store' } });
    try {
      const { resolveContinuityChatTrip, resolveContinuityChatTripReceipt } = await import('@/lib/dabra/continuity-chat-server');
      if (productionPolicy != null) {
        const resolved = await resolveContinuityChatTripReceipt(request, input);
        trip = resolved?.trip ?? null; successfulTaskContinuityBinding = resolved?.binding;
      } else trip = await resolveContinuityChatTrip(request, input);
      const original=JSON.stringify(trip);
      tripIsCurrent=async()=>{try{const fresh=await resolveContinuityChatTrip(request,input);return !!fresh&&JSON.stringify(fresh)===original;}catch{return false;}};
    } catch { /* Unavailable authenticated continuity fails closed. */ }
    if (!trip) return NextResponse.json({ error: 'Continuity context expired or changed.' }, { status: 409, headers: { 'Cache-Control': 'private, no-store' } });
    continuityBinding = { revision: input.revision, generation: input.generation };
    trip = refinePlatformTrip(trip, message);
  }
  if (body?.currency !== undefined && !parseDisplayCurrency(body.currency)) return NextResponse.json({ error: 'Invalid currency.' }, { status: 400, headers: { 'Cache-Control': 'private, no-store' } });
  ({ message: scopedMessage, history, trip } = platformConversationScope(scopedMessage, history, trip));
  let intent = agentIntent(scopedMessage);
  let agentContext: AgentContext = { role: 'guest', readRequests: async () => ({ kind: 'authentication_required' }) };
  const inferenceEnabled = process.env.DABRA_INTERNAL_AI_ENABLED === 'true';
  const publicUtility = ['weather', 'currency', 'maps'].includes(intent.tool);
  if ((intent.tool !== 'discover' && !publicUtility) || inferenceEnabled || productionPolicy != null || pilot.kind === 'legacy') {
    const { resolveAgentContext } = await import('@/lib/dabra/agent-context');
    agentContext = await resolveAgentContext(request);
    if ((pilot.kind === 'pilot' || pilot.kind === 'legacy') && (
      !agentContext.taskAuthority || !('actorId' in agentContext.taskAuthority)
      || agentContext.taskAuthority.actorId !== pilot.actorId
      || (agentContext.role === 'ceo' ? 'admin' : agentContext.role) !== pilot.role)) {
      return NextResponse.json({ saved: false, error: 'Task unavailable.' }, {
        status: 503, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization' },
      });
    }
  }
  if (tripIsCurrent && trip && agentContext.isTaskAuthorityCurrent) {
    const authIsCurrent=agentContext.isTaskAuthorityCurrent;
    const ownedTripIsCurrent=tripIsCurrent;
    agentContext={...agentContext,isTaskAuthorityCurrent:async()=>await authIsCurrent()&&await ownedTripIsCurrent()&&await authIsCurrent()};
  }
  const context = platformContext(scopedMessage, history, trip);
  let needsClarification = false;
  // One canonical input for both paths. Receipt is included only after the
  // authenticated continuity read above, and only while its trip remains in scope.
  const resolveTaskInput = async () => {
    const currency = parseDisplayCurrency(body?.currency) ?? platformCurrency(context);
    const needsRates = currency && !publicUtility && (intent.tool !== 'discover' || platformFamilies(context).includes('drive') || /trip|itinerary|رحلة|رحله/.test(context));
    const snapshot = needsRates ? await getCurrencySnapshot() : null;
    return { message: scopedMessage, serverAttachmentNote, history, locale, context: agentContext, intent, needsClarification,
      pricing: currency ? { currency, snapshot } : undefined, trip, continuityBinding: trip ? continuityBinding : undefined, successfulTaskContinuityBinding: trip ? successfulTaskContinuityBinding : undefined };
  };
  // Only the selected Core path consumes this canonical input; failure never funds legacy.
  const productionGate = await successfulTaskProductionGate(productionPolicy, request, undefined,
    { resolveInput: resolveTaskInput, requestId, stream: body?.stream === true });
  if (productionGate) return productionGate;
  // No adapter is installed. Only an explicitly injected synthetic dependency
  // in isolated tests can select this path; request data and ENV cannot select it.
  const successfulTaskResponse = await successfulTaskChatResponse(resolveTaskInput, requestId, request.signal, body?.stream === true);
  if (successfulTaskResponse) return successfulTaskResponse;
  let dialoguePolicy = await getAgentDialoguePolicy(agentContext, request.signal, parsed.attachmentCount ? undefined : requestId);
  let understanding: string = 'internal-rules';
  let understandingProvider: string | undefined;
  // Only authenticated ambiguity uses the optional classifier. It cannot read
  // records, grant roles or generate customer-facing facts/actions.
  const classifierActor = agentContext.taskAuthority;
  const publicCustomer = agentContext.role === 'customer' && classifierActor?.kind === 'customer'
    && classifierActor.actorId === classifierActor.ownerId && !!agentContext.isTaskAuthorityCurrent;
  if (inferenceEnabled && dialoguePolicy.trial && (dialoguePolicy.admission || dialoguePolicy.funding)
    && !dialoguePolicy.publicMonthly && !conversationIntent(scopedMessage) && publicCustomer && intent.tool === 'discover' && !platformFamilies(scopedMessage).length
    && !hasActivePlatformDriveDialogue({ message: scopedMessage, history, context, trip })) {
    const { planInternalAgentTool } = await import('@/lib/dabra/agent-planner');
    const { createDabraProviderAttemptAfterResponseScheduler } = await import('@/lib/ai2/observability/provider-attempts');
    const planned = await planInternalAgentTool(scopedMessage, { language: locale,
      scheduleAttempt: createDabraProviderAttemptAfterResponseScheduler(after) },
      { policy: dialoguePolicy, context: agentContext, signal: request.signal });
    understanding = planned.status;
    needsClarification = planned.status === 'unavailable' || planned.status === 'invalid';
    understandingProvider = planned.status === 'ok' ? planned.provider : undefined;
    if (planned.tool) intent = { ...intent, tool: planned.tool };
    // An uncertain limited classifier attempt retains its reservation. Do not
    // follow it with another provider stage or a hidden fallback.
    if (planned.status !== 'ok' && dialoguePolicy.funding?.proofs.some(proof => 'limitedOperation' in proof)) {
      dialoguePolicy = { ...dialoguePolicy, profiles: [] };
    }
  }
  const taskResult = await runInternalAgentTask(await resolveTaskInput(), { signal: request.signal, dialogue: dialoguePolicy, responseContract: dialoguePolicy.publicMonthly ? 'platform-dialogue' : 'platform-units' });
  if (taskResult.kind === 'stopped') return NextResponse.json({ error: DABRA_LOCALE_ERROR[locale] }, { status: 409, headers: { 'Cache-Control': 'private, no-store' } });
  const response = taskResult.response;
  if (body?.stream === true) {
    const streamed = createDabraAssistantTextResponse(response);
    streamed.headers.set('X-DABRA-Understanding', understanding);
    if (understandingProvider) streamed.headers.set('X-DABRA-Understanding-Provider', understandingProvider);
    if (intent.tool !== 'discover') streamed.headers.set('X-DABRA-Private-Context', '1');
    return streamed;
  }
  return NextResponse.json({ ...response, understanding, understandingProvider }, { headers: { 'Cache-Control': 'private, no-store' } });
}

/** CEO-only, read-only diagnostic; the existing POST dialogue path is unchanged. */
export async function GET(request: NextRequest) {
  try {
    const [{ checkRuntimeCredentialBinding, isCredentialBindingCoreProject }, { internalAgentCredential },
      { createSupabaseRequestClient, supabaseAdmin, getSupabaseAdminHostname, getSupabaseClientHostname }, { isCeoActor }] = await Promise.all([
      import('@/lib/dabra/credential-binding'),
      import('@/lib/ai2/runtime/agent-provider-dispatch'),
      import('@/lib/supabase/server'),
      import('@/lib/auth/team-access'),
    ]);
    return await checkRuntimeCredentialBinding(request, {
      async authorize() {
        const auth = await createSupabaseRequestClient(request);
        if (!auth || !isCredentialBindingCoreProject(getSupabaseClientHostname(auth.supabase))) return null;
        return await isCeoActor(auth.supabase, auth.user) ? auth.user.id : null;
      },
      async readBindings(signal) {
        if (!supabaseAdmin) return { kind: 'error' };
        const { data, error } = await supabaseAdmin.rpc('get_dabra_dialogue_funding_policy', {
          p_subject_hash: null,
        }).abortSignal(signal);
        return error ? { kind: 'error' } : { kind: 'ok', data };
      },
      readCredential: internalAgentCredential,
      runtime: () => ({ environment: process.env.VERCEL_ENV, sourceSha: process.env.VERCEL_GIT_COMMIT_SHA,
        databaseHostname: getSupabaseAdminHostname() }),
    });
  } catch {
    return Response.json({ status: 'ERROR' }, { status: 503, headers: {
      'Cache-Control': 'private, no-store', 'Cross-Origin-Resource-Policy': 'same-origin',
      'X-Content-Type-Options': 'nosniff', Vary: 'Cookie, Authorization',
    } });
  }
}
