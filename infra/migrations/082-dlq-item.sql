CREATE TABLE IF NOT EXISTS esocial.dlq_item (
  dlq_item_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  message_id uuid,
  batch_id uuid,
  event_record_id uuid,
  environment text NOT NULL,
  event_class text NOT NULL,
  original_envelope jsonb NOT NULL,
  last_classification jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempt_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  hashes jsonb NOT NULL DEFAULT '{}'::jsonb,
  replay_hint jsonb NOT NULL DEFAULT '{}'::jsonb,
  opened_at timestamp with time zone NOT NULL DEFAULT now(),
  resolved_at timestamp with time zone,
  resolved_by text,
  status text NOT NULL DEFAULT 'OPEN',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT dlq_item_status_check CHECK (
    status IN ('OPEN', 'REPLAY_REQUESTED', 'REPLAYED', 'RESOLVED')
  ),
  CONSTRAINT dlq_item_attempt_history_array_check CHECK (
    jsonb_typeof(attempt_history) = 'array'
  ),
  CONSTRAINT dlq_item_hashes_object_check CHECK (
    jsonb_typeof(hashes) = 'object'
  ),
  CONSTRAINT dlq_item_replay_hint_object_check CHECK (
    jsonb_typeof(replay_hint) = 'object'
  )
);

CREATE INDEX IF NOT EXISTS dlq_item_opened_at_ix
  ON esocial.dlq_item (tenant_id, environment, opened_at)
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS dlq_item_event_record_ix
  ON esocial.dlq_item (tenant_id, event_record_id)
  WHERE event_record_id IS NOT NULL;

ALTER TABLE esocial.dlq_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE esocial.dlq_item FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON esocial.dlq_item;
CREATE POLICY tenant_isolation ON esocial.dlq_item
  USING (tenant_id = esocial.current_tenant_id() OR esocial.has_worker_bypass())
  WITH CHECK (tenant_id = esocial.current_tenant_id() OR esocial.has_worker_bypass());

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'esocial.dlq_item'::regclass
      AND tgname = 'dlq_item_touch_updated_at'
  ) THEN
    CREATE TRIGGER dlq_item_touch_updated_at
      BEFORE UPDATE ON esocial.dlq_item
      FOR EACH ROW EXECUTE FUNCTION esocial.touch_updated_at();
  END IF;
END;
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON esocial.dlq_item TO esocial_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON esocial.dlq_item TO esocial_worker;

COMMENT ON TABLE esocial.dlq_item IS
  'Operator-queryable DLQ surface for exhausted or terminal eSocial envelopes. Original envelopes, classifications, attempt history, hashes, and replay hints are retained under tenant RLS.';
