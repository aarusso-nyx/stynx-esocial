import { EventEmitter } from 'node:events';

import {
  configureOpenTelemetryTracingEntrypoint,
  type RequestSpan,
} from '../../backend/src/common/observability/otel.tracing';
import {
  configurePrometheusMetricsEntrypoint,
  recordPayrollOperation,
} from '../../backend/src/common/observability/prometheus.metrics';
import { observeWorkerPoll } from '../../backend/src/common/observability/worker-poll-observability';

class TestResponse extends EventEmitter {
  statusCode = 200;
  headers: Record<string, string> = {};
  body = '';

  once(event: 'finish', listener: () => void): this {
    return super.once(event, listener);
  }

  setHeader(name: string, value: string): void {
    this.headers[name] = value;
  }

  end(body?: string): void {
    this.body = body ?? '';
  }
}

describe('R4 observability spans and metrics', () => {
  it('emits request spans and exposes scrapeable Prometheus metrics', async () => {
    const spans: RequestSpan[] = [];
    const use = jest.fn();
    const get = jest.fn();
    const app = {
      use,
      getHttpAdapter: () => ({
        getInstance: () => ({ get }),
      }),
    };

    configureOpenTelemetryTracingEntrypoint(app as never, 'sgp-core-api', {
      now: () => 1_000_000n,
      exporter: {
        exportSpan: (span) => {
          spans.push(span);
        },
      },
    });
    configurePrometheusMetricsEntrypoint(app as never, 'sgp-core-api');
    recordPayrollOperation('calculate_run', 'success');

    const tracingMiddleware = use.mock.calls[0]?.[0] as (
      request: {
        method: string;
        path: string;
        headers: Record<string, string>;
      },
      response: TestResponse,
      next: () => void,
    ) => void;
    const response = new TestResponse();
    tracingMiddleware(
      { method: 'POST', path: '/api/v1/folhas/run-1/calcular', headers: {} },
      response,
      jest.fn(),
    );
    response.emit('finish');

    const metricsHandler = get.mock.calls[0]?.[1] as (
      request: unknown,
      response: TestResponse,
    ) => void;
    const metricsResponse = new TestResponse();
    metricsHandler({}, metricsResponse);

    expect(spans[0]).toEqual(
      expect.objectContaining({
        entrypoint: 'sgp-core-api',
        name: 'POST /api/v1/folhas/run-1/calcular',
      }),
    );
    expect(metricsResponse.headers['Content-Type']).toContain('text/plain');
    expect(metricsResponse.body).toContain('sgp_http_requests_total');
    expect(metricsResponse.body).toContain('sgp_payroll_operations_total');
  });

  it('emits worker poll spans for non-HTTP entrypoints', async () => {
    const spans: RequestSpan[] = [];

    await observeWorkerPoll(
      'sgp-integrations-worker',
      async () => ({
        discovered: 1,
        processed: 1,
        failed: 0,
        skipped: 0,
      }),
      {
        now: () => 2_000_000n,
        exporter: {
          exportSpan: (span) => {
            spans.push(span);
          },
        },
      },
    );

    expect(spans[0]).toEqual(
      expect.objectContaining({
        entrypoint: 'sgp-integrations-worker',
        name: 'sgp-integrations-worker poll',
        status: 'ok',
      }),
    );
  });
});
