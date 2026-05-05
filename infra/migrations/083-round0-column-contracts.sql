ALTER TABLE esocial.tenant_certificate
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS serial text,
  ADD COLUMN IF NOT EXISTS subject text,
  ADD COLUMN IF NOT EXISTS issuer text,
  ADD COLUMN IF NOT EXISTS not_before timestamp with time zone,
  ADD COLUMN IF NOT EXISTS not_after timestamp with time zone,
  ADD COLUMN IF NOT EXISTS fingerprint_sha256 text;

UPDATE esocial.tenant_certificate
SET
  serial = COALESCE(serial, serial_number),
  subject = COALESCE(subject, subject_name),
  issuer = COALESCE(issuer, issuer_name),
  not_before = COALESCE(not_before, valid_from),
  not_after = COALESCE(not_after, valid_until),
  fingerprint_sha256 = COALESCE(fingerprint_sha256, certificate_fingerprint_sha256);

ALTER TABLE esocial.endpoint_circuit_state
  ADD COLUMN IF NOT EXISTS endpoint text,
  ADD COLUMN IF NOT EXISTS half_open_probe_at timestamp with time zone;

UPDATE esocial.endpoint_circuit_state
SET
  endpoint = COALESCE(endpoint, endpoint_name),
  half_open_probe_at = COALESCE(half_open_probe_at, half_opened_at);

ALTER TABLE esocial.event_retry_schedule
  ADD COLUMN IF NOT EXISTS attempt integer,
  ADD COLUMN IF NOT EXISTS classification text,
  ADD COLUMN IF NOT EXISTS last_error text;

UPDATE esocial.event_retry_schedule
SET
  attempt = COALESCE(attempt, attempt_count),
  classification = COALESCE(classification, last_classification),
  last_error = COALESCE(last_error, last_error_message, last_error_code);

ALTER TABLE esocial.event_retry_schedule
  ALTER COLUMN attempt SET DEFAULT 0;

ALTER TABLE esocial.response_classification
  ADD COLUMN IF NOT EXISTS regulatory_code text,
  ADD COLUMN IF NOT EXISTS status text;

UPDATE esocial.response_classification
SET
  regulatory_code = COALESCE(regulatory_code, response_code),
  status = COALESCE(status, lower(canonical_status));

ALTER TABLE esocial.event_status_history
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS transitioned_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS actor text;

UPDATE esocial.event_status_history
SET
  reason = COALESCE(reason, reason_message, reason_code),
  transitioned_at = COALESCE(transitioned_at, occurred_at),
  actor = COALESCE(actor, 'worker');

ALTER TABLE esocial.event_status_history
  ALTER COLUMN actor SET DEFAULT 'worker';

ALTER TABLE esocial.audit_event_log
  ADD COLUMN IF NOT EXISTS kind text;

UPDATE esocial.audit_event_log
SET kind = COALESCE(kind, event_type);

ALTER TABLE esocial.xsd_validation_failure
  ADD COLUMN IF NOT EXISTS occurred_at timestamp with time zone;

UPDATE esocial.xsd_validation_failure
SET occurred_at = COALESCE(occurred_at, created_at);

ALTER TABLE esocial.esocial_totalizer
  ADD COLUMN IF NOT EXISTS event_class text,
  ADD COLUMN IF NOT EXISTS employer text,
  ADD COLUMN IF NOT EXISTS protocol text,
  ADD COLUMN IF NOT EXISTS receipt text,
  ADD COLUMN IF NOT EXISTS payload jsonb,
  ADD COLUMN IF NOT EXISTS ingested_at timestamp with time zone;

UPDATE esocial.esocial_totalizer
SET
  event_class = COALESCE(event_class, totalizer_class),
  protocol = COALESCE(protocol, protocol_number),
  receipt = COALESCE(receipt, receipt_number),
  payload = COALESCE(payload, totals),
  ingested_at = COALESCE(ingested_at, created_at);

ALTER TABLE esocial.esocial_totalizer
  ALTER COLUMN payload SET DEFAULT '{}'::jsonb,
  ALTER COLUMN ingested_at SET DEFAULT now();
