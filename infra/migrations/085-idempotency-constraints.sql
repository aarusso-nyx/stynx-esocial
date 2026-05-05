UPDATE esocial.submission_message
SET
  environment = COALESCE(environment, 'QUALIFICATION'),
  idempotency_key = COALESCE(idempotency_key, payload_hash);

ALTER TABLE esocial.submission_message
  ALTER COLUMN environment SET NOT NULL,
  ALTER COLUMN idempotency_key SET NOT NULL;

DROP INDEX IF EXISTS esocial.submission_message_transport_idempotency_ux;

CREATE UNIQUE INDEX IF NOT EXISTS submission_message_transport_idempotency_ux
  ON esocial.submission_message (
    tenant_id,
    environment,
    idempotency_key
  );

ALTER TABLE esocial.event_record
  ADD COLUMN IF NOT EXISTS rectification_marker text,
  ADD COLUMN IF NOT EXISTS exclusion_marker text;

UPDATE esocial.event_record
SET
  rectification_marker = COALESCE(rectification_marker, rectification_of, ''),
  exclusion_marker = COALESCE(exclusion_marker, exclusion_of, '');

ALTER TABLE esocial.event_record
  ALTER COLUMN rectification_marker SET DEFAULT '',
  ALTER COLUMN rectification_marker SET NOT NULL,
  ALTER COLUMN exclusion_marker SET DEFAULT '',
  ALTER COLUMN exclusion_marker SET NOT NULL;

DROP INDEX IF EXISTS esocial.event_record_regulatory_idempotency_ux;

CREATE UNIQUE INDEX IF NOT EXISTS event_record_regulatory_idempotency_ux
  ON esocial.event_record (
    tenant_id,
    environment,
    event_class,
    COALESCE(source_event_id::text, source_entity_id, ''),
    COALESCE(competence, ''),
    payload_hash,
    rectification_marker,
    exclusion_marker
  );
