CREATE TABLE esocial.submission_batch (
  batch_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  message_id uuid NOT NULL,
  environment text NOT NULL,
  event_class text NOT NULL,
  source_ref jsonb NOT NULL DEFAULT '{}'::jsonb,
  event_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  payload_hash text NOT NULL,
  status text NOT NULL,
  attempt integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT submission_batch_environment_check CHECK (
    environment IN ('PRODUCTION', 'QUALIFICATION')
  )
);

CREATE TABLE esocial.event_record (
  event_record_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  source_event_id uuid,
  payroll_run_id uuid,
  employee_id uuid,
  event_class text NOT NULL,
  payload_hash text NOT NULL,
  status text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

COMMENT ON COLUMN esocial.event_record.source_event_id IS
  'Opaque SGP source public.esocial_event id during R6 shadow. No database FK is permitted.';
COMMENT ON COLUMN esocial.event_record.payroll_run_id IS
  'Opaque SGP payroll.payroll_run id. No database FK is permitted.';
COMMENT ON COLUMN esocial.event_record.employee_id IS
  'Opaque SGP hr.employee id. No database FK is permitted.';
