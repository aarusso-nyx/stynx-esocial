CREATE SCHEMA IF NOT EXISTS esocial;

CREATE TABLE esocial.submission_message (
  message_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  kind text NOT NULL,
  event_class text,
  payload_hash text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL,
  attempt integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT submission_message_kind_check CHECK (
    kind IN (
      'submit',
      'tabelas',
      'trabalhador',
      'folha',
      'fechamento',
      'exclusao',
      'retorno',
      'certificado'
    )
  )
);

COMMENT ON TABLE esocial.submission_message IS
  'Autonomous eSocial state. SGP entity references are opaque payload/source identifiers only; no FK to any SGP database object is permitted.';
