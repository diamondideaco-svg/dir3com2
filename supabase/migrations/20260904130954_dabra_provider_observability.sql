CREATE TABLE IF NOT EXISTS public.dabra_provider_attempts (
  attempt_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('openai', 'gemini', 'anthropic', 'xai', 'deepseek', 'qwen', 'mistral')),
  model text,
  intent_class text NOT NULL CHECK (intent_class IN ('internal', 'general', 'fresh-web', 'travel-plan', 'other')),
  language text NOT NULL CHECK (language IN ('ar', 'en')),
  route text NOT NULL CHECK (route IN ('fast-chat', 'web')),
  started_at timestamptz NOT NULL,
  completed_at timestamptz NOT NULL,
  latency_ms integer NOT NULL CHECK (latency_ms >= 0),
  success boolean NOT NULL,
  error_category text CHECK (error_category IN ('timeout', 'upstream_503', 'rate_limit', 'authentication', 'configuration', 'model_access', 'provider_error', 'deadline_exceeded', 'unknown')),
  fallback_from text CHECK (fallback_from IS NULL OR fallback_from IN ('openai', 'gemini', 'anthropic', 'xai', 'deepseek', 'qwen', 'mistral')),
  fallback_reason text CHECK (fallback_reason IS NULL OR fallback_reason IN ('timeout', 'upstream_503', 'rate_limit', 'authentication', 'configuration', 'model_access', 'provider_error', 'deadline_exceeded', 'unknown')),
  fallback_hop integer NOT NULL DEFAULT 0 CHECK (fallback_hop >= 0),
  input_tokens integer CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens integer CHECK (output_tokens IS NULL OR output_tokens >= 0),
  estimated_cost_usd numeric(20, 12) CHECK (estimated_cost_usd IS NULL OR estimated_cost_usd >= 0),
  pricing_version text,
  grounding_status text NOT NULL CHECK (grounding_status IN ('grounded-global-web', 'answered-general', 'fallback-provider-unavailable')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dabra_provider_attempts_time_order CHECK (completed_at >= started_at),
  CONSTRAINT dabra_provider_attempts_error_truth CHECK ((success AND error_category IS NULL) OR (NOT success AND error_category IS NOT NULL)),
  CONSTRAINT dabra_provider_attempts_cost_truth CHECK ((estimated_cost_usd IS NULL AND pricing_version IS NULL) OR (estimated_cost_usd IS NOT NULL AND pricing_version IS NOT NULL))
);

COMMENT ON TABLE public.dabra_provider_attempts IS
  'Append-only, content-free operational telemetry for DABRA provider attempts. Never stores prompts, answers, headers, secrets, or customer identity.';

CREATE INDEX IF NOT EXISTS dabra_provider_attempts_created_at_idx ON public.dabra_provider_attempts (created_at DESC);
CREATE INDEX IF NOT EXISTS dabra_provider_attempts_provider_created_idx ON public.dabra_provider_attempts (provider, created_at DESC);
CREATE INDEX IF NOT EXISTS dabra_provider_attempts_request_idx ON public.dabra_provider_attempts (request_id, fallback_hop);
CREATE INDEX IF NOT EXISTS dabra_provider_attempts_success_created_idx ON public.dabra_provider_attempts (success, created_at DESC);
CREATE INDEX IF NOT EXISTS dabra_provider_attempts_model_created_idx ON public.dabra_provider_attempts (model, created_at DESC) WHERE model IS NOT NULL;

ALTER TABLE public.dabra_provider_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dabra_provider_attempts FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.dabra_provider_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.dabra_provider_attempts TO service_role;

CREATE OR REPLACE FUNCTION public.get_dabra_provider_metrics(
  p_since timestamptz DEFAULT (now() - interval '24 hours')
)
RETURNS TABLE (
  provider text,
  model text,
  attempt_count bigint,
  success_count bigint,
  failure_count bigint,
  success_rate numeric,
  fallback_count bigint,
  average_latency_ms numeric,
  p50_latency_ms numeric,
  p95_latency_ms numeric,
  p99_latency_ms numeric,
  timeout_count bigint,
  last_used timestamptz,
  last_success timestamptz,
  total_input_tokens bigint,
  total_output_tokens bigint,
  estimated_cost_usd numeric,
  error_categories jsonb
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  WITH filtered AS (
    SELECT *
    FROM public.dabra_provider_attempts
    WHERE created_at >= p_since
  ), grouped AS (
    SELECT
      f.provider,
      f.model,
      count(*)::bigint AS attempt_count,
      count(*) FILTER (WHERE f.success)::bigint AS success_count,
      count(*) FILTER (WHERE NOT f.success)::bigint AS failure_count,
      round(count(*) FILTER (WHERE f.success)::numeric / NULLIF(count(*), 0), 6) AS success_rate,
      count(*) FILTER (WHERE f.fallback_hop > 0)::bigint AS fallback_count,
      round(avg(f.latency_ms), 2) AS average_latency_ms,
      round(percentile_cont(0.50) WITHIN GROUP (ORDER BY f.latency_ms)::numeric, 2) AS p50_latency_ms,
      round(percentile_cont(0.95) WITHIN GROUP (ORDER BY f.latency_ms)::numeric, 2) AS p95_latency_ms,
      round(percentile_cont(0.99) WITHIN GROUP (ORDER BY f.latency_ms)::numeric, 2) AS p99_latency_ms,
      count(*) FILTER (WHERE f.error_category IN ('timeout', 'deadline_exceeded'))::bigint AS timeout_count,
      max(f.completed_at) AS last_used,
      max(f.completed_at) FILTER (WHERE f.success) AS last_success,
      coalesce(sum(f.input_tokens), 0)::bigint AS total_input_tokens,
      coalesce(sum(f.output_tokens), 0)::bigint AS total_output_tokens,
      round(sum(f.estimated_cost_usd), 12) AS estimated_cost_usd
    FROM filtered f
    GROUP BY f.provider, f.model
  ), errors AS (
    SELECT f.provider, f.model, jsonb_object_agg(f.error_category, f.error_count ORDER BY f.error_category) AS error_categories
    FROM (
      SELECT provider, model, error_category, count(*)::bigint AS error_count
      FROM filtered
      WHERE error_category IS NOT NULL
      GROUP BY provider, model, error_category
    ) f
    GROUP BY f.provider, f.model
  )
  SELECT
    g.provider,
    g.model,
    g.attempt_count,
    g.success_count,
    g.failure_count,
    g.success_rate,
    g.fallback_count,
    g.average_latency_ms,
    g.p50_latency_ms,
    g.p95_latency_ms,
    g.p99_latency_ms,
    g.timeout_count,
    g.last_used,
    g.last_success,
    g.total_input_tokens,
    g.total_output_tokens,
    g.estimated_cost_usd,
    coalesce(e.error_categories, '{}'::jsonb)
  FROM grouped g
  LEFT JOIN errors e ON e.provider = g.provider AND e.model IS NOT DISTINCT FROM g.model
  ORDER BY g.provider, g.model;
$function$;

REVOKE ALL ON FUNCTION public.get_dabra_provider_metrics(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_dabra_provider_metrics(timestamptz) TO service_role;
