import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { ESOCIAL_RELAY_EVENT_CLASSES } from '../../packages/contracts/dist/index.js';

const root = new URL('../..', import.meta.url).pathname;
const blockedTableEvents = new Set(['S-1030', 'S-1040', 'S-1060']);
const returnEvents = new Set(['S-5001', 'S-5002', 'S-5011', 'S-5012', 'S-5013']);

const activeGoldenByEvent = {
  'S-1000': ['s1000.golden.xml'],
  'S-1005': ['s1005.golden.xml'],
  'S-1010': ['s1010.golden.xml'],
  'S-1020': ['s1020.golden.xml'],
  'S-1050': ['s1050.golden.xml'],
  'S-1070': ['s1070.golden.xml'],
  'S-1200': ['s1200-three-workers.golden.xml'],
  'S-1202': ['s1202-rpps-workers.golden.xml'],
  'S-1207': ['s1207-rpps-benefit.golden.xml'],
  'S-1210': ['s1210-confirmed-payments.golden.xml'],
  'S-1298': ['s1298.golden.xml'],
  'S-1299': ['s1299.golden.xml'],
  'S-2200': ['s2200.golden.xml'],
  'S-2205': ['s2205.golden.xml'],
  'S-2206': ['s2206-promotion.golden.xml'],
  'S-2210': ['s2210-inicial.golden.xml'],
  'S-2220': ['s2220-periodico.golden.xml'],
  'S-2230': ['s2230-medical-leave.golden.xml'],
  'S-2240': ['s2240-noise-start.golden.xml'],
  'S-2298': ['s2298.golden.xml'],
  'S-2299': ['s2299-with-notice.golden.xml'],
  'S-2300': ['s2300-estagiario.golden.xml'],
  'S-2306': ['s2306.golden.xml'],
  'S-2399': ['s2399-estagiario.golden.xml'],
  'S-2400': ['s2400.golden.xml'],
  'S-2405': ['s2405.golden.xml'],
  'S-2410': ['s2410-retirement.golden.xml'],
  'S-2416': ['s2416-pension-founder.golden.xml'],
  'S-2418': ['s2418-retirement.golden.xml'],
  'S-2420': ['s2420-pension.golden.xml'],
  'S-2501': ['s2501.golden.xml'],
  'S-3000': ['s3000.golden.xml'],
};

const returnGoldenByEvent = {
  'S-5001': ['s5001-totalizer.golden.xml'],
  'S-5002': ['s5002-totalizer.golden.xml', 's5002-totalizer-retro.golden.xml'],
  'S-5011': ['s5011-totalizer.golden.xml'],
  'S-5012': ['s5012-totalizer.golden.xml'],
  'S-5013': ['s5013-totalizer.golden.xml'],
};

test('Round 1 completeness gate covers exported event classes honestly', () => {
  const missing = collectCompletenessGaps();
  assert.deepEqual(missing, []);
});

test('Round 1 completeness gate fails closed for a missing active artifact', () => {
  assert.deepEqual(
    collectCompletenessGaps({
      fileExists: (path) => !path.endsWith('/packages/contracts/schemas/v1/dto-s1000.schema.json'),
    }).filter((gap) => gap.eventClass === 'S-1000' && gap.artifact === 'schema'),
    [
      {
        eventClass: 'S-1000',
        artifact: 'schema',
        path: 'packages/contracts/schemas/v1/dto-s1000.schema.json',
      },
    ],
  );
});

function collectCompletenessGaps(options = {}) {
  const fileExists = options.fileExists ?? ((path) => existsSync(path));
  const gaps = [];
  const dispatcher = readText('packages/domain/src/submission/submission-dispatcher.ts');
  const blockerDoc = readText('docs/work/round-1/leiaute-blockers.md');
  const migrationDoc = readText('docs/sgp-migration.md');
  const consumersDoc = readText('docs/consumers.md');
  const returnTests = readEvidence([
    'tests/returns/return-parser.test.mjs',
    'tests/returns/return-processor.test.mjs',
    'tests/integration/return-postgres.test.mjs',
    'services/retorno/__tests__/return-handler.test.mjs',
  ]);
  const activeTests = readEvidence([
    ...filesIn('tests/contract'),
    ...filesIn('tests/golden'),
    ...filesIn('tests/integration'),
  ]);

  for (const eventClass of ESOCIAL_RELAY_EVENT_CLASSES) {
    const slug = schemaSlug(eventClass);
    const schemaPath = `packages/contracts/schemas/v1/dto-${slug}.schema.json`;
    const examplePath = `packages/contracts/examples/v1/requests/${eventClass}.request.json`;
    const schema = fileExists(abs(schemaPath)) ? readText(schemaPath) : '';
    const example = fileExists(abs(examplePath)) ? readText(examplePath) : '';

    requireFile(gaps, eventClass, 'schema', schemaPath, fileExists);
    requireFile(gaps, eventClass, 'example', examplePath, fileExists);

    if (blockedTableEvents.has(eventClass)) {
      requireContains(gaps, eventClass, 'blocked-schema-marker', schema, 'round1Pending');
      requireContains(gaps, eventClass, 'blocked-example-marker', example, 'round1Pending');
      requireContains(gaps, eventClass, 'blocker-doc', blockerDoc, eventClass);
      requireContains(gaps, eventClass, 'consumer-doc', consumersDoc, eventClass);
      requireContains(gaps, eventClass, 'migration-doc', migrationDoc, eventClass);
      requireMissingDirectory(gaps, eventClass, 'blocked-active-builder', `packages/domain/src/builders/${slug}`);
      continue;
    }

    if (returnEvents.has(eventClass)) {
      requireContains(gaps, eventClass, 'return-parser', readText('packages/domain/src/returns/parsers.ts'), eventClass);
      requireContains(gaps, eventClass, 'return-processor-test', returnTests, eventClass);
      for (const golden of returnGoldenByEvent[eventClass]) {
        requireFile(gaps, eventClass, 'return-golden', `docs/templates/golden/returns/${golden}`, fileExists);
      }
      requireContains(gaps, eventClass, 'return-schema-marker', schema, 'round1Pending');
      requireContains(gaps, eventClass, 'return-example-marker', example, 'round1Pending');
      requireContains(gaps, eventClass, 'return-example-kind', example, '"kind": "retorno"');
      continue;
    }

    requireFile(gaps, eventClass, 'active-builder', `packages/domain/src/builders/${slug}/builder.ts`, fileExists);
    requireContains(gaps, eventClass, 'dispatcher-entry', dispatcher, `'${eventClass}'`);
    requireContains(gaps, eventClass, 'contract-or-golden-test', activeTests, eventClass);
    requireContains(
      gaps,
      eventClass,
      'integration-pipeline',
      readText('tests/integration/soap-submission-pipeline.test.mjs'),
      `'${eventClass}'`,
    );
    requireNotContains(gaps, eventClass, 'active-schema-marker', schema, 'round1Pending');
    requireNotContains(gaps, eventClass, 'active-example-marker', example, 'round1Pending');
    for (const golden of activeGoldenByEvent[eventClass]) {
      requireFile(gaps, eventClass, 'builder-golden', `docs/templates/golden/builders/${golden}`, fileExists);
    }
  }

  return gaps;
}

function requireFile(gaps, eventClass, artifact, path, fileExists) {
  if (!fileExists(abs(path))) {
    gaps.push({ eventClass, artifact, path });
  }
}

function requireMissingDirectory(gaps, eventClass, artifact, path) {
  if (existsSync(abs(path))) {
    gaps.push({ eventClass, artifact, path });
  }
}

function requireContains(gaps, eventClass, artifact, text, value) {
  if (!text.includes(value)) {
    gaps.push({ eventClass, artifact, expected: value });
  }
}

function requireNotContains(gaps, eventClass, artifact, text, value) {
  if (text.includes(value)) {
    gaps.push({ eventClass, artifact, forbidden: value });
  }
}

function readEvidence(paths) {
  return paths.map((path) => readText(path)).join('\n');
}

function filesIn(path) {
  return readdirSync(abs(path))
    .filter((fileName) => fileName.endsWith('.test.mjs'))
    .map((fileName) => join(path, fileName));
}

function schemaSlug(eventClass) {
  return eventClass.toLowerCase().replace('-', '');
}

function readText(path) {
  return readFileSync(abs(path), 'utf8');
}

function abs(path) {
  return join(root, path);
}
