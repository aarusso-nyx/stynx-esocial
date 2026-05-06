-- Round 5 local-safe schema scaffolds for LGPD retention, tamper-evident audit,
-- and cost attribution. Runtime services and external AWS evidence are tracked
-- separately under docs/release/1.2.0.

ALTER TABLE IF EXISTS esocial.audit_event_log
  ADD COLUMN IF NOT EXISTS retention_class text NOT NULL DEFAULT 'regulatory_audit',
  ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS merkle_sequence bigint,
  ADD COLUMN IF NOT EXISTS prev_hash text,
  ADD COLUMN IF NOT EXISTS row_hash text,
  ADD COLUMN IF NOT EXISTS anchor_batch_id uuid;

ALTER TABLE IF EXISTS esocial.event_status_history
  ADD COLUMN IF NOT EXISTS retention_class text NOT NULL DEFAULT 'regulatory_status',
  ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone;

ALTER TABLE IF EXISTS esocial.event_record
  ADD COLUMN IF NOT EXISTS retention_class text NOT NULL DEFAULT 'regulatory_event',
  ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS cost_center text;

ALTER TABLE IF EXISTS esocial.dlq_item
  ADD COLUMN IF NOT EXISTS retention_class text NOT NULL DEFAULT 'operator_dlq',
  ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS cost_center text;

CREATE TABLE IF NOT EXISTS esocial.retention_policy (
  retention_policy_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  retention_class text NOT NULL,
  minimum_days integer NOT NULL,
  legal_hold boolean NOT NULL DEFAULT false,
  reason text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS esocial.audit_anchor_batch (
  anchor_batch_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  environment text NOT NULL,
  first_sequence bigint NOT NULL,
  last_sequence bigint NOT NULL,
  root_hash text NOT NULL,
  anchor_status text NOT NULL DEFAULT 'LOCAL_ONLY',
  anchor_reference text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS esocial.cost_attribution (
  cost_attribution_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  environment text NOT NULL,
  stage text NOT NULL,
  cost_center text NOT NULL,
  service_name text NOT NULL,
  metric_name text NOT NULL,
  metric_value numeric NOT NULL,
  unit text NOT NULL,
  window_start timestamp with time zone NOT NULL,
  window_end timestamp with time zone NOT NULL,
  source text NOT NULL DEFAULT 'local-template-evidence',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_event_log_merkle_sequence_ix
  ON esocial.audit_event_log (tenant_id, merkle_sequence)
  WHERE merkle_sequence IS NOT NULL;

CREATE INDEX IF NOT EXISTS retention_policy_class_ix
  ON esocial.retention_policy (tenant_id, retention_class);

CREATE INDEX IF NOT EXISTS cost_attribution_window_ix
  ON esocial.cost_attribution (tenant_id, environment, window_start, window_end);

ALTER TABLE esocial.retention_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE esocial.retention_policy FORCE ROW LEVEL SECURITY;
ALTER TABLE esocial.audit_anchor_batch ENABLE ROW LEVEL SECURITY;
ALTER TABLE esocial.audit_anchor_batch FORCE ROW LEVEL SECURITY;
ALTER TABLE esocial.cost_attribution ENABLE ROW LEVEL SECURITY;
ALTER TABLE esocial.cost_attribution FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON esocial.retention_policy;
CREATE POLICY tenant_isolation ON esocial.retention_policy
  USING (tenant_id = esocial.current_tenant_id() OR esocial.has_worker_bypass())
  WITH CHECK (tenant_id = esocial.current_tenant_id() OR esocial.has_worker_bypass());

DROP POLICY IF EXISTS tenant_isolation ON esocial.audit_anchor_batch;
CREATE POLICY tenant_isolation ON esocial.audit_anchor_batch
  USING (tenant_id = esocial.current_tenant_id() OR esocial.has_worker_bypass())
  WITH CHECK (tenant_id = esocial.current_tenant_id() OR esocial.has_worker_bypass());

DROP POLICY IF EXISTS tenant_isolation ON esocial.cost_attribution;
CREATE POLICY tenant_isolation ON esocial.cost_attribution
  USING (tenant_id = esocial.current_tenant_id() OR esocial.has_worker_bypass())
  WITH CHECK (tenant_id = esocial.current_tenant_id() OR esocial.has_worker_bypass());

GRANT SELECT, INSERT, UPDATE, DELETE ON esocial.retention_policy TO esocial_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON esocial.retention_policy TO esocial_worker;
GRANT SELECT, INSERT ON esocial.audit_anchor_batch TO esocial_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON esocial.audit_anchor_batch TO esocial_app;
GRANT SELECT, INSERT ON esocial.cost_attribution TO esocial_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON esocial.cost_attribution TO esocial_app;

COMMENT ON TABLE esocial.retention_policy IS
  'Tenant-scoped retention policy scaffold for LGPD and statutory eSocial evidence. Destructive retention requires operator approval and is not automated by this migration.';
COMMENT ON TABLE esocial.audit_anchor_batch IS
  'Local tamper-evident audit anchor batches. External anchoring is outside repository-local Round 5 evidence.';
COMMENT ON TABLE esocial.cost_attribution IS
  'Tenant and stage cost attribution measurements derived from template/resource evidence or external cost exports.';
