-- Task217: LOCAL REVIEW ARTIFACT ONLY. production_apply_authorized=false
-- Expected credential references only; no seed, money, grant, profile or enabling data.
-- Existing function signature/owner/ACL are preserved; no new runtime writer.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE private.dabra_dialogue_funding_control ADD COLUMN credential_bindings jsonb;
ALTER TABLE private.dabra_dialogue_funding_control ADD CONSTRAINT dabra_dialogue_funding_control_credential_bindings_check CHECK (
  credential_bindings IS NULL OR (jsonb_typeof(credential_bindings)='object'
    AND credential_bindings - ARRAY['openai','gemini','anthropic','xai','deepseek','qwen','mistral']::text[] = '{}'::jsonb
    AND (NOT (credential_bindings ? 'openai') OR (jsonb_typeof(credential_bindings->'openai')='string' AND credential_bindings->>'openai' ~ '^[a-f0-9]{64}$'))
    AND (NOT (credential_bindings ? 'gemini') OR (jsonb_typeof(credential_bindings->'gemini')='string' AND credential_bindings->>'gemini' ~ '^[a-f0-9]{64}$'))
    AND (NOT (credential_bindings ? 'anthropic') OR (jsonb_typeof(credential_bindings->'anthropic')='string' AND credential_bindings->>'anthropic' ~ '^[a-f0-9]{64}$'))
    AND (NOT (credential_bindings ? 'xai') OR (jsonb_typeof(credential_bindings->'xai')='string' AND credential_bindings->>'xai' ~ '^[a-f0-9]{64}$'))
    AND (NOT (credential_bindings ? 'deepseek') OR (jsonb_typeof(credential_bindings->'deepseek')='string' AND credential_bindings->>'deepseek' ~ '^[a-f0-9]{64}$'))
    AND (NOT (credential_bindings ? 'qwen') OR (jsonb_typeof(credential_bindings->'qwen')='string' AND credential_bindings->>'qwen' ~ '^[a-f0-9]{64}$'))
    AND (NOT (credential_bindings ? 'mistral') OR (jsonb_typeof(credential_bindings->'mistral')='string' AND credential_bindings->>'mistral' ~ '^[a-f0-9]{64}$'))
  )
);

-- NULL is an explicit service-role-only reference read, never a Customer identity.
-- The original non-NULL financial path below remains byte-identical.
CREATE OR REPLACE FUNCTION public.get_dabra_dialogue_funding_policy(p_subject_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c private.dabra_dialogue_funding_control%ROWTYPE; proofs jsonb;
BEGIN
  IF p_subject_hash IS NULL THEN
    SELECT * INTO c FROM private.dabra_dialogue_funding_control WHERE singleton=true;
    IF NOT FOUND THEN RETURN NULL; END IF;
    RETURN jsonb_build_object('credentialBindings',coalesce(c.credential_bindings,'{}'::jsonb));
  END IF;
  IF p_subject_hash IS NULL OR p_subject_hash !~ '^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
  SELECT * INTO c FROM private.dabra_dialogue_funding_control WHERE singleton=true;
  IF NOT FOUND OR NOT c.enabled OR (p_subject_hash=ANY(c.subject_hashes)) IS NOT TRUE THEN RETURN NULL; END IF;
  SELECT coalesce(jsonb_agg(g.proof),'[]'::jsonb) INTO proofs FROM private.dabra_dialogue_funding_grants g WHERE g.enabled;
  RETURN jsonb_build_object('enabled',true,'profiles',c.profiles,'proofs',proofs,'maxCostMicros',c.max_attempt_cost_micros,'dailyLimits',c.daily_limits);
END $$;
COMMIT;
