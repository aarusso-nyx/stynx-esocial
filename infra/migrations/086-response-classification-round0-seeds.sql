INSERT INTO esocial.response_classification (
  environment,
  response_code,
  canonical_status,
  retryable,
  category,
  description,
  operator_action_required,
  regulatory_code,
  status
)
VALUES
  (
    'ANY',
    '201',
    'ACCEPTED',
    false,
    'ESOCIAL_RULE',
    'Batch or event accepted by the national environment.',
    false,
    '201',
    'accepted'
  ),
  (
    'ANY',
    '202',
    'RETRY',
    true,
    'ESOCIAL_PROCESSING',
    'Batch received and still awaiting a definitive processing return.',
    false,
    '202',
    'retry'
  ),
  (
    'ANY',
    '301',
    'RETRY',
    true,
    'ESOCIAL_PROCESSING',
    'Batch processing is still pending; retry return consultation.',
    false,
    '301',
    'retry'
  ),
  (
    'ANY',
    '401',
    'REJECTED',
    false,
    'ESOCIAL_RULE',
    'Official business-rule rejection.',
    true,
    '401',
    'rejected'
  ),
  (
    'ANY',
    '402',
    'REJECTED',
    false,
    'ESOCIAL_RULE',
    'Official schema or content rejection.',
    true,
    '402',
    'rejected'
  ),
  (
    'ANY',
    '403',
    'FAILED',
    false,
    'AUTHENTICATION',
    'Authentication, authorization, or certificate authorization failure.',
    true,
    '403',
    'failed'
  ),
  (
    'ANY',
    '404',
    'FAILED',
    false,
    'TRANSPORT',
    'Requested protocol, receipt, or batch was not found by the national environment.',
    true,
    '404',
    'failed'
  ),
  (
    'ANY',
    '409',
    'FAILED',
    false,
    'IDEMPOTENCY',
    'Duplicate or conflicting regulatory operation.',
    true,
    '409',
    'failed'
  ),
  (
    'ANY',
    '500',
    'RETRY',
    true,
    'TRANSPORT',
    'Transient national environment fault.',
    false,
    '500',
    'retry'
  ),
  (
    'ANY',
    '503',
    'RETRY',
    true,
    'TRANSPORT',
    'Transient national environment or transport failure.',
    false,
    '503',
    'retry'
  ),
  (
    'ANY',
    'TIMEOUT',
    'TIMEOUT',
    true,
    'TRANSPORT',
    'Submission timed out before a definitive return.',
    false,
    'TIMEOUT',
    'timeout'
  ),
  (
    'ANY',
    'SOAP_FAULT',
    'RETRY',
    true,
    'TRANSPORT',
    'SOAP fault without definitive regulatory outcome.',
    false,
    'SOAP_FAULT',
    'retry'
  ),
  (
    'ANY',
    'MALFORMED_XML',
    'DLQ',
    false,
    'SCHEMA',
    'Malformed or unsupported return XML requires operator triage.',
    true,
    'MALFORMED_XML',
    'dlq'
  )
ON CONFLICT (environment, response_code) DO UPDATE
SET
  canonical_status = EXCLUDED.canonical_status,
  retryable = EXCLUDED.retryable,
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  operator_action_required = EXCLUDED.operator_action_required,
  regulatory_code = EXCLUDED.regulatory_code,
  status = EXCLUDED.status;

CREATE UNIQUE INDEX IF NOT EXISTS response_classification_regulatory_code_ux
  ON esocial.response_classification (
    environment,
    regulatory_code
  );
