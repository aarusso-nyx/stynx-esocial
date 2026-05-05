INSERT INTO esocial.response_classification (
  response_code,
  canonical_status,
  retryable,
  category,
  description,
  operator_action_required
)
VALUES
  ('402', 'REJECTED', false, 'ESOCIAL_RULE', 'Official schema or content rejection.', true)
ON CONFLICT DO NOTHING;
