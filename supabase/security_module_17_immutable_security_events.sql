-- Security module 17: immutable security-event monitoring.
-- Existing application and audit data is preserved.

BEGIN;

CREATE TABLE IF NOT EXISTS public.security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type ~ '^[A-Z0-9_:-]{3,80}$'),
  severity TEXT NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
  target_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'database' CHECK (source IN ('database', 'application')),
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  request_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_security_events_occurred_at
  ON public.security_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_severity
  ON public.security_events (severity, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_actor
  ON public.security_events (actor_id, occurred_at DESC);

ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.security_events FROM PUBLIC;
REVOKE ALL ON TABLE public.security_events FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.security_events FROM authenticated;
GRANT SELECT ON TABLE public.security_events TO authenticated;

DROP POLICY IF EXISTS "security_events_admin_read" ON public.security_events;
CREATE POLICY "security_events_admin_read"
  ON public.security_events
  FOR SELECT TO authenticated
  USING (public.get_my_role() = 'admin');

CREATE OR REPLACE FUNCTION public.record_security_event(
  p_event_type TEXT,
  p_details JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id UUID := auth.uid();
  normalized_type TEXT := UPPER(BTRIM(COALESCE(p_event_type, '')));
  normalized_details JSONB := COALESCE(p_details, '{}'::JSONB);
  event_severity TEXT;
  inserted_id UUID;
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF normalized_type !~ '^[A-Z0-9_:-]{3,80}$' THEN RAISE EXCEPTION 'INVALID_EVENT_TYPE'; END IF;
  IF jsonb_typeof(normalized_details) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_EVENT_DETAILS'; END IF;
  IF octet_length(normalized_details::TEXT) > 4000 THEN RAISE EXCEPTION 'EVENT_DETAILS_TOO_LARGE'; END IF;
  IF (SELECT COUNT(*) FROM public.security_events WHERE actor_id = caller_id AND occurred_at > NOW() - INTERVAL '5 minutes') >= 30 THEN
    RETURN jsonb_build_object('recorded', FALSE, 'reason', 'RATE_LIMITED');
  END IF;

  event_severity := CASE
    WHEN normalized_type LIKE '%VIOLATION%' OR normalized_type LIKE '%FAILED%' THEN 'CRITICAL'
    WHEN normalized_type LIKE '%DENIED%' OR normalized_type LIKE '%INVALID%' THEN 'WARNING'
    ELSE 'INFO'
  END;

  INSERT INTO public.security_events (actor_id, event_type, severity, source, details, request_id)
  VALUES (
    caller_id,
    normalized_type,
    event_severity,
    'application',
    normalized_details - 'password' - 'token' - 'secret' - 'authorization',
    NULLIF(current_setting('request.headers', TRUE)::JSONB->>'x-request-id', '')
  )
  RETURNING id INTO inserted_id;

  RETURN jsonb_build_object('id', inserted_id, 'recorded', TRUE);
END;
$$;

REVOKE ALL ON FUNCTION public.record_security_event(TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_security_event(TEXT, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_security_event(TEXT, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.capture_profile_security_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  change_type TEXT;
  change_severity TEXT := 'WARNING';
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    change_type := 'ACCOUNT_ROLE_CHANGED';
    change_severity := 'CRITICAL';
  ELSIF OLD.is_active IS DISTINCT FROM NEW.is_active THEN
    change_type := CASE WHEN NEW.is_active THEN 'ACCOUNT_REACTIVATED' ELSE 'ACCOUNT_DEACTIVATED' END;
    change_severity := CASE WHEN NEW.is_active THEN 'WARNING' ELSE 'CRITICAL' END;
  ELSIF OLD.managed_region IS DISTINCT FROM NEW.managed_region THEN
    change_type := 'ACCOUNT_REGION_CHANGED';
  ELSIF OLD.mfa_required IS DISTINCT FROM NEW.mfa_required THEN
    change_type := 'ACCOUNT_MFA_REQUIREMENT_CHANGED';
    change_severity := 'CRITICAL';
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.security_events (
    actor_id, event_type, severity, target_user_id, source, details
  ) VALUES (
    auth.uid(),
    change_type,
    change_severity,
    NEW.id,
    'database',
    jsonb_build_object(
      'old_role', OLD.role,
      'new_role', NEW.role,
      'old_region', OLD.managed_region,
      'new_region', NEW.managed_region,
      'old_active', OLD.is_active,
      'new_active', NEW.is_active,
      'old_mfa_required', OLD.mfa_required,
      'new_mfa_required', NEW.mfa_required
    )
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_profile_security_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.capture_profile_security_change() FROM anon;
REVOKE ALL ON FUNCTION public.capture_profile_security_change() FROM authenticated;

DROP TRIGGER IF EXISTS trg_capture_profile_security_change ON public.profiles;
CREATE TRIGGER trg_capture_profile_security_change
AFTER UPDATE OF role, managed_region, is_active, mfa_required ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.capture_profile_security_change();

COMMIT;
