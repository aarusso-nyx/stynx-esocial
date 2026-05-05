import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { test } from 'node:test';

import {
  ESOCIAL_ERROR_CATEGORIES,
  ESOCIAL_RELAY_EVENT_CLASSES,
  ESOCIAL_STATUSES,
  ESOCIAL_TRANSPORT_FAMILIES,
  buildEsocialIdempotencyKey,
  parseEsocialSgpRequestDto,
  validateEsocialSgpRequestDto,
} from '../../packages/contracts/dist/index.js';

const root = new URL('../..', import.meta.url).pathname;
const schemasDir = join(root, 'packages/contracts/schemas/v1');
const examplesDir = join(root, 'packages/contracts/examples/v1/requests');
const schemas = Object.fromEntries(
  readdirSync(schemasDir)
    .filter((fileName) => fileName.endsWith('.schema.json'))
    .map((fileName) => [
      fileName,
      JSON.parse(readFileSync(join(schemasDir, fileName), 'utf8')),
    ]),
);
const now = '2026-05-05T12:00:00.000Z';

test('DTO schemas cover round-0 families and round-1 pending stubs without XML', () => {
  const schemaNames = Object.keys(schemas).sort();
  const dtoSchemaNames = schemaNames.filter((name) => name.startsWith('dto-'));

  assert.equal(dtoSchemaNames.length, ESOCIAL_RELAY_EVENT_CLASSES.length);
  assert.equal(schemaNames.length, ESOCIAL_RELAY_EVENT_CLASSES.length + 8);

  for (const eventClass of ESOCIAL_RELAY_EVENT_CLASSES) {
    const dto = dtoForEvent(eventClass);
    const schema = schemas[`dto-${schemaEventName(eventClass)}.schema.json`];
    assert.ok(schema, `missing DTO schema for ${eventClass}`);
    assert.deepEqual(validateAgainstSchema(dto, schema), []);
    assert.equal(parseEsocialSgpRequestDto(dto).eventClass, eventClass);
    assert.equal(JSON.stringify(schema).includes('signedEnvelope'), true);
    assert.equal(JSON.stringify(dto).includes('signedEnvelope'), false);
    assert.equal(JSON.stringify(dto).includes('payloadXml'), false);
  }
});

test('request DTO parser rejects SGP-sent XML or signature material', () => {
  const signedCandidate = {
    ...dtoForEvent('S-1000'),
    signedEnvelope: {
      payloadXml: '<eSocial />',
      pkcs7Sha256: 'sha256:signed',
    },
  };
  const result = validateEsocialSgpRequestDto(signedCandidate);

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /signedEnvelope/u);
});

test('envelope fixtures validate against JSON schemas and request DTO parser', () => {
  for (const eventClass of ESOCIAL_RELAY_EVENT_CLASSES) {
    for (const family of ESOCIAL_TRANSPORT_FAMILIES) {
      const fixture = envelopeForFamily(family, eventClass);
      const schema = schemas[`${family}.schema.json`];
      assert.ok(schema, `missing envelope schema for ${family}`);
      assert.deepEqual(validateAgainstSchema(fixture, schema), []);

      if (family === 'request') {
        assert.equal(parseEsocialSgpRequestDto(fixture.payload).eventClass, eventClass);
      }
    }
  }
});

test('published request examples are DTO-only and schema-valid', () => {
  const exampleFiles = readdirSync(examplesDir)
    .filter((fileName) => fileName.endsWith('.request.json'))
    .sort();

  assert.equal(exampleFiles.length, ESOCIAL_RELAY_EVENT_CLASSES.length);

  for (const fileName of exampleFiles) {
    const fixture = JSON.parse(readFileSync(join(examplesDir, fileName), 'utf8'));
    const serialized = JSON.stringify(fixture);

    assert.deepEqual(validateAgainstSchema(fixture, schemas['request.schema.json']), []);
    assert.equal(parseEsocialSgpRequestDto(fixture.payload).eventClass, fixture.event_class);
    assert.equal(serialized.includes('signedEnvelope'), false);
    assert.equal(serialized.includes('payloadXml'), false);
  }
});

test('status strings round-trip through response, spool, retry, dlq, and replay schemas', () => {
  for (const status of ESOCIAL_STATUSES) {
    const response = {
      ...baseEnvelope('response', 'S-1299'),
      kind: 'fechamento',
      status,
      attempt: 1,
      processed_at: now,
    };
    assert.deepEqual(validateAgainstSchema(response, schemas['response.schema.json']), []);
  }

  assert.deepEqual(
    validateAgainstSchema(
      {
        ...baseEnvelope('retry', 'S-1299'),
        kind: 'fechamento',
        status: 'timeout',
        attempt: 2,
        'max-attempts': 3,
        next_attempt_at: now,
        retry_reason: 'timeout fixture',
      },
      schemas['retry.schema.json'],
    ),
    [],
  );

  assert.deepEqual(
    validateAgainstSchema(
      {
        ...baseEnvelope('dlq', 'S-1299'),
        kind: 'fechamento',
        status: 'failed',
        final_attempt: 3,
        dlq_reason: 'terminal fixture',
        failed_at: now,
        errors: [contractError('internal')],
      },
      schemas['dlq.schema.json'],
    ),
    [],
  );
});

function envelopeForFamily(family, eventClass) {
  const base = baseEnvelope(family, eventClass);
  if (family === 'request') {
    return {
      ...base,
      kind: kindFor(eventClass),
      attempt: 1,
      'max-attempts': 3,
      'reply-to': 'sgp.esocial.submit.response',
      'dead-letter-topic': 'sgp.esocial.dlq',
      payload_hash: payloadHashFor(dtoForEvent(eventClass)),
      payload: dtoForEvent(eventClass),
    };
  }

  if (family === 'response') {
    return {
      ...base,
      kind: kindFor(eventClass),
      status: 'accepted',
      attempt: 1,
      processed_at: now,
      protocol_number: `PROTO-${eventClass}`,
      receipt_number: `REC-${eventClass}`,
      response_code: '201',
      response_description: 'Accepted in qualification fixture.',
      hashes: {
        request_sha256: payloadHashFor(dtoForEvent(eventClass)),
        payload_sha256: payloadHashFor(dtoForEvent(eventClass)),
      },
    };
  }

  if (family === 'spool') {
    return {
      ...base,
      message_id: `msg-${eventClass}`,
      kind: kindFor(eventClass),
      status_transition: {
        from: 'sent',
        to: 'accepted',
      },
      occurred_at: now,
    };
  }

  if (family === 'audit') {
    return {
      ...base,
      actor_id: 'system:esocial-submission',
      action: 'submit.status.changed',
      status: 'sent',
      target: {
        type: 'esocial_event',
        id: `target-${eventClass}`,
      },
      occurred_at: now,
    };
  }

  if (family === 'retry') {
    return {
      ...base,
      kind: kindFor(eventClass),
      status: 'retry',
      attempt: 2,
      'max-attempts': 3,
      next_attempt_at: '2026-05-05T12:05:00.000Z',
      retry_reason: 'sandbox transport timeout',
      errors: [contractError('transport')],
    };
  }

  if (family === 'dlq') {
    return {
      ...base,
      kind: kindFor(eventClass),
      status: 'dlq',
      final_attempt: 3,
      dlq_reason: 'retry budget exhausted',
      failed_at: now,
      errors: [contractError('transport')],
      replay_topic: 'sgp.esocial.replay',
    };
  }

  return {
    ...base,
    kind: kindFor(eventClass),
    status: 'pending',
    original_request_id: `req-${eventClass}`,
    replay_request_id: `replay-${eventClass}`,
    replayed_by: 'operator:test',
    replay_reason: 'contract fixture replay',
    payload: dtoForEvent(eventClass),
  };
}

function baseEnvelope(family, eventClass) {
  const key = buildEsocialIdempotencyKey({
    family,
    tenant_id: 'tenant-a',
    environment: 'QUALIFICATION',
    event_class: eventClass,
    source_event_id: `source-event-${eventClass}`,
    source_entity_id: `source-entity-${eventClass}`,
    competence: competenceFor(eventClass),
    payload_hash: payloadHashFor(dtoForEvent(eventClass)),
  });

  return stripUndefined({
    version: 'v1',
    family,
    'request-id': `req-${family}-${eventClass}`,
    'correlation-id': `corr-${eventClass}`,
    'idempotency-key': key.value,
    created_at: now,
    tenant_id: 'tenant-a',
    environment: 'QUALIFICATION',
    event_class: eventClass,
    source: {
      source_event_id: `source-event-${eventClass}`,
      source_entity_id: `source-entity-${eventClass}`,
      payroll_run_id: competenceFor(eventClass) ? 'payroll-2026-05' : undefined,
      employee_id: eventClass.startsWith('S-2') ? 'employee-1' : undefined,
    },
  });
}

function dtoForEvent(eventClass) {
  const common = {
    eventClass,
    tenantId: 'tenant-a',
    sourceEventId: `source-event-${eventClass}`,
    sourceEntityId: `source-entity-${eventClass}`,
    environment: 'qualification',
  };

  if (eventClass === 'S-1000') {
    return {
      ...common,
      employerCnpj: '12345678000199',
      validityStart: '2026-05',
      legalName: 'SistemaTech Fixture Employer',
      taxClassification: '99',
    };
  }

  if (eventClass === 'S-1010') {
    return {
      ...common,
      employerCnpj: '12345678000199',
      validityStart: '2026-05',
      rubricCode: 'RUB-001',
      rubricTableId: 'default',
      description: 'Base salary',
      rubricType: '1',
      natureCode: '1000',
      socialSecurityIncidence: '11',
      incomeTaxIncidence: '11',
      fgtsIncidence: '11',
    };
  }

  if (eventClass === 'S-1200') {
    return {
      ...common,
      employerCnpj: '12345678000199',
      competence: '2026-05',
      payrollRunId: 'payroll-2026-05',
      payrollRunStatus: 'GENERATED',
      workers: [
        {
          employeeId: 'employee-1',
          cpf: '12345678901',
          registration: 'MAT-1',
          categoryCode: '101',
          rubrics: [
            {
              rubricCode: 'RUB-001',
              ideDmDev: 'DM-1',
              amount: 1000,
            },
          ],
        },
      ],
    };
  }

  if (eventClass === 'S-1299') {
    return {
      ...common,
      employerCnpj: '12345678000199',
      competence: '2026-05',
      payrollRunId: 'payroll-2026-05',
      pendingPeriodicEvents: [],
      acceptedEventCounts: {
        remuneration: 1,
        payments: 1,
      },
    };
  }

  if (eventClass === 'S-2200') {
    return {
      ...common,
      employerCnpj: '12345678000199',
      employeeId: 'employee-1',
      cpf: '12345678901',
      name: 'Contract Fixture Worker',
      birthDate: '1990-01-01',
      admissionDate: '2026-05-01',
      registration: 'MAT-1',
      categoryCode: '101',
      contractType: 'CLT',
      jobCode: 'DEV-1',
    };
  }

  return {
    ...common,
    round1Pending: true,
    deferredReason: 'builder_not_promoted_in_round0',
  };
}

function validateAgainstSchema(value, schema) {
  return validateNode(value, schema, '$');
}

function validateNode(value, schema, path) {
  if (!schema || Object.keys(schema).length === 0) return [];

  if (schema.$ref) {
    return validateNode(value, resolveSchema(schema.$ref), path);
  }

  const errors = [];

  if (schema.not) {
    const matchedForbidden = (schema.not.anyOf ?? []).some(
      (candidate) => validateNode(value, candidate, path).length === 0,
    );
    if (matchedForbidden) errors.push(`${path} matched forbidden schema`);
  }

  if (schema.oneOf) {
    const matches = schema.oneOf.filter(
      (candidate) => validateNode(value, candidate, path).length === 0,
    );
    if (matches.length !== 1) errors.push(`${path} matched ${matches.length} oneOf schemas`);
  }

  if ('const' in schema && value !== schema.const) {
    errors.push(`${path} expected const ${schema.const}`);
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path} expected one of ${schema.enum.join(', ')}`);
  }

  if (schema.type) {
    errors.push(...validateType(value, schema.type, path));
  }

  if (
    schema.type === 'string' &&
    schema.minLength &&
    typeof value === 'string' &&
    value.length < schema.minLength
  ) {
    errors.push(`${path} shorter than ${schema.minLength}`);
  }

  if (schema.type === 'integer' && Number.isInteger(value) && value < schema.minimum) {
    errors.push(`${path} below ${schema.minimum}`);
  }

  if (schema.type === 'number' && typeof value === 'number' && value < schema.minimum) {
    errors.push(`${path} below ${schema.minimum}`);
  }

  if (schema.type === 'array' && Array.isArray(value)) {
    if (schema.minItems && value.length < schema.minItems) {
      errors.push(`${path} has fewer than ${schema.minItems} items`);
    }
    if (schema.items) {
      value.forEach((item, index) => {
        errors.push(...validateNode(item, schema.items, `${path}[${index}]`));
      });
    }
  }

  if (schema.required && isRecord(value)) {
    for (const key of schema.required) {
      if (!(key in value)) errors.push(`${path}.${key} is required`);
    }
  }

  if (schema.type === 'object' && isRecord(value)) {
    const properties = schema.properties ?? {};
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) errors.push(`${path}.${key} is not allowed`);
      }
    }
    for (const [key, childSchema] of Object.entries(properties)) {
      if (key in value) {
        errors.push(...validateNode(value[key], childSchema, `${path}.${key}`));
      }
    }
  }

  return errors;
}

function validateType(value, type, path) {
  if (type === 'object' && !isRecord(value)) return [`${path} must be object`];
  if (type === 'array' && !Array.isArray(value)) return [`${path} must be array`];
  if (type === 'string' && typeof value !== 'string') return [`${path} must be string`];
  if (type === 'integer' && !Number.isInteger(value)) return [`${path} must be integer`];
  if (type === 'number' && typeof value !== 'number') return [`${path} must be number`];
  if (type === 'boolean' && typeof value !== 'boolean') return [`${path} must be boolean`];
  return [];
}

function resolveSchema(ref) {
  const fileName = basename(ref);
  const schema = schemas[fileName];
  assert.ok(schema, `missing schema ref ${ref}`);
  return schema;
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function contractError(category) {
  assert.ok(ESOCIAL_ERROR_CATEGORIES.includes(category));
  return {
    category,
    code: `ESOCIAL_${category.toUpperCase()}`,
    message: `${category} fixture error`,
    retryable: category === 'transport',
    occurred_at: now,
  };
}

function payloadHashFor(payload) {
  return `sha256:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`;
}

function schemaEventName(eventClass) {
  return eventClass.toLowerCase().replace('-', '');
}

function kindFor(eventClass) {
  if (eventClass.startsWith('S-10')) return 'tabelas';
  if (eventClass.startsWith('S-12')) return 'folha';
  if (eventClass === 'S-1298' || eventClass === 'S-1299') return 'fechamento';
  if (eventClass.startsWith('S-22') || eventClass.startsWith('S-23')) return 'trabalhador';
  if (eventClass.startsWith('S-5')) return 'retorno';
  if (eventClass === 'S-3000') return 'exclusao';
  return 'submit';
}

function competenceFor(eventClass) {
  return eventClass.startsWith('S-12') ||
    eventClass.startsWith('S-50') ||
    eventClass === 'S-1298' ||
    eventClass === 'S-1299'
    ? '2026-05'
    : undefined;
}

function stripUndefined(value) {
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [
        key,
        isRecord(entry) ? stripUndefined(entry) : entry,
      ]),
  );
}
