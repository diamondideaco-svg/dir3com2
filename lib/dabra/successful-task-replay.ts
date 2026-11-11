import 'server-only';
import { publicDialogueActor } from './public-dialogue-policy';
import { successfulTaskInputDigest, readSyntheticSuccessfulTaskAllowance, boundedSuccessfulTaskRpc, boundedSuccessfulTaskOperation, successfulTaskAuthorityCurrent } from './successful-task-development';
import type { FundingRpc } from './dialogue-funding-store';

type Input = Parameters<typeof successfulTaskInputDigest>[0];
type SyntheticReplayDependencies = {
  dataScope: 'synthetic-only'; rpc: FundingRpc;
  /** Resolve authenticated account, canonical original input and current continuity receipt server-side. */
  resolveInput: (request: Request, signal: AbortSignal) => Promise<Input | null>;
};
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization',
  'Cross-Origin-Resource-Policy': 'same-origin', 'X-Content-Type-Options': 'nosniff' };
/** Default dependency is deliberately absent. Neither a request nor an env switch can install it. */
export async function successfulTaskReplayResponse(request: Request, deps?: SyntheticReplayDependencies): Promise<Response> {
  const unavailable = () => Response.json({ enabled: false, error: 'Task replay is unavailable.' }, {status:503,headers});
  if (!deps || process.env.NODE_ENV !== 'test' || deps.dataScope !== 'synthetic-only') return unavailable();
  try {
    return await boundedSuccessfulTaskOperation(async bounded => {
    const body = await request.clone().json();
    if (typeof body.requestId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(body.requestId))
      return Response.json({error:'Invalid request.'},{status:400,headers});
    if (bounded.aborted) return unavailable();
    const input = await deps.resolveInput(request, bounded), actor = input && publicDialogueActor(input.context);
    if (!input || !actor || (input.trip && !input.continuityBinding)
      || !await successfulTaskAuthorityCurrent(input,bounded))
      return Response.json({error:'Task unavailable.'},{status:404,headers});
    const row = await boundedSuccessfulTaskRpc(deps.rpc,'read_dabra_successful_task',{
      p_actor_id:actor,p_request_id:body.requestId,p_input_digest:successfulTaskInputDigest(input),
    },bounded);
    if (!await successfulTaskAuthorityCurrent(input,bounded)) return Response.json({error:'Task unavailable.'},{status:404,headers});
    if(row.state==='absent')return Response.json({error:'Task unavailable.'},{status:404,headers});
    if(row.state==='conflict')return Response.json({error:'Request input conflicts.'},{status:409,headers});
    if(row.state!=='succeeded')return Response.json({state:['pending','unknown','failed'].includes(String(row.state))?row.state:'unknown',saved:false},{status:409,headers});
    if(typeof row.answer!=='string'||!row.answer.trim()||row.answer.length>64000||row.language!==input.locale)
      return Response.json({state:'expired',saved:false},{status:410,headers});
    const allowance=await readSyntheticSuccessfulTaskAllowance(deps.rpc,input,bounded);
    if (bounded.aborted || !await successfulTaskAuthorityCurrent(input,bounded)) return unavailable();
    return Response.json({answer:row.answer,language:input.locale,saved:true,replay:true}, {
      headers:{...headers,...(allowance?{'X-DABRA-Successful-Task-Allowance':JSON.stringify(allowance)}:{})},
    });
    }, request.signal);
  } catch { return unavailable(); }
}
