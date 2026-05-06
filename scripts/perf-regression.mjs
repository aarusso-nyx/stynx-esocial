import { createHash, generateKeyPairSync } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

import {
  buildEsocialIdempotencyKey,
  validateEsocialSgpRequestDto,
} from '../packages/contracts/dist/index.js';
import {
  DeterministicSandboxTransport,
  assertPromotedTableXmlValid,
  buildS1299,
  parseTotalizerXml,
} from '../packages/domain/dist/index.js';
import { signXmlBytes } from '../packages/pki-pades/dist/index.js';

const root = new URL('..', import.meta.url).pathname;
const mode = process.argv.includes('--baseline')
  ? 'baseline'
  : process.argv.includes('--full')
    ? 'full'
    : 'smoke';
const iterations = mode === 'full' || mode === 'baseline' ? 500 : 50;
const baselineDir = join(root, 'docs/release/1.0.0/perf-baselines');
const evidenceDir = join(root, 'docs/release/1.1.0/perf');
const budgets = {
  builder: 50,
  idempotencyKey: 1,
  parseReturn: 25,
  soapStub: 500,
  sign: 50,
  xsd: 100,
  dtoValidation: 10,
};

const request = JSON.parse(
  readFileSync(join(root, 'packages/contracts/examples/v1/requests/S-1299.request.json'), 'utf8'),
);
const dto = request.payload;
const totalizerXml = readFileSync(
  join(root, 'docs/templates/golden/returns/s5011-totalizer.golden.xml'),
  'utf8',
);
const signedXml = readFileSync(
  join(root, 'docs/templates/golden/builders/s1299.golden.xml'),
  'utf8',
);
const tableXml = readFileSync(
  join(root, 'docs/templates/golden/builders/s1000.golden.xml'),
  'utf8',
);
const certificate = localCertificate();

const results = {
  generatedAt: '2026-05-05T12:00:00.000Z',
  mode,
  iterations,
  budgets,
  suites: {
    builder: await measure('builder', () => {
      buildS1299(dto, { environment: '2' });
    }),
    idempotencyKey: await measure('idempotencyKey', () => {
      buildEsocialIdempotencyKey({
        family: 'request',
        tenant_id: request.tenant_id,
        environment: request.environment,
        event_class: request.event_class,
        source_event_id: request.source.source_event_id,
        source_entity_id: request.source.source_entity_id,
        competence: dto.competence,
        payload_hash: sha256(JSON.stringify(dto)),
      });
    }),
    parseReturn: await measure('parseReturn', () => {
      parseTotalizerXml(totalizerXml);
    }),
    sign: await measure('sign', () => {
      signXmlBytes({
        xmlBytes: tableXml,
        certificate,
        now: new Date('2026-05-05T12:00:00.000Z'),
      });
    }),
    xsd: await measure('xsd', () => {
      assertPromotedTableXmlValid({
        eventClass: 'S-1000',
        xml: tableXml,
        allowUnsigned: true,
      });
    }),
    soapStub: await measure('soapStub', async () => {
      const transport = new DeterministicSandboxTransport({ root });
      await transport.submit('EnviarLoteEventos', signedXml, {
        tenantId: request.tenant_id,
        environment: request.environment,
        eventClass: request.event_class,
        requestXml: signedXml,
        now: new Date('2026-05-05T12:00:00.000Z'),
      });
    }),
    dtoValidation: await measure('dtoValidation', () => {
      const result = validateEsocialSgpRequestDto(dto);
      if (!result.ok) {
        throw new Error(result.errors.join('; '));
      }
    }),
  },
};

for (const [name, stats] of Object.entries(results.suites)) {
  const budget = budgets[name];
  if (typeof budget === 'number' && stats.p99Ms > budget) {
    throw new Error(`[perf] ${name} p99 ${stats.p99Ms}ms exceeded ${budget}ms budget`);
  }
}

if (mode === 'baseline') {
  mkdirSync(baselineDir, { recursive: true });
  writeFileSync(join(baselineDir, 'builder.json'), `${JSON.stringify(results, null, 2)}\n`);
}

mkdirSync(evidenceDir, { recursive: true });
writeFileSync(join(evidenceDir, `${mode}.json`), `${JSON.stringify(results, null, 2)}\n`);
writeFileSync(join(evidenceDir, `${mode}-summary.md`), markdownSummary(results));
console.log(JSON.stringify(results, null, 2));

async function measure(name, fn) {
  const samples = [];
  for (let index = 0; index < 10; index += 1) {
    await fn();
  }
  for (let index = 0; index < iterations; index += 1) {
    const started = performance.now();
    await fn();
    samples.push(performance.now() - started);
  }
  samples.sort((left, right) => left - right);
  return {
    name,
    p50Ms: percentile(samples, 0.5),
    p95Ms: percentile(samples, 0.95),
    p99Ms: percentile(samples, 0.99),
    maxMs: Number((samples.at(-1) ?? 0).toFixed(3)),
  };
}

function percentile(samples, ratio) {
  const index = Math.min(samples.length - 1, Math.ceil(samples.length * ratio) - 1);
  return Number((samples[index] ?? 0).toFixed(3));
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function localCertificate() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    reference: {
      tenantId: '00000000-0000-4000-8000-000000000600',
      environment: 'QUALIFICATION',
      label: 'round4-perf',
      secretRef: 'local-test://round4-perf',
      version: 'local-v1',
    },
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }),
    validFrom: '2026-01-01T00:00:00.000Z',
    validUntil: '2027-01-01T00:00:00.000Z',
  };
}

function markdownSummary(value) {
  const lines = [
    '# Round 4 Perf Summary',
    '',
    `Mode: ${value.mode}`,
    `Iterations: ${value.iterations}`,
    '',
    '| Suite | p50 ms | p95 ms | p99 ms | Budget ms |',
    '| --- | ---: | ---: | ---: | ---: |',
  ];
  for (const [suite, stats] of Object.entries(value.suites)) {
    lines.push(
      `| ${suite} | ${stats.p50Ms} | ${stats.p95Ms} | ${stats.p99Ms} | ${value.budgets[suite] ?? 'n/a'} |`,
    );
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}
