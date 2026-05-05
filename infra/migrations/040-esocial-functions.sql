CREATE OR REPLACE FUNCTION stynx_esocial.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION stynx_esocial.stynx_publish_audit_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_payload json;
BEGIN
  v_payload := json_build_object(
    'topic', 'sgp.esocial.audit',
    'tenant_id', COALESCE(NEW.tenant_id, OLD.tenant_id),
    'action', TG_OP,
    'target', json_build_object('schema', TG_TABLE_SCHEMA, 'table', TG_TABLE_NAME),
    'occurred_at', now()
  );
  PERFORM pg_notify('stynx_esocial_audit', v_payload::text);
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER submission_batch_touch_updated_at
  BEFORE UPDATE ON stynx_esocial.submission_batch
  FOR EACH ROW EXECUTE FUNCTION stynx_esocial.touch_updated_at();

CREATE TRIGGER submission_batch_audit_mutation
  AFTER INSERT OR UPDATE OR DELETE ON stynx_esocial.submission_batch
  FOR EACH ROW EXECUTE FUNCTION stynx_esocial.stynx_publish_audit_event();

CREATE TRIGGER event_record_touch_updated_at
  BEFORE UPDATE ON stynx_esocial.event_record
  FOR EACH ROW EXECUTE FUNCTION stynx_esocial.touch_updated_at();

CREATE TRIGGER event_record_audit_mutation
  AFTER INSERT OR UPDATE OR DELETE ON stynx_esocial.event_record
  FOR EACH ROW EXECUTE FUNCTION stynx_esocial.stynx_publish_audit_event();
