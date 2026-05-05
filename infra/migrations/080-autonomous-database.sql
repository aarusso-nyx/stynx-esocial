DO $$
BEGIN
  IF to_regrole('esocial_app') IS NULL THEN
    CREATE ROLE esocial_app NOLOGIN;
  END IF;

  IF to_regrole('esocial_worker') IS NULL THEN
    CREATE ROLE esocial_worker NOLOGIN;
  END IF;
END;
$$;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION esocial.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION esocial.has_worker_bypass()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT pg_has_role(current_user, 'esocial_worker', 'member');
$$;

CREATE OR REPLACE FUNCTION esocial.prevent_append_only_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$;

CREATE TABLE IF NOT EXISTS esocial.tenant (
  tenant_id uuid PRIMARY KEY,
  tenant_code text NOT NULL UNIQUE,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tenant_status_check CHECK (
    status IN ('ACTIVE', 'SUSPENDED', 'DISABLED')
  )
);

ALTER TABLE esocial.submission_message
  ADD COLUMN IF NOT EXISTS request_id text,
  ADD COLUMN IF NOT EXISTS correlation_id text,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS reply_to text,
  ADD COLUMN IF NOT EXISTS dead_letter_topic text,
  ADD COLUMN IF NOT EXISTS environment text,
  ADD COLUMN IF NOT EXISTS source_ref jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS first_seen_at timestamp with time zone NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_seen_at timestamp with time zone NOT NULL DEFAULT now();

ALTER TABLE esocial.submission_batch
  ADD COLUMN IF NOT EXISTS leiaute_version text NOT NULL DEFAULT 'S-1.2',
  ADD COLUMN IF NOT EXISTS endpoint_name text,
  ADD COLUMN IF NOT EXISTS endpoint_url text,
  ADD COLUMN IF NOT EXISTS protocol_number text,
  ADD COLUMN IF NOT EXISTS request_sha256 text,
  ADD COLUMN IF NOT EXISTS signed_payload_sha256 text,
  ADD COLUMN IF NOT EXISTS soap_request_sha256 text,
  ADD COLUMN IF NOT EXISTS soap_response_sha256 text,
  ADD COLUMN IF NOT EXISTS submitted_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS completed_at timestamp with time zone;

ALTER TABLE esocial.event_record
  ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'QUALIFICATION',
  ADD COLUMN IF NOT EXISTS source_entity_id text,
  ADD COLUMN IF NOT EXISTS competence text,
  ADD COLUMN IF NOT EXISTS operation text NOT NULL DEFAULT 'ORIGINAL',
  ADD COLUMN IF NOT EXISTS rectification_of text,
  ADD COLUMN IF NOT EXISTS exclusion_of text,
  ADD COLUMN IF NOT EXISTS batch_id uuid,
  ADD COLUMN IF NOT EXISTS leiaute_version text NOT NULL DEFAULT 'S-1.2',
  ADD COLUMN IF NOT EXISTS signed_payload_ref text,
  ADD COLUMN IF NOT EXISTS protocol_number text,
  ADD COLUMN IF NOT EXISTS receipt_number text,
  ADD COLUMN IF NOT EXISTS request_sha256 text,
  ADD COLUMN IF NOT EXISTS signed_payload_sha256 text,
  ADD COLUMN IF NOT EXISTS response_sha256 text,
  ADD COLUMN IF NOT EXISTS processed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS source_ref jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS esocial.tenant_certificate (
  certificate_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  environment text NOT NULL,
  secret_ref text NOT NULL,
  secret_kind text NOT NULL DEFAULT 'AWS_SECRETS_MANAGER_ARN',
  certificate_fingerprint_sha256 text NOT NULL,
  subject_name text,
  issuer_name text,
  serial_number text,
  valid_from timestamp with time zone NOT NULL,
  valid_until timestamp with time zone NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  rotated_at timestamp with time zone,
  revoked_at timestamp with time zone,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tenant_certificate_environment_check CHECK (
    environment IN ('PRODUCTION', 'QUALIFICATION', 'RESTRICTED_PRODUCTION')
  ),
  CONSTRAINT tenant_certificate_secret_kind_check CHECK (
    secret_kind IN ('AWS_SECRETS_MANAGER_ARN', 'LOCAL_TEST_SECRET_REF')
  ),
  CONSTRAINT tenant_certificate_status_check CHECK (
    status IN ('ACTIVE', 'ROTATING', 'REVOKED', 'EXPIRED')
  ),
  CONSTRAINT tenant_certificate_secret_ref_no_inline_material_check CHECK (
    secret_ref !~ '-----BEGIN' AND secret_ref !~* 'PRIVATE KEY'
  )
);

CREATE TABLE IF NOT EXISTS esocial.endpoint_circuit_state (
  circuit_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  environment text NOT NULL,
  endpoint_name text NOT NULL,
  endpoint_url text,
  state text NOT NULL DEFAULT 'CLOSED',
  failure_count integer NOT NULL DEFAULT 0,
  success_count integer NOT NULL DEFAULT 0,
  opened_at timestamp with time zone,
  half_opened_at timestamp with time zone,
  last_failure_at timestamp with time zone,
  last_success_at timestamp with time zone,
  last_error_code text,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT endpoint_circuit_environment_check CHECK (
    environment IN ('PRODUCTION', 'QUALIFICATION', 'RESTRICTED_PRODUCTION')
  ),
  CONSTRAINT endpoint_circuit_state_check CHECK (
    state IN ('CLOSED', 'OPEN', 'HALF_OPEN')
  )
);

CREATE TABLE IF NOT EXISTS esocial.event_retry_schedule (
  retry_schedule_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  event_record_id uuid NOT NULL,
  batch_id uuid,
  environment text NOT NULL,
  event_class text NOT NULL,
  next_attempt_at timestamp with time zone NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  budget_remaining integer NOT NULL DEFAULT 3,
  last_classification text,
  last_error_code text,
  last_error_message text,
  status text NOT NULL DEFAULT 'SCHEDULED',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT event_retry_schedule_status_check CHECK (
    status IN ('SCHEDULED', 'CLAIMED', 'EXHAUSTED', 'CANCELLED', 'COMPLETED')
  )
);

CREATE TABLE IF NOT EXISTS esocial.response_classification (
  classification_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment text NOT NULL DEFAULT 'ANY',
  response_code text NOT NULL,
  canonical_status text NOT NULL,
  retryable boolean NOT NULL DEFAULT false,
  category text NOT NULL,
  description text NOT NULL,
  operator_action_required boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT response_classification_status_check CHECK (
    canonical_status IN (
      'ACCEPTED',
      'REJECTED',
      'RETRY',
      'TIMEOUT',
      'DLQ',
      'FAILED',
      'OPERATOR_ACTION'
    )
  )
);

INSERT INTO esocial.response_classification (
  response_code,
  canonical_status,
  retryable,
  category,
  description,
  operator_action_required
)
VALUES
  ('201', 'ACCEPTED', false, 'ESOCIAL_RULE', 'Batch or event accepted by the national environment.', false),
  ('401', 'REJECTED', false, 'ESOCIAL_RULE', 'Official business-rule rejection.', true),
  ('503', 'RETRY', true, 'TRANSPORT', 'Transient national environment or transport failure.', false),
  ('TIMEOUT', 'TIMEOUT', true, 'TRANSPORT', 'Submission timed out before a definitive return.', false)
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    's1xxx_dispatch_state',
    's1200_emission_state',
    's1202_emission_state',
    's1210_emission_state',
    's1299_emission_state',
    's2200_emission_state',
    's2205_pending_alteration',
    's2210_pending',
    's2220_pending',
    's2230_pending',
    's2240_pending',
    's2298_event',
    's2299_pending',
    's2306_event',
    's3000_request'
  ]
  LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS esocial.%I (
        state_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        event_record_id uuid,
        batch_id uuid,
        source_entity_id text,
        event_class text NOT NULL,
        environment text NOT NULL DEFAULT ''QUALIFICATION'',
        competence text,
        status text NOT NULL DEFAULT ''PENDING'',
        payload_hash text,
        protocol_number text,
        receipt_number text,
        last_error_code text,
        last_error_message text,
        reconciliation_key text NOT NULL,
        metadata jsonb NOT NULL DEFAULT ''{}''::jsonb,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_at timestamp with time zone NOT NULL DEFAULT now()
      )',
      table_name
    );

    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS %I ON esocial.%I (
        tenant_id,
        environment,
        event_class,
        reconciliation_key,
        COALESCE(competence, '''')
      )',
      table_name || '_reconciliation_ux',
      table_name
    );

    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgrelid = format('esocial.%I', table_name)::regclass
        AND tgname = table_name || '_touch_updated_at'
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER %I
          BEFORE UPDATE ON esocial.%I
          FOR EACH ROW EXECUTE FUNCTION esocial.touch_updated_at()',
        table_name || '_touch_updated_at',
        table_name
      );
    END IF;
  END LOOP;
END;
$$;

CREATE TABLE IF NOT EXISTS esocial.esocial_totalizer (
  totalizer_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  batch_id uuid,
  event_record_id uuid,
  environment text NOT NULL,
  totalizer_class text NOT NULL,
  source_event_class text,
  competence text,
  protocol_number text,
  receipt_number text,
  payload_hash text NOT NULL,
  totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS esocial.xsd_validation_failure (
  failure_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  event_record_id uuid,
  batch_id uuid,
  environment text NOT NULL,
  event_class text NOT NULL,
  payload_hash text NOT NULL,
  node_path text,
  xsd_code text,
  message text NOT NULL,
  severity text NOT NULL DEFAULT 'ERROR',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT xsd_validation_failure_severity_check CHECK (
    severity IN ('ERROR', 'WARNING')
  )
);

CREATE TABLE IF NOT EXISTS esocial.audit_event_log (
  audit_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  correlation_id text,
  message_id uuid,
  batch_id uuid,
  event_record_id uuid,
  event_type text NOT NULL,
  actor text NOT NULL DEFAULT 'system',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload_hash text,
  occurred_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS esocial.event_status_history (
  status_history_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  event_record_id uuid NOT NULL,
  batch_id uuid,
  from_status text,
  to_status text NOT NULL,
  reason_code text,
  reason_message text,
  payload_hash text,
  occurred_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS submission_message_transport_idempotency_ux
  ON esocial.submission_message (
    tenant_id,
    kind,
    COALESCE(environment, 'UNSPECIFIED'),
    COALESCE(event_class, 'UNSPECIFIED'),
    COALESCE(idempotency_key, payload_hash)
  );

CREATE UNIQUE INDEX IF NOT EXISTS submission_batch_regulatory_payload_ux
  ON esocial.submission_batch (
    tenant_id,
    environment,
    event_class,
    payload_hash,
    leiaute_version
  );

CREATE UNIQUE INDEX IF NOT EXISTS event_record_regulatory_idempotency_ux
  ON esocial.event_record (
    tenant_id,
    environment,
    event_class,
    COALESCE(source_event_id::text, source_entity_id, ''),
    COALESCE(competence, ''),
    payload_hash,
    operation,
    COALESCE(rectification_of, ''),
    COALESCE(exclusion_of, '')
  );

CREATE UNIQUE INDEX IF NOT EXISTS tenant_certificate_active_ux
  ON esocial.tenant_certificate (
    tenant_id,
    environment,
    certificate_fingerprint_sha256
  )
  WHERE status IN ('ACTIVE', 'ROTATING');

CREATE UNIQUE INDEX IF NOT EXISTS endpoint_circuit_state_endpoint_ux
  ON esocial.endpoint_circuit_state (
    tenant_id,
    environment,
    endpoint_name
  );

CREATE UNIQUE INDEX IF NOT EXISTS response_classification_code_ux
  ON esocial.response_classification (
    environment,
    response_code
  );

CREATE UNIQUE INDEX IF NOT EXISTS event_retry_schedule_event_ux
  ON esocial.event_retry_schedule (
    tenant_id,
    event_record_id
  )
  WHERE status IN ('SCHEDULED', 'CLAIMED');

CREATE UNIQUE INDEX IF NOT EXISTS esocial_totalizer_receipt_ux
  ON esocial.esocial_totalizer (
    tenant_id,
    environment,
    totalizer_class,
    COALESCE(receipt_number, ''),
    payload_hash
  );

CREATE OR REPLACE VIEW esocial.v_competence_periodics_pending AS
SELECT
  tenant_id,
  environment,
  competence,
  event_class,
  count(*) AS pending_count,
  min(created_at) AS oldest_pending_at
FROM esocial.event_record
WHERE event_class IN ('S-1200', 'S-1202', 'S-1207', 'S-1210', 'S-1298', 'S-1299')
  AND status IN ('PENDING', 'BUILDING', 'VALIDATION_FAILED', 'RETRY')
GROUP BY tenant_id, environment, competence, event_class;

CREATE OR REPLACE VIEW esocial.v_event_failures AS
SELECT
  event_record_id,
  tenant_id,
  batch_id,
  environment,
  event_class,
  status,
  payload_hash,
  response_sha256 AS failure_hash,
  processed_at AS failed_at,
  NULL::text AS node_path,
  NULL::text AS error_code,
  NULL::text AS error_message
FROM esocial.event_record
WHERE status IN ('VALIDATION_FAILED', 'REJECTED', 'TIMEOUT', 'DLQ', 'FAILED')
UNION ALL
SELECT
  event_record_id,
  tenant_id,
  batch_id,
  environment,
  event_class,
  'VALIDATION_FAILED' AS status,
  payload_hash,
  payload_hash AS failure_hash,
  created_at AS failed_at,
  node_path,
  xsd_code AS error_code,
  message AS error_message
FROM esocial.xsd_validation_failure;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'tenant',
    'tenant_certificate',
    'endpoint_circuit_state',
    'submission_message',
    'submission_batch',
    'event_record',
    'event_retry_schedule',
    's1xxx_dispatch_state',
    's1200_emission_state',
    's1202_emission_state',
    's1210_emission_state',
    's1299_emission_state',
    's2200_emission_state',
    's2205_pending_alteration',
    's2210_pending',
    's2220_pending',
    's2230_pending',
    's2240_pending',
    's2298_event',
    's2299_pending',
    's2306_event',
    's3000_request',
    'esocial_totalizer',
    'xsd_validation_failure',
    'audit_event_log',
    'event_status_history'
  ]
  LOOP
    EXECUTE format('ALTER TABLE esocial.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE esocial.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON esocial.%I', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON esocial.%I
        USING (tenant_id = esocial.current_tenant_id() OR esocial.has_worker_bypass())
        WITH CHECK (tenant_id = esocial.current_tenant_id() OR esocial.has_worker_bypass())',
      table_name
    );
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS submission_message_tenant_isolation ON esocial.submission_message;
DROP POLICY IF EXISTS submission_batch_tenant_isolation ON esocial.submission_batch;
DROP POLICY IF EXISTS event_record_tenant_isolation ON esocial.event_record;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'esocial.tenant'::regclass
      AND tgname = 'tenant_touch_updated_at'
  ) THEN
    CREATE TRIGGER tenant_touch_updated_at
      BEFORE UPDATE ON esocial.tenant
      FOR EACH ROW EXECUTE FUNCTION esocial.touch_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'esocial.tenant_certificate'::regclass
      AND tgname = 'tenant_certificate_touch_updated_at'
  ) THEN
    CREATE TRIGGER tenant_certificate_touch_updated_at
      BEFORE UPDATE ON esocial.tenant_certificate
      FOR EACH ROW EXECUTE FUNCTION esocial.touch_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'esocial.endpoint_circuit_state'::regclass
      AND tgname = 'endpoint_circuit_state_touch_updated_at'
  ) THEN
    CREATE TRIGGER endpoint_circuit_state_touch_updated_at
      BEFORE UPDATE ON esocial.endpoint_circuit_state
      FOR EACH ROW EXECUTE FUNCTION esocial.touch_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'esocial.event_retry_schedule'::regclass
      AND tgname = 'event_retry_schedule_touch_updated_at'
  ) THEN
    CREATE TRIGGER event_retry_schedule_touch_updated_at
      BEFORE UPDATE ON esocial.event_retry_schedule
      FOR EACH ROW EXECUTE FUNCTION esocial.touch_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'esocial.audit_event_log'::regclass
      AND tgname = 'audit_event_log_append_only'
  ) THEN
    CREATE TRIGGER audit_event_log_append_only
      BEFORE UPDATE OR DELETE ON esocial.audit_event_log
      FOR EACH ROW EXECUTE FUNCTION esocial.prevent_append_only_mutation();
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'esocial.event_status_history'::regclass
      AND tgname = 'event_status_history_append_only'
  ) THEN
    CREATE TRIGGER event_status_history_append_only
      BEFORE UPDATE OR DELETE ON esocial.event_status_history
      FOR EACH ROW EXECUTE FUNCTION esocial.prevent_append_only_mutation();
  END IF;
END;
$$;

GRANT USAGE ON SCHEMA esocial TO esocial_app, esocial_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA esocial TO esocial_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA esocial TO esocial_worker;
REVOKE UPDATE, DELETE ON esocial.audit_event_log FROM esocial_worker;
REVOKE UPDATE, DELETE ON esocial.event_status_history FROM esocial_worker;
GRANT SELECT, INSERT ON esocial.audit_event_log TO esocial_worker;
GRANT SELECT, INSERT ON esocial.event_status_history TO esocial_worker;

COMMENT ON TABLE esocial.tenant_certificate IS
  'Certificate custody metadata only. Secret references point to encrypted storage; certificate bytes and private keys are never stored here.';
COMMENT ON TABLE esocial.audit_event_log IS
  'Append-only operational and regulatory audit evidence for queue, XML, signing, SOAP, return, retry, and DLQ events.';
COMMENT ON TABLE esocial.event_status_history IS
  'Append-only event status transition history used for idempotency, replay, and status publication evidence.';
