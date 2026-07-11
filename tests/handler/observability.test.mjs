import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { ESOCIAL_ALARM_REGISTRY } from '../../infra/cdk/dist/alarms.js';
import { ESOCIAL_DASHBOARD_REGISTRY } from '../../infra/cdk/dist/dashboards.js';
import {
  ESOCIAL_LOG_FIELD_NAMES,
  ESOCIAL_METRIC_NAMES,
  assertRequiredLogFields,
  buildMetricPayload,
  createInMemoryTraceHarness,
  createStructuredLogger,
  withTraceSpan,
} from '../../packages/domain/dist/index.js';

const now = new Date('2026-05-05T12:00:00.000Z');

test('structured logger redacts PII and preserves required log dictionary fields', () => {
  const lines = [];
  const logger = createStructuredLogger({
    service: 'submission',
    sink: (line) => lines.push(line),
    now: () => now,
  });

  logger.info({
    stage: 'build',
    message: 'PII fixture should be redacted.',
    context: {
      requestId: 'request-1',
      correlationId: 'correlation-1',
      tenantId: '00000000-0000-4000-8000-000000000807',
      eventClass: 'S-1299',
      batchId: '00000000-0000-4000-8000-000000000809',
      protocol: '1.2.202605.000000000000000001',
      receipt: '1.1.0000000000000000001',
      idempotencyKey: 'idem-1',
      attempt: 2,
    },
    data: {
      cpf: '12345678901',
      cnpj: '12345678000195',
      rawResponseXml: '<eSocial><evtRemun><cpfTrab>12345678901</cpfTrab></evtRemun></eSocial>',
      certificateFingerprintSha256: 'abcdef1234567890',
      salary: 12345.67,
      note: 'formatted documents 987.654.321-00 and 12.345.678/0001-95',
      unkeyedMarkup: '<soap:Envelope><Body /></soap:Envelope>',
    },
  });

  assert.equal(lines.length, 1);
  const serialized = lines[0];
  const entry = JSON.parse(serialized);
  assertRequiredLogFields(entry);
  for (const field of ESOCIAL_LOG_FIELD_NAMES) {
    assert.ok(Object.hasOwn(entry, field), field);
  }
  assert.equal(entry.stage, 'build');

  assert.doesNotMatch(serialized, /12345678901/u);
  assert.doesNotMatch(serialized, /12345678000195/u);
  assert.doesNotMatch(serialized, /987\.654\.321-00/u);
  assert.doesNotMatch(serialized, /12\.345\.678\/0001-95/u);
  assert.doesNotMatch(serialized, /<eSocial>/u);
  assert.doesNotMatch(serialized, /<soap:Envelope>/u);
  assert.doesNotMatch(serialized, /abcdef1234567890/u);
  assert.doesNotMatch(serialized, /12345\.67/u);
  assert.match(serialized, /\[REDACTED_XML_PAYLOAD\]/u);
  assert.match(serialized, /\[REDACTED_SALARY\]/u);
  assert.match(serialized, /\*{8}34567890/u);
});

test('metric dictionary in operations docs matches emitted metric constants', () => {
  const operations = readFileSync('docs/operations.md', 'utf8');
  const metricSection = operations.slice(
    operations.indexOf('Stable metric names:'),
    operations.indexOf('Trace spans use'),
  );
  const documented = [...metricSection.matchAll(/`(esocial\.[^`]+)`/gu)]
    .map((match) => match[1])
    .sort();
  const emitted = Object.values(ESOCIAL_METRIC_NAMES).sort();

  assert.deepEqual(documented, emitted);

  const payload = buildMetricPayload({
    name: ESOCIAL_METRIC_NAMES.xsdLatencyMs,
    value: 42,
    context: {
      tenantId: '00000000-0000-4000-8000-000000000807',
      eventClass: 'S-1299',
    },
    now,
  });
  assert.equal(payload._aws.CloudWatchMetrics[0].Metrics[0].Unit, 'Milliseconds');
});

test('trace helper records in-memory OpenTelemetry spans and C3 registries are declared', async () => {
  const harness = createInMemoryTraceHarness();
  const sink = [];
  await withTraceSpan(
    {
      service: 'submission',
      spanName: 'handler',
      context: {
        correlationId: 'correlation-1',
        tenantId: '00000000-0000-4000-8000-000000000807',
        eventClass: 'S-1299',
      },
      sink: (span) => sink.push(span),
      now: fixedClock([
        new Date('2026-05-05T12:00:00.000Z'),
        new Date('2026-05-05T12:00:00.125Z'),
      ]),
    },
    async () => 'ok',
  );

  assert.equal(sink[0].durationMs, 125);
  assert.equal(sink[0].status, 'ok');
  const spans = harness.getFinishedSpans();
  assert.equal(spans.at(-1).name, 'handler');
  assert.equal(spans.at(-1).attributes['esocial.correlationId'], 'correlation-1');

  assert.equal(ESOCIAL_ALARM_REGISTRY.length, 5);
  assert.deepEqual(
    ESOCIAL_ALARM_REGISTRY.map((alarm) => alarm.name),
    [
      'RejectedRateAlarm',
      'DlqGrowthAlarm',
      'SoapLatencyP99Alarm',
      'CertificateExpiringAlarm',
      'CircuitOpenAlarm',
    ],
  );
  assert.equal(ESOCIAL_DASHBOARD_REGISTRY.widgets.length, 5);
});

function fixedClock(values) {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}
