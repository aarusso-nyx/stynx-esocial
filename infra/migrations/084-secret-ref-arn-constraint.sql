DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'esocial.tenant_certificate'::regclass
      AND conname = 'tenant_certificate_secret_ref_arn_check'
  ) THEN
    ALTER TABLE esocial.tenant_certificate
      ADD CONSTRAINT tenant_certificate_secret_ref_arn_check CHECK (
        secret_ref ~ '^arn:aws(-[a-z]+)?:secretsmanager:[a-z0-9-]+:[0-9]{12}:secret:[A-Za-z0-9/_+=.@-]+$'
      );
  END IF;
END;
$$;

COMMENT ON CONSTRAINT tenant_certificate_secret_ref_arn_check
  ON esocial.tenant_certificate IS
  'Tenant certificates store AWS Secrets Manager ARNs only; certificate bytes, local paths, PFX/PEM material, and private keys are forbidden.';
