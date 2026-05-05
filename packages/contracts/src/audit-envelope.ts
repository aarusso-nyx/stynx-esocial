export type AuditEventEnvelope = Readonly<{
  tenant_id: string;
  actor_id?: string;
  action: string;
  target: {
    type: string;
    id?: string;
  };
  before?: unknown;
  after?: unknown;
  occurred_at: string;
  correlation_id?: string;
}>;
