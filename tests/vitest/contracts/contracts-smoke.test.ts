import { describe, expect, it } from 'vitest';

import {
  ESOCIAL_ERROR_CATEGORIES,
  ESOCIAL_RELAY_EVENT_CLASSES,
  ESOCIAL_STATUSES,
  buildEsocialIdempotencyKey,
} from '../../../packages/contracts/src/index.js';

describe('vitest contract smoke', () => {
  it('loads the v1 contract taxonomy and idempotency builder', () => {
    expect(ESOCIAL_RELAY_EVENT_CLASSES).toContain('S-1299');
    expect(ESOCIAL_STATUSES).toContain('accepted');
    expect(ESOCIAL_ERROR_CATEGORIES).toContain('transport');
    expect(
      buildEsocialIdempotencyKey({
        family: 'request',
        tenant_id: '00000000-0000-4000-8000-000000000001',
        environment: 'QUALIFICATION',
        event_class: 'S-1299',
        source_event_id: 'source-1',
        competence: '2026-05',
        payload_hash: 'sha256:test',
      }).value,
    ).toContain('S-1299');
  });
});
