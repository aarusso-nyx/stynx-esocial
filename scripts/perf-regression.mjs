import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

import {
  buildEsocialIdempotencyKey,
  validateEsocialSgpRequestDto,
} from '../packages/contracts/dist/index.js';
import {
  DeterministicSandboxTransport,
  buildS1299,
  parseTotalizerXml,
} from '../packages/domain/dist/index.js';

const root = new URL('..', import.meta.url).pathname;
const mode = process.argv.includes('--baseline')
  ? 'baseline'
  : process.argv.includes('--full')
    ? 'full'
    : 'smoke';
const iterations = mode === 'full' || mode === 'baseline' ? 500 : 50;
const releaseDir = join(root, 'docs/release/1.0.0/perf-baselines');
const budgets = {
  builder: 200,
  idempotencyKey: 25,
  parseReturn: 100,
  soapStub: 500,
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
  mkdirSync(releaseDir, { recursive: true });
  writeFileSync(join(releaseDir, 'builder.json'), `${JSON.stringify(results, null, 2)}\n`);
}

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
