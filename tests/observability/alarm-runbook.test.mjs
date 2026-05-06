import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { ESOCIAL_ALARM_REGISTRY } from '../../infra/cdk/dist/alarms.js';
import {
  ESOCIAL_METRIC_NAMES,
  buildMetricPayload,
} from '../../packages/domain/dist/index.js';

test('alarm registry metrics are emitted and each alarm has an operator runbook entry', () => {
  const operations = readFileSync('docs/operations.md', 'utf8');
  const emittedMetrics = new Set(Object.values(ESOCIAL_METRIC_NAMES));

  for (const alarm of ESOCIAL_ALARM_REGISTRY) {
    assert.ok(emittedMetrics.has(alarm.metricName), `${alarm.name} metric missing`);
    assert.equal(operations.includes(`| \`${alarm.name}\` |`), true);
    assert.equal(operations.includes(`\`${alarm.metricName}\``), true);
    const payload = buildMetricPayload({
      name: alarm.metricName,
      value: 1,
      context: {
        tenantId: '00000000-0000-4000-8000-000000000807',
        environment: 'QUALIFICATION',
        eventClass: 'S-1299',
      },
      now: new Date('2026-05-05T12:00:00.000Z'),
    });
    assert.equal(payload._aws.CloudWatchMetrics[0].Metrics[0].Name, alarm.metricName);
  }
});
