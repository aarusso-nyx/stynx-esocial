-- Round 6 LGPD destructive-retention approval gate.

CREATE TABLE IF NOT EXISTS esocial.lgpd_approval (
  lgpd_approval_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  approver_role text NOT NULL,
  approver_actor text NOT NULL,
  approval_reason text NOT NULL,
  approved_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT lgpd_approval_dpo_role_check
    CHECK (approver_role = 'Data Protection Officer')
);

CREATE UNIQUE INDEX IF NOT EXISTS lgpd_approval_batch_role_ux
  ON esocial.lgpd_approval (tenant_id, batch_id, approver_role);

CREATE INDEX IF NOT EXISTS lgpd_approval_batch_ix
  ON esocial.lgpd_approval (batch_id, approved_at);

ALTER TABLE esocial.lgpd_approval ENABLE ROW LEVEL SECURITY;
ALTER TABLE esocial.lgpd_approval FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON esocial.lgpd_approval;
CREATE POLICY tenant_isolation ON esocial.lgpd_approval
  USING (tenant_id = esocial.current_tenant_id() OR esocial.has_worker_bypass())
  WITH CHECK (tenant_id = esocial.current_tenant_id() OR esocial.has_worker_bypass());

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'esocial.lgpd_approval'::regclass
      AND tgname = 'lgpd_approval_append_only'
  ) THEN
    CREATE TRIGGER lgpd_approval_append_only
      BEFORE UPDATE OR DELETE ON esocial.lgpd_approval
      FOR EACH ROW EXECUTE FUNCTION esocial.prevent_append_only_mutation();
  END IF;
END;
$$;

GRANT SELECT, INSERT ON esocial.lgpd_approval TO esocial_worker;
GRANT SELECT, INSERT ON esocial.lgpd_approval TO esocial_app;

COMMENT ON TABLE esocial.lgpd_approval IS
  'Append-only DPO approval gate for destructive LGPD retention batches. Round 6 keeps the DPO owner label as Data Protection Officer (TBD) in runbooks until a named owner is assigned.';
