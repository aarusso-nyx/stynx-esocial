import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const mode = process.argv[2] ?? 'lint';
const workspaceDirs = [
  'packages/contracts',
  'packages/domain',
  'packages/pki-pades',
  'services/submission',
  'services/tabelas',
  'services/trabalhador',
  'services/folha',
  'services/fechamento',
  'services/exclusao',
  'services/retorno',
  'services/certificado',
  'services/http-gateway',
  'services/shared',
  'infra/cdk',
];

const requiredDirs = [
  ...workspaceDirs,
  'infra/migrations',
  'docs',
  'docs/references',
  'docs/references/esocial',
  'docs/templates',
  'docs/templates/golden',
  'docs/templates/golden/builders',
  'docs/templates/golden/returns',
  'docs/templates/wsdl',
  'docs/release',
  'docs/release/1.0.0',
  'docs/release/0.1.0',
  '.github',
  '.github/workflows',
  'packages/contracts/schemas/v1',
  'packages/contracts/examples/v1/requests',
  'tests/contract',
  'tests/e2e',
  'tests/golden',
  'tests/integration',
  'tests/integration/localstack',
  'tests/integration/retry',
];

const requiredFiles = [
  'package-lock.json',
  'tsconfig.json',
  'tsconfig.base.json',
  'eslint.config.js',
  'scripts/templates-generate.mjs',
  'scripts/integration-localstack.mjs',
  'scripts/release-evidence.mjs',
  'scripts/sbom.mjs',
  '.github/workflows/ci.yml',
  '.github/workflows/release.yml',
  '.github/dependabot.yml',
  'packages/contracts/src/index.ts',
  'packages/contracts/src/kinds.ts',
  'packages/contracts/src/spool-envelope.ts',
  'packages/contracts/src/audit-envelope.ts',
  'packages/contracts/CHANGELOG.md',
  'packages/contracts/schemas/v1/request.schema.json',
  'packages/contracts/schemas/v1/response.schema.json',
  'packages/contracts/examples/v1/requests/S-1299.request.json',
  'packages/domain/src/submission/submission-processor.ts',
  'services/submission/src/audit-publisher.ts',
  'services/submission/src/spool-update-publisher.ts',
  'infra/cdk/src/esocial-stack.ts',
  'infra/cdk/config/qualification.json',
  'infra/cdk/config/restricted-production.json',
  'infra/cdk/config/production.json',
  'infra/cdk/cdk.out/esocial-qualification.template.json',
  'infra/cdk/cdk.out/esocial-restricted-production.template.json',
  'infra/migrations/001-esocial-core.sql',
  'infra/migrations/010-02-esocial-ddl.sql',
  'infra/migrations/040-esocial-functions.sql',
  'infra/migrations/070-esocial-final.sql',
  'docs/README.md',
  'docs/architecture.md',
  'docs/consumers.md',
  'docs/codex-bootstrap.md',
  'docs/events.md',
  'docs/operations.md',
  'docs/sgp-migration.md',
  'docs/release-checklist.md',
  'docs/references.md',
  'docs/release/1.0.0/evidence-manifest.json',
  'docs/release/0.1.0/evidence-manifest.json',
  'docs/templates/README.md',
  'docs/references/law-esocial.md',
  'docs/references/esocial/00-index.md',
  'docs/templates/golden/builders/s1299.golden.xml',
  'docs/templates/golden/returns/s5011-totalizer.golden.xml',
  'docs/templates/wsdl/ws-enviar-lote-eventos.wsdl',
  'tests/integration/localstack/harness.mjs',
  'tests/integration/localstack/templates.test.mjs',
];

for (const dir of requiredDirs) {
  if (!existsSync(join(root, dir))) {
    throw new Error(`[${mode}] missing required directory: ${dir}`);
  }
}

for (const file of requiredFiles) {
  if (!existsSync(join(root, file))) {
    throw new Error(`[${mode}] missing required file: ${file}`);
  }
}

for (const workspaceDir of workspaceDirs) {
  for (const fileName of ['package.json', 'tsconfig.json']) {
    const file = join(workspaceDir, fileName);
    if (!existsSync(join(root, file))) {
      throw new Error(`[${mode}] missing workspace ${fileName}: ${file}`);
    }
  }
}

for (const fileName of readdirSync(join(root, 'infra/migrations'))) {
  if (!fileName.endsWith('.sql')) continue;
  const migration = readFileSync(join(root, 'infra/migrations', fileName), 'utf8');
  if (/REFERENCES\s+(public|hr|payroll|esocial)\./iu.test(migration)) {
    throw new Error(
      `[${mode}] ${fileName} must not reference SGP schemas`,
    );
  }
  if (/postgres_fdw|CREATE\s+SERVER|CREATE\s+USER\s+MAPPING/iu.test(migration)) {
    throw new Error(`[${mode}] FDW or cross-database access is forbidden`);
  }
}

function collectActiveSourceFiles(relativeDir, files = []) {
  const absoluteDir = join(root, relativeDir);
  for (const entry of readdirSync(absoluteDir, { withFileTypes: true })) {
    const relativePath = `${relativeDir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name === 'dist' || entry.name === 'node_modules') continue;
      if (relativePath === 'packages/domain/src/sgp-lifted') continue;
      collectActiveSourceFiles(relativePath, files);
      continue;
    }

    if (/\.(?:[cm]?ts|[cm]?js)$/u.test(entry.name)) {
      files.push(relativePath);
    }
  }

  return files;
}

const activeSourceFiles = [
  ...collectActiveSourceFiles('packages'),
  ...collectActiveSourceFiles('services'),
];

for (const file of activeSourceFiles) {
  const source = readFileSync(join(root, file), 'utf8');
  if (/backend\/src\//u.test(source)) {
    throw new Error(`[${mode}] active source imports or references backend/src: ${file}`);
  }
  if (/from\s+['"]@nestjs\//u.test(source)) {
    throw new Error(`[${mode}] active source imports Nest, but Phase 1 chose plain Lambda TypeScript: ${file}`);
  }
  if (
    /from\s+['"][^'"]*(?:\.\.\/)+(?:database|common|audit|auth|documents|esocial-spool|folha-pagamento)\//u.test(
      source,
    )
  ) {
    throw new Error(`[${mode}] active source imports lifted SGP-local modules: ${file}`);
  }
}

const services = readdirSync(join(root, 'services'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== 'shared')
  .map((entry) => entry.name)
  .sort();
for (const service of services) {
  const handler = join(root, 'services', service, 'src', 'handler.ts');
  if (!existsSync(handler)) {
    throw new Error(`[${mode}] missing handler for service: ${service}`);
  }
}

console.log(`[${mode}] esocial workspace checks passed`);
