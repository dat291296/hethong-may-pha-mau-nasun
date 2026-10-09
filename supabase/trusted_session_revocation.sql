-- Preserve revoked sessions; installation does not change existing rows.
BEGIN;
CREATE OR REPLACE FUNCTION public.register_trusted_device_session(
  p_device_id TEXT,
  p_device_label TEXT DEFAULT 'Unknown device',
  p_timezone TEXT DEFAULT 'UTC'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
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
  IF EXISTS (SELECT 1 FROM public.account_sessions WHERE session_id = session_key AND user_id = caller_id AND revoked_at IS NOT NULL) THEN
    RETURN jsonb_build_object('valid', FALSE, 'reason', 'SESSION_REVOKED');
  END IF;
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
    revoked_reason = public.account_sessions.revoked_reason
    WHERE public.account_sessions.revoked_at IS NULL;

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
SET search_path = public, extensions, pg_temp
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


NOTIFY pgrst, 'reload schema';
ALTER FUNCTION public.request_security_context() SET search_path = public, extensions, pg_temp;
COMMIT;

