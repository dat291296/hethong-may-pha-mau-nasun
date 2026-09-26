-- SYNC-SEC-1: versioned sync contract, idempotency ledger, trusted devices and bounded sessions.
-- Additive and idempotent. No distributor, equipment or operational rows are modified.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.sync_operations (
  operation_id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id_hash TEXT,
  contract_version INTEGER NOT NULL CHECK (contract_version BETWEEN 1 AND 10),
  schema_version INTEGER NOT NULL CHECK (schema_version BETWEEN 1 AND 100),
  engine_version INTEGER NOT NULL CHECK (engine_version BETWEEN 1 AND 100),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  base_version BIGINT,
  payload_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'registered' CHECK (status IN ('registered', 'processing', 'applied', 'failed', 'needs_review')),
  result JSONB,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_at TIMESTAMPTZ
);

-- Upgrade the legacy workflow ledger in place when it already exists.
ALTER TABLE public.sync_operations ADD COLUMN IF NOT EXISTS device_id_hash TEXT;
ALTER TABLE public.sync_operations ADD COLUMN IF NOT EXISTS contract_version INTEGER;
ALTER TABLE public.sync_operations ADD COLUMN IF NOT EXISTS schema_version INTEGER;
ALTER TABLE public.sync_operations ADD COLUMN IF NOT EXISTS engine_version INTEGER;
ALTER TABLE public.sync_operations ADD COLUMN IF NOT EXISTS action TEXT;
ALTER TABLE public.sync_operations ADD COLUMN IF NOT EXISTS entity_type TEXT;
ALTER TABLE public.sync_operations ADD COLUMN IF NOT EXISTS base_version BIGINT;
ALTER TABLE public.sync_operations ADD COLUMN IF NOT EXISTS payload_hash TEXT;
ALTER TABLE public.sync_operations ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE public.sync_operations ADD COLUMN IF NOT EXISTS error_code TEXT;
ALTER TABLE public.sync_operations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE public.sync_operations ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ;
ALTER TABLE public.sync_operations ADD COLUMN IF NOT EXISTS workflow TEXT;
ALTER TABLE public.sync_operations ALTER COLUMN entity_id DROP NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sync_operations' AND column_name = 'workflow'
  ) THEN
    EXECUTE 'ALTER TABLE public.sync_operations ALTER COLUMN workflow DROP NOT NULL';
  END IF;
END;
$$;

UPDATE public.sync_operations
SET contract_version = COALESCE(contract_version, 1),
    schema_version = COALESCE(schema_version, 1),
    engine_version = COALESCE(engine_version, 1),
    action = COALESCE(action, 'LEGACY_OPERATION'),
    entity_type = COALESCE(entity_type, 'system_sets'),
    payload_hash = COALESCE(payload_hash, encode(digest(COALESCE(result, '{}'::JSONB)::TEXT, 'sha256'), 'hex')),
    status = COALESCE(status, 'applied'),
    updated_at = COALESCE(updated_at, created_at, NOW()),
    applied_at = COALESCE(applied_at, created_at)
WHERE contract_version IS NULL OR schema_version IS NULL OR engine_version IS NULL
   OR action IS NULL OR entity_type IS NULL OR payload_hash IS NULL
   OR status IS NULL OR updated_at IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sync_operations' AND column_name = 'workflow'
  ) THEN
    EXECUTE 'UPDATE public.sync_operations SET action = workflow WHERE action = ''LEGACY_OPERATION'' AND workflow IS NOT NULL';
  END IF;
END;
$$;

ALTER TABLE public.sync_operations ALTER COLUMN contract_version SET NOT NULL;
ALTER TABLE public.sync_operations ALTER COLUMN contract_version SET DEFAULT 1;
ALTER TABLE public.sync_operations ALTER COLUMN schema_version SET NOT NULL;
ALTER TABLE public.sync_operations ALTER COLUMN schema_version SET DEFAULT 1;
ALTER TABLE public.sync_operations ALTER COLUMN engine_version SET NOT NULL;
ALTER TABLE public.sync_operations ALTER COLUMN engine_version SET DEFAULT 1;
ALTER TABLE public.sync_operations ALTER COLUMN action SET NOT NULL;
ALTER TABLE public.sync_operations ALTER COLUMN action SET DEFAULT 'LEGACY_OPERATION';
ALTER TABLE public.sync_operations ALTER COLUMN entity_type SET NOT NULL;
ALTER TABLE public.sync_operations ALTER COLUMN entity_type SET DEFAULT 'unknown';
ALTER TABLE public.sync_operations ALTER COLUMN payload_hash SET NOT NULL;
ALTER TABLE public.sync_operations ALTER COLUMN payload_hash SET DEFAULT 'legacy';
ALTER TABLE public.sync_operations ALTER COLUMN status SET NOT NULL;
ALTER TABLE public.sync_operations ALTER COLUMN status SET DEFAULT 'registered';
ALTER TABLE public.sync_operations ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE public.sync_operations ALTER COLUMN updated_at SET DEFAULT NOW();

CREATE OR REPLACE FUNCTION public.normalize_legacy_sync_operation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.workflow IS NOT NULL THEN
    NEW.action := COALESCE(NULLIF(NEW.action, 'LEGACY_OPERATION'), NEW.workflow);
    NEW.entity_type := COALESCE(NULLIF(NEW.entity_type, 'unknown'), 'system_sets');
    NEW.payload_hash := CASE WHEN NEW.payload_hash = 'legacy'
      THEN encode(digest(COALESCE(NEW.result, '{}'::JSONB)::TEXT, 'sha256'), 'hex')
      ELSE NEW.payload_hash END;
    NEW.status := CASE WHEN NEW.result IS NOT NULL THEN 'applied' ELSE NEW.status END;
    NEW.applied_at := CASE WHEN NEW.result IS NOT NULL THEN COALESCE(NEW.applied_at, NOW()) ELSE NEW.applied_at END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_legacy_sync_operation ON public.sync_operations;
CREATE TRIGGER trg_normalize_legacy_sync_operation
BEFORE INSERT OR UPDATE ON public.sync_operations
FOR EACH ROW EXECUTE FUNCTION public.normalize_legacy_sync_operation();

CREATE INDEX IF NOT EXISTS idx_sync_operations_user_created
  ON public.sync_operations (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_operations_status_updated
  ON public.sync_operations (status, updated_at);

ALTER TABLE public.sync_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sync_operations FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.sync_operations FROM authenticated;
GRANT SELECT ON TABLE public.sync_operations TO authenticated;

DROP POLICY IF EXISTS sync_operations_read_own_or_admin ON public.sync_operations;
CREATE POLICY sync_operations_read_own_or_admin
  ON public.sync_operations FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.get_my_role() = 'admin');

CREATE TABLE IF NOT EXISTS public.trusted_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id_hash TEXT NOT NULL,
  device_label TEXT NOT NULL DEFAULT 'Unknown device',
  timezone TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  trusted_until TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '90 days'),
  last_ip_hash TEXT,
  last_user_agent_hash TEXT,
  revoked_at TIMESTAMPTZ,
  UNIQUE (user_id, device_id_hash)
);

CREATE INDEX IF NOT EXISTS idx_trusted_devices_user_active
  ON public.trusted_devices (user_id, trusted_until DESC) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.account_sessions (
  session_id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trusted_device_id UUID NOT NULL REFERENCES public.trusted_devices(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  idle_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '8 hours'),
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT,
  anomaly_score INTEGER NOT NULL DEFAULT 0 CHECK (anomaly_score BETWEEN 0 AND 100)
);

CREATE INDEX IF NOT EXISTS idx_account_sessions_user_active
  ON public.account_sessions (user_id, last_seen_at DESC) WHERE revoked_at IS NULL;

ALTER TABLE public.trusted_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.trusted_devices, public.account_sessions FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.trusted_devices, public.account_sessions FROM authenticated;
GRANT SELECT ON TABLE public.trusted_devices, public.account_sessions TO authenticated;

DROP POLICY IF EXISTS trusted_devices_read_own_or_admin ON public.trusted_devices;
CREATE POLICY trusted_devices_read_own_or_admin
  ON public.trusted_devices FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.get_my_role() = 'admin');

DROP POLICY IF EXISTS account_sessions_read_own_or_admin ON public.account_sessions;
CREATE POLICY account_sessions_read_own_or_admin
  ON public.account_sessions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.get_my_role() = 'admin');

CREATE OR REPLACE FUNCTION public.request_security_context()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  headers JSONB := '{}'::JSONB;
  raw_headers TEXT;
  ip_value TEXT;
  user_agent_value TEXT;
BEGIN
  raw_headers := NULLIF(current_setting('request.headers', TRUE), '');
  IF raw_headers IS NOT NULL THEN
    BEGIN
      headers := raw_headers::JSONB;
    EXCEPTION WHEN OTHERS THEN
      headers := '{}'::JSONB;
    END;
  END IF;
  ip_value := COALESCE(NULLIF(headers->>'cf-connecting-ip', ''), split_part(COALESCE(headers->>'x-forwarded-for', ''), ',', 1));
  user_agent_value := COALESCE(headers->>'user-agent', '');
  RETURN jsonb_build_object(
    'ip_hash', CASE WHEN BTRIM(COALESCE(ip_value, '')) = '' THEN NULL ELSE encode(digest(BTRIM(ip_value), 'sha256'), 'hex') END,
    'user_agent_hash', CASE WHEN BTRIM(user_agent_value) = '' THEN NULL ELSE encode(digest(user_agent_value, 'sha256'), 'hex') END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.register_sync_operation(p_envelope JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id UUID := auth.uid();
  operation_key TEXT := BTRIM(COALESCE(p_envelope->>'operationId', ''));
  action_name TEXT := UPPER(BTRIM(COALESCE(p_envelope->>'action', '')));
  payload JSONB := COALESCE(p_envelope->'payload', '{}'::JSONB);
  new_payload_hash TEXT;
  existing_hash TEXT;
  existing_user_id UUID;
  context_data JSONB;
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '28000'; END IF;
  IF jsonb_typeof(p_envelope) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_SYNC_ENVELOPE'; END IF;
  IF operation_key !~ '^[A-Za-z0-9._:-]{6,160}$' THEN RAISE EXCEPTION 'INVALID_OPERATION_ID'; END IF;
  IF action_name <> ALL (ARRAY[
    'ADD_NPP','EDIT_NPP','DELETE_NPP','ADD_DEVICE','EDIT_DEVICE','DELETE_DEVICE','LINK_DEVICE',
    'ASSEMBLE_SET','UPDATE_SYSTEM_SET','DELETE_SYSTEM_SET','ADD_REPAIR','EDIT_REPAIR','DELETE_REPAIR',
    'ADD_AUDIT_LOG','UPDATE_AUDIT_LOG','DELETE_AUDIT_LOG','EXECUTE_WORKFLOW'
  ]) THEN RAISE EXCEPTION 'UNSUPPORTED_SYNC_ACTION'; END IF;
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' OR octet_length(payload::TEXT) > 262144 THEN
    RAISE EXCEPTION 'INVALID_SYNC_PAYLOAD';
  END IF;

  new_payload_hash := encode(digest(payload::TEXT, 'sha256'), 'hex');
  SELECT payload_hash, user_id INTO existing_hash, existing_user_id
  FROM public.sync_operations WHERE operation_id = operation_key;
  IF existing_hash IS NOT NULL THEN
    IF existing_user_id IS DISTINCT FROM caller_id THEN RAISE EXCEPTION 'OPERATION_ID_ALREADY_OWNED'; END IF;
    IF existing_hash <> new_payload_hash THEN RAISE EXCEPTION 'OPERATION_ID_REUSE_MISMATCH'; END IF;
    RETURN jsonb_build_object('accepted', TRUE, 'idempotent', TRUE, 'operationId', operation_key);
  END IF;

  context_data := public.request_security_context();
  INSERT INTO public.sync_operations (
    operation_id, user_id, device_id_hash, contract_version, schema_version, engine_version,
    action, entity_type, entity_id, base_version, payload_hash
  ) VALUES (
    operation_key, caller_id,
    CASE WHEN NULLIF(p_envelope->>'deviceId', '') IS NULL THEN NULL ELSE encode(digest(p_envelope->>'deviceId', 'sha256'), 'hex') END,
    COALESCE((p_envelope->>'contractVersion')::INTEGER, 1),
    COALESCE((p_envelope->>'schemaVersion')::INTEGER, 1),
    COALESCE((p_envelope->>'engineVersion')::INTEGER, 1),
    action_name, LEFT(COALESCE(NULLIF(p_envelope->>'entityType', ''), 'unknown'), 80),
    LEFT(NULLIF(p_envelope->>'entityId', ''), 160),
    NULLIF(p_envelope->>'baseVersion', '')::BIGINT, new_payload_hash
  );
  RETURN jsonb_build_object('accepted', TRUE, 'idempotent', FALSE, 'operationId', operation_key);
END;
$$;

CREATE OR REPLACE FUNCTION public.register_trusted_device_session(
  p_device_id TEXT,
  p_device_label TEXT DEFAULT 'Unknown device',
  p_timezone TEXT DEFAULT 'UTC'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id UUID := auth.uid();
  jwt JSONB := auth.jwt();
  session_key TEXT;
  device_hash TEXT;
  context_data JSONB;
  device_row public.trusted_devices%ROWTYPE;
  is_new_device BOOLEAN := FALSE;
  anomaly BOOLEAN := FALSE;
  anomaly_reason TEXT := NULL;
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '28000'; END IF;
  IF BTRIM(COALESCE(p_device_id, '')) !~ '^[A-Za-z0-9._:-]{8,200}$' THEN RAISE EXCEPTION 'INVALID_DEVICE_ID'; END IF;
  device_hash := encode(digest(BTRIM(p_device_id), 'sha256'), 'hex');
  session_key := COALESCE(NULLIF(jwt->>'session_id', ''), encode(digest(caller_id::TEXT || ':' || COALESCE(jwt->>'iat', ''), 'sha256'), 'hex'));
  context_data := public.request_security_context();

  SELECT * INTO device_row FROM public.trusted_devices
  WHERE user_id = caller_id AND device_id_hash = device_hash FOR UPDATE;

  IF NOT FOUND THEN
    is_new_device := TRUE;
    anomaly := EXISTS (SELECT 1 FROM public.trusted_devices WHERE user_id = caller_id);
    anomaly_reason := CASE WHEN anomaly THEN 'NEW_DEVICE' ELSE NULL END;
    INSERT INTO public.trusted_devices (
      user_id, device_id_hash, device_label, timezone, last_ip_hash, last_user_agent_hash
    ) VALUES (
      caller_id, device_hash, LEFT(COALESCE(NULLIF(BTRIM(p_device_label), ''), 'Unknown device'), 120),
      LEFT(COALESCE(NULLIF(BTRIM(p_timezone), ''), 'UTC'), 80), context_data->>'ip_hash', context_data->>'user_agent_hash'
    ) RETURNING * INTO device_row;
  ELSE
    -- Mobile IP addresses change frequently; IP-only changes are recorded but
    -- do not interrupt technicians. Expiry, revocation or timezone drift alert.
    anomaly := device_row.revoked_at IS NOT NULL OR device_row.trusted_until <= NOW()
      OR (device_row.timezone IS NOT NULL AND NULLIF(BTRIM(p_timezone), '') IS NOT NULL AND device_row.timezone <> BTRIM(p_timezone));
    anomaly_reason := CASE WHEN anomaly THEN 'DEVICE_CONTEXT_CHANGED' ELSE NULL END;
    UPDATE public.trusted_devices SET
      last_seen_at = NOW(), trusted_until = NOW() + INTERVAL '90 days', revoked_at = NULL,
      device_label = LEFT(COALESCE(NULLIF(BTRIM(p_device_label), ''), device_label), 120),
      timezone = LEFT(COALESCE(NULLIF(BTRIM(p_timezone), ''), timezone), 80),
      last_ip_hash = COALESCE(context_data->>'ip_hash', last_ip_hash),
      last_user_agent_hash = COALESCE(context_data->>'user_agent_hash', last_user_agent_hash)
    WHERE id = device_row.id RETURNING * INTO device_row;
  END IF;

  INSERT INTO public.account_sessions (session_id, user_id, trusted_device_id, anomaly_score)
  VALUES (session_key, caller_id, device_row.id, CASE WHEN anomaly THEN 40 ELSE 0 END)
  ON CONFLICT (session_id) DO UPDATE SET
    last_seen_at = NOW(), idle_expires_at = NOW() + INTERVAL '8 hours',
    trusted_device_id = EXCLUDED.trusted_device_id,
    anomaly_score = GREATEST(public.account_sessions.anomaly_score, EXCLUDED.anomaly_score),
    revoked_at = NULL, revoked_reason = NULL;

  UPDATE public.account_sessions SET revoked_at = NOW(), revoked_reason = 'MAX_ACTIVE_SESSIONS'
  WHERE session_id IN (
    SELECT session_id FROM public.account_sessions
    WHERE user_id = caller_id AND revoked_at IS NULL AND session_id <> session_key
    ORDER BY last_seen_at DESC OFFSET 2
  );

  IF anomaly AND to_regclass('public.security_events') IS NOT NULL THEN
    EXECUTE 'INSERT INTO public.security_events (actor_id, event_type, severity, target_user_id, source, details)
             VALUES ($1, $2, $3, $1, $4, $5)'
      USING caller_id, 'ANOMALOUS_LOGIN_DETECTED', 'WARNING', 'database',
        jsonb_build_object('reason', anomaly_reason, 'device_label', device_row.device_label, 'timezone', device_row.timezone);
  END IF;

  RETURN jsonb_build_object(
    'valid', TRUE, 'trusted', TRUE, 'new_device', is_new_device,
    'anomaly_detected', anomaly, 'anomaly_reason', anomaly_reason,
    'trusted_until', device_row.trusted_until, 'session_expires_at', NOW() + INTERVAL '24 hours'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_trusted_device_session(
  p_device_id TEXT,
  p_timezone TEXT DEFAULT 'UTC'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id UUID := auth.uid();
  jwt JSONB := auth.jwt();
  session_key TEXT;
  device_hash TEXT;
  session_row public.account_sessions%ROWTYPE;
  device_row public.trusted_devices%ROWTYPE;
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '28000'; END IF;
  device_hash := encode(digest(BTRIM(COALESCE(p_device_id, '')), 'sha256'), 'hex');
  session_key := COALESCE(NULLIF(jwt->>'session_id', ''), encode(digest(caller_id::TEXT || ':' || COALESCE(jwt->>'iat', ''), 'sha256'), 'hex'));
  SELECT * INTO session_row FROM public.account_sessions WHERE session_id = session_key AND user_id = caller_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('valid', FALSE, 'reason', 'SESSION_NOT_REGISTERED'); END IF;
  SELECT * INTO device_row FROM public.trusted_devices WHERE id = session_row.trusted_device_id AND device_id_hash = device_hash;
  IF NOT FOUND THEN RETURN jsonb_build_object('valid', FALSE, 'reason', 'DEVICE_MISMATCH'); END IF;
  IF session_row.revoked_at IS NOT NULL THEN RETURN jsonb_build_object('valid', FALSE, 'reason', COALESCE(session_row.revoked_reason, 'SESSION_REVOKED')); END IF;
  IF device_row.revoked_at IS NOT NULL OR device_row.trusted_until <= NOW() THEN RETURN jsonb_build_object('valid', FALSE, 'reason', 'DEVICE_TRUST_EXPIRED'); END IF;
  IF session_row.expires_at <= NOW() THEN RETURN jsonb_build_object('valid', FALSE, 'reason', 'SESSION_EXPIRED'); END IF;
  IF session_row.idle_expires_at <= NOW() THEN RETURN jsonb_build_object('valid', FALSE, 'reason', 'SESSION_IDLE_TIMEOUT'); END IF;

  UPDATE public.account_sessions SET last_seen_at = NOW(), idle_expires_at = NOW() + INTERVAL '8 hours' WHERE session_id = session_key;
  UPDATE public.trusted_devices SET last_seen_at = NOW() WHERE id = device_row.id;
  RETURN jsonb_build_object('valid', TRUE, 'trusted', TRUE, 'expires_at', session_row.expires_at, 'idle_expires_at', NOW() + INTERVAL '8 hours');
END;
$$;

REVOKE ALL ON FUNCTION public.request_security_context() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.register_sync_operation(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.register_trusted_device_session(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.validate_trusted_device_session(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_sync_operation(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_trusted_device_session(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_trusted_device_session(TEXT, TEXT) TO authenticated;

COMMIT;
