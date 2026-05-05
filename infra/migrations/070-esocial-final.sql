ALTER TABLE stynx_esocial.submission_message ENABLE ROW LEVEL SECURITY;
ALTER TABLE stynx_esocial.submission_message FORCE ROW LEVEL SECURITY;
ALTER TABLE stynx_esocial.submission_batch ENABLE ROW LEVEL SECURITY;
ALTER TABLE stynx_esocial.submission_batch FORCE ROW LEVEL SECURITY;
ALTER TABLE stynx_esocial.event_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE stynx_esocial.event_record FORCE ROW LEVEL SECURITY;

CREATE POLICY submission_message_tenant_isolation ON stynx_esocial.submission_message
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

CREATE POLICY submission_batch_tenant_isolation ON stynx_esocial.submission_batch
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

CREATE POLICY event_record_tenant_isolation ON stynx_esocial.event_record
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));
