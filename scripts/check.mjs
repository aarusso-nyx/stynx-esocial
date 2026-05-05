import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const mode = process.argv[2] ?? 'lint';
const requiredDirs = [
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
  'infra/migrations',
  'docs',
  'docs/references',
  'docs/references/esocial',
  'docs/templates',
  'docs/templates/golden',
  'docs/templates/golden/builders',
  'docs/templates/golden/returns',
  'docs/templates/wsdl',
  'tests/contract',
  'tests/e2e',
  'tests/golden',
];

const requiredFiles = [
  'packages/contracts/src/index.ts',
  'packages/contracts/src/kinds.ts',
  'packages/contracts/src/spool-envelope.ts',
  'packages/contracts/src/audit-envelope.ts',
  'packages/domain/src/submission/submission-processor.ts',
  'services/submission/src/audit-publisher.ts',
  'services/submission/src/spool-update-publisher.ts',
  'infra/cdk/src/stynx-esocial-stack.ts',
  'infra/migrations/001-stynx-esocial-core.sql',
  'infra/migrations/010-02-esocial-ddl.sql',
  'infra/migrations/040-esocial-functions.sql',
  'infra/migrations/070-esocial-final.sql',
  'docs/README.md',
  'docs/architecture.md',
  'docs/events.md',
  'docs/references.md',
  'docs/templates/README.md',
  'docs/references/law-esocial.md',
  'docs/references/esocial/00-index.md',
  'docs/templates/golden/builders/s1299.golden.xml',
  'docs/templates/golden/returns/s5011-totalizer.golden.xml',
  'docs/templates/wsdl/ws-enviar-lote-eventos.wsdl',
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

console.log(`[${mode}] stynx-esocial workspace checks passed`);
