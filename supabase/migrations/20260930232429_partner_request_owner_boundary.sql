-- Task #182. Isolated QA/review only; separate Production authorization required.
-- Preserve historical requests, prices and handoff events. Do not infer historical
-- ownership from today's product mappings or from an old product-scoped handoff.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.marketplace_requests ADD COLUMN partner_owner_id uuid
  REFERENCES public.partners(id) ON DELETE RESTRICT;
COMMENT ON COLUMN public.marketplace_requests.partner_owner_id IS
  'Immutable server-derived partner at request creation. NULL means unassigned, not visible to partners. Not supplier confirmation.';
CREATE INDEX marketplace_requests_partner_owner ON public.marketplace_requests(partner_owner_id, created_at DESC)
  WHERE partner_owner_id IS NOT NULL;

CREATE FUNCTION public.bind_marketplace_request_partner_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_owners uuid[];
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.partner_owner_id IS DISTINCT FROM OLD.partner_owner_id
      OR (OLD.partner_owner_id IS NOT NULL AND
        (NEW.product_id IS DISTINCT FROM OLD.product_id OR NEW.user_id IS DISTINCT FROM OLD.user_id)) THEN
      RAISE EXCEPTION 'REQUEST_PARTNER_OWNER_IMMUTABLE' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  -- Client/API input cannot choose or assert a partner identity.
  IF NEW.partner_owner_id IS NOT NULL THEN
    RAISE EXCEPTION 'REQUEST_PARTNER_OWNER_SERVER_ONLY' USING ERRCODE='23514';
  END IF;
  -- Managed Drive has no product_id. Its Egypt Operations flow is unchanged.
  IF NEW.product_id IS NULL THEN RETURN NEW; END IF;
  SELECT array_agg(DISTINCT pa.partner_id) INTO v_owners
    FROM public.product_availability pa WHERE pa.product_id=NEW.product_id AND pa.partner_id IS NOT NULL;
  -- A shared catalogue product is not permission for every mapped partner.
  -- Ambiguous/unmapped inventory stays Operations-only, never guessed.
  IF cardinality(v_owners)=1 AND EXISTS (
    SELECT 1 FROM public.partners partner JOIN public.profiles profile ON profile.id=partner.id
    WHERE partner.id=v_owners[1] AND partner.status='active' AND partner.deleted_at IS NULL
      AND profile.role='partner' AND profile.status='active' AND profile.deleted_at IS NULL
  ) THEN NEW.partner_owner_id := v_owners[1]; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.bind_marketplace_request_partner_owner() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER marketplace_request_partner_owner
BEFORE INSERT OR UPDATE ON public.marketplace_requests
FOR EACH ROW EXECUTE FUNCTION public.bind_marketplace_request_partner_owner();

CREATE OR REPLACE FUNCTION public.get_partner_marketplace_requests(p_actor_user_id uuid, p_request_id uuid DEFAULT NULL::uuid)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_role text;
  v_status text;
  v_deleted timestamptz;
  v_partner_status text;
BEGIN
  SELECT p.role,p.status,p.deleted_at INTO v_role,v_status,v_deleted
  FROM public.profiles p
  WHERE p.id=p_actor_user_id
  FOR SHARE;
  IF NOT FOUND OR v_role IS DISTINCT FROM 'partner'
     OR v_status IS DISTINCT FROM 'active' OR v_deleted IS NOT NULL THEN
    RAISE EXCEPTION 'PARTNER_REQUEST_ACTOR_DENIED' USING ERRCODE='42501';
  END IF;
  SELECT partner.status INTO v_partner_status
  FROM public.partners partner
  WHERE partner.id=p_actor_user_id AND partner.deleted_at IS NULL
  FOR SHARE;
  IF NOT FOUND OR v_partner_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'PARTNER_REQUEST_ACTOR_DENIED' USING ERRCODE='42501';
  END IF;

  RETURN QUERY
  SELECT jsonb_build_object(
    'id',r.id,
    'request_reference',r.request_reference,
    'product_id',r.product_id,
    'request_type',r.request_type,
    'status',r.status,
    'requested_for',r.requested_for,
    'traveller_count',r.traveller_count,
    'marketplace_family',r.marketplace_family,
    'supplier_name',r.supplier_name,
    'service_name',r.service_name,
    'fulfilment_method',r.fulfilment_method,
    'transaction_method',r.transaction_method,
    'handoff_type',r.handoff_type,
    'handoff_reference',r.handoff_reference,
    'handoff_started_at',r.handoff_started_at,
    'next_action',r.next_action,
    'created_at',r.created_at,
    'updated_at',r.updated_at,
    'products',jsonb_build_object(
      'name_ar',p.name_ar,'name_en',p.name_en,'slug',p.slug,
      'city',p.city,'country',p.country
    ),
    'timeline',jsonb_build_array(jsonb_build_object(
      'type','request_submitted','at',r.created_at
    )) || coalesce((
      SELECT jsonb_agg(event ORDER BY event->>'at')
      FROM (
        SELECT jsonb_build_object(
          'type','status_updated','at',a.created_at,
          'previousStatus',a.previous_status,'status',a.new_status
        ) AS event
        FROM public.marketplace_request_audit_logs a
        WHERE a.request_id=r.id
        UNION ALL
        SELECT jsonb_build_object(
          'type',coalesce(e.handoff_type,'handoff') || '_handoff_started',
          'at',e.created_at,'status',e.request_status_at_handoff
        ) AS event
        FROM public.marketplace_request_handoff_events e
        WHERE e.request_id=r.id
      ) timeline_events
    ),'[]'::jsonb)
  )
  FROM public.marketplace_requests r
  LEFT JOIN public.products p ON p.id=r.product_id
  WHERE r.partner_owner_id=p_actor_user_id
    AND (p_request_id IS NULL OR r.id=p_request_id)
    AND EXISTS (
      SELECT 1 FROM public.product_availability pa
      WHERE pa.product_id=r.product_id
        AND pa.partner_id=p_actor_user_id
    )
  ORDER BY r.created_at DESC;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.start_partner_marketplace_request_handoff(p_actor_user_id uuid, p_request_id uuid, p_whatsapp_destination text)
 RETURNS TABLE(request_id uuid, request_reference text, product_id uuid, initiated_by_partner_user_id uuid, handoff_type text, handoff_reference text, request_status_at_handoff text, whatsapp_destination text, message_snapshot text, created_at timestamp with time zone, replayed boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_role text;
  v_profile_status text;
  v_deleted timestamptz;
  v_partner_status text;
  v_request_status text;
  v_product_id uuid;
  v_request_reference text;
  v_service_name text;
  v_requested_for timestamptz;
  v_traveller_count integer;
  v_reference text;
  v_destination text := nullif(btrim(coalesce(p_whatsapp_destination,'')), '');
  v_message text;
  v_availability_id uuid;
  v_event public.marketplace_request_handoff_events%ROWTYPE;
BEGIN
  SELECT p.role,p.status,p.deleted_at INTO v_role,v_profile_status,v_deleted
  FROM public.profiles p
  WHERE p.id=p_actor_user_id
  FOR SHARE;
  IF NOT FOUND OR v_role IS DISTINCT FROM 'partner'
     OR v_profile_status IS DISTINCT FROM 'active' OR v_deleted IS NOT NULL THEN
    RAISE EXCEPTION 'PARTNER_HANDOFF_ACTOR_DENIED' USING ERRCODE='42501';
  END IF;
  SELECT partner.status INTO v_partner_status
  FROM public.partners partner
  WHERE partner.id=p_actor_user_id AND partner.deleted_at IS NULL
  FOR SHARE;
  IF NOT FOUND OR v_partner_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'PARTNER_HANDOFF_ACTOR_DENIED' USING ERRCODE='42501';
  END IF;

  SELECT r.status,r.product_id,r.request_reference,r.service_name,r.requested_for,r.traveller_count
    INTO v_request_status,v_product_id,v_request_reference,v_service_name,v_requested_for,v_traveller_count
  FROM public.marketplace_requests r
  WHERE r.id=p_request_id AND r.partner_owner_id=p_actor_user_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REQUEST_PARTNER_SCOPE_DENIED'; END IF;
  v_reference := 'WA:' || v_request_reference;

  SELECT pa.id INTO v_availability_id
  FROM public.product_availability pa
  WHERE pa.product_id=v_product_id AND pa.partner_id=p_actor_user_id
  ORDER BY pa.id
  LIMIT 1
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REQUEST_PARTNER_SCOPE_DENIED'; END IF;

  SELECT e.* INTO v_event
  FROM public.marketplace_request_handoff_events e
  WHERE e.request_id=p_request_id AND e.handoff_type='whatsapp';

  IF FOUND THEN
    IF v_event.initiated_by_partner_user_id IS DISTINCT FROM p_actor_user_id
       OR v_event.product_id IS DISTINCT FROM v_product_id
       OR v_event.handoff_reference IS DISTINCT FROM v_reference THEN
      RAISE EXCEPTION 'REQUEST_HANDOFF_CONFLICT' USING ERRCODE='23514';
    END IF;
    IF v_event.whatsapp_destination IS NULL OR v_event.message_snapshot IS NULL THEN
      RAISE EXCEPTION 'REQUEST_HANDOFF_REPLAY_UNAVAILABLE' USING ERRCODE='55000';
    END IF;
    RETURN QUERY SELECT
      v_event.request_id,v_request_reference,v_event.product_id,
      v_event.initiated_by_partner_user_id,v_event.handoff_type,
      v_event.handoff_reference,v_event.request_status_at_handoff,
      v_event.whatsapp_destination,v_event.message_snapshot,
      v_event.created_at,true;
    RETURN;
  END IF;

  IF v_destination IS NULL OR v_destination !~ '^[0-9]{8,15}$' THEN
    RAISE EXCEPTION 'WHATSAPP_DESTINATION_INVALID' USING ERRCODE='22023';
  END IF;

  v_message := format('DIR3COM %s',v_request_reference)
    || CASE WHEN nullif(btrim(coalesce(v_service_name,'')),'') IS NOT NULL
         THEN E'\nService: ' || v_service_name ELSE '' END
    || CASE WHEN v_requested_for IS NOT NULL
         THEN E'\nRequested for: ' || to_char(v_requested_for AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') ELSE '' END
    || E'\nTravellers: ' || coalesce(v_traveller_count,1)::text
    || E'\nCurrent status: ' || v_request_status;

  UPDATE public.marketplace_requests SET
    handoff_type='whatsapp', fulfilment_method='whatsapp_handoff',
    handoff_reference=v_reference, handoff_started_at=coalesce(handoff_started_at,now()),
    next_action='await_partner_response', updated_at=now()
  WHERE id=p_request_id;

  INSERT INTO public.marketplace_request_handoff_events(
    request_id,product_id,initiated_by_partner_user_id,
    handoff_type,handoff_reference,request_status_at_handoff,
    whatsapp_destination,message_snapshot
  ) VALUES (
    p_request_id,v_product_id,p_actor_user_id,
    'whatsapp',v_reference,v_request_status,v_destination,v_message
  ) RETURNING * INTO v_event;

  RETURN QUERY SELECT
    v_event.request_id,v_request_reference,v_event.product_id,
    v_event.initiated_by_partner_user_id,v_event.handoff_type,
    v_event.handoff_reference,v_event.request_status_at_handoff,
    v_event.whatsapp_destination,v_event.message_snapshot,
    v_event.created_at,false;
END;
$function$
;

REVOKE ALL ON FUNCTION public.get_partner_marketplace_requests(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.start_partner_marketplace_request_handoff(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_partner_marketplace_requests(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.start_partner_marketplace_request_handoff(uuid,uuid,text) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
