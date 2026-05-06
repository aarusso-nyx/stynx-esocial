/* global __ENV, __ITER, __VU */

import { check, sleep } from 'k6';
import http from 'k6/http';

export const options = {
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
  },
  scenarios: {
    submit_status_smoke: {
      executor: 'constant-vus',
      vus: 5,
      duration: '30s',
    },
  },
};

const baseUrl = __ENV.ESOCIAL_LOAD_BASE_URL ?? 'http://127.0.0.1:3000';

export default function submitStatusSmoke() {
  const correlationId = `load-${__VU}-${__ITER}`;
  const response = http.post(
    `${baseUrl}/v1/events`,
    JSON.stringify({
      version: 'v1',
      family: 'request',
      correlation_id: correlationId,
      tenant_id: '00000000-0000-4000-8000-000000000101',
      environment: 'QUALIFICATION',
      event_class: 'S-1299',
      source: { source_event_id: correlationId, source_entity_id: 'entity-load' },
      payload: { eventClass: 'S-1299', competence: '2026-05' },
    }),
    {
      headers: {
        'content-type': 'application/json',
        'x-correlation-id': correlationId,
      },
    },
  );

  check(response, {
    'accepted or stubbed': (res) => [200, 202, 404].includes(res.status),
    'bounded latency': (res) => res.timings.duration < 500,
  });
  sleep(1);
}
