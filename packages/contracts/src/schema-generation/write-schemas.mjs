import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, '..', '..');
const outDir = join(packageRoot, 'schemas', 'v1');
const examplesDir = join(packageRoot, 'examples', 'v1', 'requests');
const kinds = await import(new URL('../../dist/kinds.js', import.meta.url));
const idempotency = await import(new URL('../../dist/idempotency.js', import.meta.url));

const promotedDtoEvents = new Set([
  'S-1000',
  'S-1005',
  'S-1010',
  'S-1020',
  'S-1050',
  'S-1070',
  'S-1200',
  'S-1202',
  'S-1207',
  'S-1210',
  'S-1298',
  'S-1299',
  'S-2200',
  'S-2205',
  'S-2206',
  'S-2210',
  'S-2220',
  'S-2230',
  'S-2240',
  'S-2298',
  'S-2299',
  'S-2300',
  'S-2306',
  'S-2399',
]);
const eventClasses = [...kinds.ESOCIAL_RELAY_EVENT_CLASSES];
const statuses = [...kinds.ESOCIAL_STATUSES];
const errorCategories = [...kinds.ESOCIAL_ERROR_CATEGORIES];
const environments = [...kinds.ESOCIAL_ENVIRONMENTS];

mkdirSync(outDir, { recursive: true });
mkdirSync(examplesDir, { recursive: true });

const schemas = {
  'request.schema.json': envelopeSchema('request', {
    kind: enumSchema(kinds.ESOCIAL_CLASSES),
    payload_hash: nonEmptyString(),
    attempt: integer(0),
    'max-attempts': integer(1),
    'reply-to': nonEmptyString(),
    'dead-letter-topic': nonEmptyString(),
    payload: {
      oneOf: eventClasses.map((eventClass) => ({
        $ref: `./dto-${schemaEventName(eventClass)}.schema.json`,
      })),
    },
  }),
  'response.schema.json': envelopeSchema('response', {
    kind: enumSchema(kinds.ESOCIAL_CLASSES),
    status: enumSchema(statuses),
    attempt: integer(0),
    processed_at: dateTimeString(),
    protocol_number: nonEmptyString(),
    receipt_number: nonEmptyString(),
    response_code: nonEmptyString(),
    response_description: nonEmptyString(),
    hashes: {
      type: 'object',
      additionalProperties: false,
      properties: {
        request_sha256: nonEmptyString(),
        payload_sha256: nonEmptyString(),
        signed_payload_sha256: nonEmptyString(),
        response_sha256: nonEmptyString(),
      },
    },
    payload: { type: 'object' },
    errors: errorsArray(),
  }),
  'spool.schema.json': envelopeSchema('spool', {
    message_id: nonEmptyString(),
    kind: enumSchema(kinds.ESOCIAL_CLASSES),
    status_transition: {
      type: 'object',
      additionalProperties: false,
      properties: {
        from: enumSchema(statuses),
        to: enumSchema(statuses),
      },
      required: ['from', 'to'],
    },
    response_payload: { type: 'object' },
    response_hash: nonEmptyString(),
    errors: errorsArray(),
    occurred_at: dateTimeString(),
  }),
  'audit.schema.json': envelopeSchema('audit', {
    actor_id: nonEmptyString(),
    action: nonEmptyString(),
    status: enumSchema(statuses),
    target: { type: 'object' },
    before: {},
    after: {},
    errors: errorsArray(),
    occurred_at: dateTimeString(),
  }),
  'retry.schema.json': envelopeSchema('retry', {
    kind: enumSchema(kinds.ESOCIAL_CLASSES),
    status: { enum: ['retry', 'timeout'] },
    attempt: integer(0),
    'max-attempts': integer(1),
    next_attempt_at: dateTimeString(),
    retry_reason: nonEmptyString(),
    errors: errorsArray(),
  }),
  'dlq.schema.json': envelopeSchema('dlq', {
    kind: enumSchema(kinds.ESOCIAL_CLASSES),
    status: { enum: ['dlq', 'failed'] },
    final_attempt: integer(0),
    dlq_reason: nonEmptyString(),
    failed_at: dateTimeString(),
    errors: errorsArray(),
    replay_topic: nonEmptyString(),
  }),
  'replay.schema.json': envelopeSchema('replay', {
    kind: enumSchema(kinds.ESOCIAL_CLASSES),
    status: { const: 'pending' },
    original_request_id: nonEmptyString(),
    replay_request_id: nonEmptyString(),
    replayed_by: nonEmptyString(),
    replay_reason: nonEmptyString(),
    payload: { type: 'object' },
  }),
  'dto.schema.json': {
    ...baseSchema('eSocial SGP request DTO v1'),
    oneOf: eventClasses.map((eventClass) => ({
      $ref: `./dto-${schemaEventName(eventClass)}.schema.json`,
    })),
  },
};

for (const eventClass of eventClasses) {
  schemas[`dto-${schemaEventName(eventClass)}.schema.json`] =
    promotedDtoEvents.has(eventClass)
      ? activeDtoSchema(eventClass)
      : round1PendingDtoSchema(eventClass);
}

for (const [fileName, schema] of Object.entries(schemas)) {
  writeFileSync(
    join(outDir, fileName),
    `${JSON.stringify(schema, null, 2)}\n`,
  );
}

for (const eventClass of eventClasses) {
  writeFileSync(
    join(examplesDir, `${eventClass}.request.json`),
    `${JSON.stringify(requestExample(eventClass), null, 2)}\n`,
  );
}

function envelopeSchema(family, properties) {
  const requiredByFamily = {
    request: [
      'kind',
      'payload_hash',
      'attempt',
      'max-attempts',
      'reply-to',
      'dead-letter-topic',
      'payload',
    ],
    response: ['kind', 'status', 'attempt', 'processed_at'],
    spool: ['message_id', 'kind', 'status_transition', 'occurred_at'],
    audit: ['action', 'target', 'occurred_at'],
    retry: [
      'kind',
      'status',
      'attempt',
      'max-attempts',
      'next_attempt_at',
      'retry_reason',
    ],
    dlq: ['kind', 'status', 'final_attempt', 'dlq_reason', 'failed_at', 'errors'],
    replay: [
      'kind',
      'status',
      'original_request_id',
      'replay_request_id',
      'replayed_by',
      'replay_reason',
    ],
  };

  return {
    ...baseSchema(`eSocial ${family} envelope v1`),
    type: 'object',
    additionalProperties: true,
    properties: {
      version: { const: 'v1' },
      family: { const: family },
      'request-id': nonEmptyString(),
      'correlation-id': nonEmptyString(),
      'idempotency-key': nonEmptyString(),
      created_at: dateTimeString(),
      tenant_id: nonEmptyString(),
      environment: enumSchema(environments),
      event_class: enumSchema(eventClasses),
      source: {
        type: 'object',
        additionalProperties: false,
        properties: {
          source_event_id: nonEmptyString(),
          payroll_run_id: nonEmptyString(),
          employee_id: nonEmptyString(),
          source_entity_id: nonEmptyString(),
          source_entity_ids: {
            type: 'array',
            items: nonEmptyString(),
          },
          source_system: nonEmptyString(),
        },
      },
      ...properties,
    },
    required: [
      'version',
      'family',
      'request-id',
      'correlation-id',
      'idempotency-key',
      'created_at',
      'tenant_id',
      'environment',
      'event_class',
      'source',
      ...requiredByFamily[family],
    ],
  };
}

function activeDtoSchema(eventClass) {
  const byEvent = {
    'S-1000': {
      required: ['employerCnpj', 'validityStart', 'legalName', 'taxClassification'],
      properties: {
        employerCnpj: nonEmptyString(),
        employerCpf: nonEmptyString(),
        validityStart: nonEmptyString(),
        validityEnd: nonEmptyString(),
        legalName: nonEmptyString(),
        taxClassification: nonEmptyString(),
        cooperativeIndicator: nonEmptyString(),
        constructionIndicator: nonEmptyString(),
        payrollExemptionIndicator: nonEmptyString(),
        electronicRecordOption: nonEmptyString(),
      },
    },
    'S-1010': {
      required: [
        'employerCnpj',
        'validityStart',
        'rubricCode',
        'rubricTableId',
        'description',
        'rubricType',
        'natureCode',
        'socialSecurityIncidence',
        'incomeTaxIncidence',
        'fgtsIncidence',
      ],
      properties: {
        employerCnpj: nonEmptyString(),
        employerCpf: nonEmptyString(),
        validityStart: nonEmptyString(),
        validityEnd: nonEmptyString(),
        rubricCode: nonEmptyString(),
        rubricTableId: nonEmptyString(),
        description: nonEmptyString(),
        rubricType: nonEmptyString(),
        natureCode: nonEmptyString(),
        socialSecurityIncidence: nonEmptyString(),
        incomeTaxIncidence: nonEmptyString(),
        fgtsIncidence: nonEmptyString(),
        unionContributionIncidence: nonEmptyString(),
      },
    },
    'S-1005': {
      required: [
        'sourceEntityId',
        'employerCnpj',
        'validityStart',
        'establishmentRegistrationNumber',
      ],
      properties: {
        employerCnpj: nonEmptyString(),
        validityStart: nonEmptyString(),
        validityEnd: nonEmptyString(),
        establishmentRegistrationNumber: nonEmptyString(),
        cnaePreponderante: nonEmptyString(),
      },
    },
    'S-1020': {
      required: ['sourceEntityId', 'employerCnpj', 'validityStart', 'lotationCode'],
      properties: {
        employerCnpj: nonEmptyString(),
        validityStart: nonEmptyString(),
        validityEnd: nonEmptyString(),
        lotationCode: nonEmptyString(),
        lotationTypeCode: nonEmptyString(),
        fpasCode: nonEmptyString(),
        thirdPartyCode: nonEmptyString(),
      },
    },
    'S-1050': {
      required: [
        'sourceEntityId',
        'employerCnpj',
        'validityStart',
        'workScheduleCode',
        'description',
        'dailyHours',
      ],
      properties: {
        employerCnpj: nonEmptyString(),
        validityStart: nonEmptyString(),
        validityEnd: nonEmptyString(),
        workScheduleCode: nonEmptyString(),
        description: nonEmptyString(),
        dailyHours: {
          anyOf: [nonEmptyString(), { type: 'number' }],
        },
      },
    },
    'S-1070': {
      required: [
        'sourceEntityId',
        'employerCnpj',
        'validityStart',
        'processNumber',
        'subject',
      ],
      properties: {
        employerCnpj: nonEmptyString(),
        validityStart: nonEmptyString(),
        validityEnd: nonEmptyString(),
        processNumber: nonEmptyString(),
        subject: nonEmptyString(),
        processType: nonEmptyString(),
        matterIndicator: nonEmptyString(),
      },
    },
    'S-1200': {
      required: [
        'employerCnpj',
        'competence',
        'payrollRunId',
        'payrollRunStatus',
        'workers',
      ],
      properties: {
        employerCnpj: nonEmptyString(),
        competence: nonEmptyString(),
        payrollRunId: nonEmptyString(),
        payrollRunStatus: nonEmptyString(),
        workers: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              employeeId: nonEmptyString(),
              cpf: nonEmptyString(),
              registration: nonEmptyString(),
              categoryCode: nonEmptyString(),
              establishmentRegistrationNumber: nonEmptyString(),
              lotationCode: nonEmptyString(),
              rubrics: {
                type: 'array',
                minItems: 1,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    rubricCode: nonEmptyString(),
                    rubricTableId: nonEmptyString(),
                    ideDmDev: nonEmptyString(),
                    amount: { type: 'number' },
                    quantity: { type: 'number' },
                  },
                  required: ['rubricCode', 'ideDmDev', 'amount'],
                },
              },
            },
            required: ['employeeId', 'cpf', 'registration', 'categoryCode', 'rubrics'],
          },
        },
      },
    },
    'S-1299': {
      required: [
        'employerCnpj',
        'competence',
        'payrollRunId',
        'pendingPeriodicEvents',
        'acceptedEventCounts',
      ],
      properties: {
        employerCnpj: nonEmptyString(),
        competence: nonEmptyString(),
        payrollRunId: nonEmptyString(),
        pendingPeriodicEvents: {
          type: 'array',
          items: nonEmptyString(),
        },
        acceptedEventCounts: {
          type: 'object',
          additionalProperties: false,
          properties: {
            remuneration: integer(0),
            payments: integer(0),
            totalizers: integer(0),
          },
          required: ['remuneration', 'payments'],
        },
        responsibleCpf: nonEmptyString(),
      },
    },
    'S-1202': {
      required: [
        'employerCnpj',
        'competence',
        'payrollRunId',
        'payrollRunStatus',
        'workers',
      ],
      properties: {
        employerCnpj: nonEmptyString(),
        competence: nonEmptyString(),
        payrollRunId: nonEmptyString(),
        payrollRunStatus: nonEmptyString(),
        workers: {
          type: 'array',
          minItems: 1,
          items: workerRemunerationSchema(false),
        },
      },
    },
    'S-1207': {
      required: [
        'employerCnpj',
        'competence',
        'payrollRunId',
        'payrollRunStatus',
        'benefits',
      ],
      properties: {
        employerCnpj: nonEmptyString(),
        competence: nonEmptyString(),
        payrollRunId: nonEmptyString(),
        payrollRunStatus: nonEmptyString(),
        benefits: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              employeeId: nonEmptyString(),
              beneficiaryCpf: nonEmptyString(),
              benefitSourceKind: { enum: ['RETIREMENT', 'PENSION'] },
              benefitSourceId: nonEmptyString(),
              benefitNumber: nonEmptyString(),
              activeBenefitCount: integer(0),
              establishmentRegistrationNumber: nonEmptyString(),
              ideDmDev: nonEmptyString(),
              eventId: nonEmptyString(),
              rubrics: periodicRubricsArraySchema(),
            },
            required: [
              'employeeId',
              'beneficiaryCpf',
              'benefitSourceKind',
              'benefitSourceId',
              'benefitNumber',
              'activeBenefitCount',
              'rubrics',
            ],
          },
        },
      },
    },
    'S-1210': {
      required: [
        'employerCnpj',
        'competence',
        'paymentBatchId',
        'paymentBatchStatus',
        'confirmedTotal',
        'payments',
      ],
      properties: {
        employerCnpj: nonEmptyString(),
        competence: nonEmptyString(),
        paymentBatchId: nonEmptyString(),
        paymentBatchStatus: nonEmptyString(),
        payrollRunId: nonEmptyString(),
        confirmedTotal: periodicMoneySchema(),
        payments: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              employeeId: nonEmptyString(),
              cpf: nonEmptyString(),
              amount: periodicMoneySchema(),
              paymentDate: nonEmptyString(),
              receiptReference: nonEmptyString(),
              payrollRunId: nonEmptyString(),
              ideDmDev: nonEmptyString(),
              eventId: nonEmptyString(),
            },
            required: [
              'employeeId',
              'cpf',
              'amount',
              'paymentDate',
              'receiptReference',
            ],
          },
        },
      },
    },
    'S-1298': {
      required: [
        'employerCnpj',
        'competence',
        'acceptedClosureReceipt',
        'acceptedClosureAt',
      ],
      properties: {
        employerCnpj: nonEmptyString(),
        competence: nonEmptyString(),
        acceptedClosureReceipt: nonEmptyString(),
        acceptedClosureAt: nonEmptyString(),
        eventId: nonEmptyString(),
      },
    },
    'S-2200': {
      required: [
        'employerCnpj',
        'employeeId',
        'cpf',
        'name',
        'birthDate',
        'admissionDate',
        'registration',
        'categoryCode',
        'contractType',
        'jobCode',
      ],
      properties: {
        employerCnpj: nonEmptyString(),
        employeeId: nonEmptyString(),
        cpf: nonEmptyString(),
        name: nonEmptyString(),
        birthDate: nonEmptyString(),
        admissionDate: nonEmptyString(),
        registration: nonEmptyString(),
        categoryCode: nonEmptyString(),
        contractType: nonEmptyString(),
        jobCode: nonEmptyString(),
        workScheduleCode: nonEmptyString(),
        salaryAmount: { type: 'number' },
        dependents: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              sourceDependentId: nonEmptyString(),
              cpf: nonEmptyString(),
              name: nonEmptyString(),
              birthDate: nonEmptyString(),
              relationshipCode: nonEmptyString(),
            },
            required: [
              'sourceDependentId',
              'name',
              'birthDate',
              'relationshipCode',
            ],
          },
        },
      },
    },
    'S-2205': {
      required: ['employerCnpj', 'employeeId', 'cpf', 'registration', 'changeDate', 'name'],
      properties: workerProperties({
        changeDate: nonEmptyString(),
        name: nonEmptyString(),
        sex: { enum: ['F', 'M'] },
        maritalStatus: nonEmptyString(),
        educationLevel: nonEmptyString(),
        phone: nonEmptyString(),
        email: nonEmptyString(),
        dependents: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              sourceDependentId: nonEmptyString(),
              name: nonEmptyString(),
              birthDate: nonEmptyString(),
              relationshipCode: nonEmptyString(),
              cpf: nonEmptyString(),
            },
            required: ['sourceDependentId', 'name', 'birthDate', 'relationshipCode'],
          },
        },
      }),
    },
    'S-2206': {
      required: [
        'employerCnpj',
        'employeeId',
        'cpf',
        'registration',
        'changeKind',
        'changeDate',
        'effectiveDate',
        'description',
        'jobName',
        'categoryCode',
      ],
      properties: workerProperties({
        changeKind: { enum: ['promotion', 'transfer', 'regime-change'] },
        changeDate: nonEmptyString(),
        effectiveDate: nonEmptyString(),
        description: nonEmptyString(),
        jobName: nonEmptyString(),
        functionName: nonEmptyString(),
        categoryCode: nonEmptyString(),
        workplaceRegistrationNumber: nonEmptyString(),
        workplaceDescription: nonEmptyString(),
      }),
    },
    'S-2210': {
      required: ['employerCnpj', 'employeeId', 'cpf', 'registration', 'kind', 'accidentDate'],
      properties: workerProperties({
        kind: { enum: ['initial', 'death', 'reopening'] },
        accidentDate: nonEmptyString(),
        accidentTime: nonEmptyString(),
        workedHoursBeforeAccident: nonEmptyString(),
        deathDate: nonEmptyString(),
        originalReceipt: nonEmptyString(),
        policeCommunication: { type: 'boolean' },
        causedLeave: { type: 'boolean' },
        internment: { type: 'boolean' },
        treatmentDurationDays: integer(0),
        observation: nonEmptyString(),
      }),
    },
    'S-2220': {
      required: ['employerCnpj', 'employeeId', 'cpf', 'registration', 'kind', 'examDate'],
      properties: workerProperties({
        kind: { enum: ['admission', 'periodic', 'return-to-work', 'termination'] },
        examDate: nonEmptyString(),
        resultCode: nonEmptyString(),
        procedureCode: nonEmptyString(),
        procedureObservation: nonEmptyString(),
        doctorName: nonEmptyString(),
        doctorCrm: nonEmptyString(),
        doctorUf: nonEmptyString(),
      }),
    },
    'S-2230': {
      required: [
        'employerCnpj',
        'employeeId',
        'cpf',
        'registration',
        'kind',
        'startDate',
        'leaveReasonCode',
      ],
      properties: workerProperties({
        kind: { enum: ['medical-leave', 'vacation'] },
        startDate: nonEmptyString(),
        leaveReasonCode: nonEmptyString(),
        observation: nonEmptyString(),
        acquisitionStart: nonEmptyString(),
        acquisitionEnd: nonEmptyString(),
      }),
    },
    'S-2240': {
      required: [
        'employerCnpj',
        'employeeId',
        'cpf',
        'registration',
        'operation',
        'startDate',
        'workplaceRegistrationNumber',
        'sector',
        'activityDescription',
        'riskCode',
        'riskDescription',
        'intensity',
        'responsibleCpf',
      ],
      properties: workerProperties({
        operation: { enum: ['start', 'change', 'end'] },
        startDate: nonEmptyString(),
        endDate: nonEmptyString(),
        workplaceRegistrationNumber: nonEmptyString(),
        sector: nonEmptyString(),
        activityDescription: nonEmptyString(),
        riskCode: nonEmptyString(),
        riskDescription: nonEmptyString(),
        intensity: periodicMoneySchema(),
        responsibleCpf: nonEmptyString(),
      }),
    },
    'S-2298': {
      required: [
        'employerCnpj',
        'employeeId',
        'cpf',
        'registration',
        'kind',
        'reinstatementDate',
        'decisionDate',
        'originalS2299Receipt',
      ],
      properties: workerProperties({
        kind: { enum: ['judicial', 'amnesty', 'other'] },
        reinstatementDate: nonEmptyString(),
        decisionDate: nonEmptyString(),
        processNumber: nonEmptyString(),
        originalS2299Receipt: nonEmptyString(),
        originatingS2418Receipt: nonEmptyString(),
      }),
    },
    'S-2299': {
      required: [
        'employerCnpj',
        'employeeId',
        'cpf',
        'registration',
        'kind',
        'terminationDate',
        'terminationReasonCode',
        'ideDmDev',
        'rubrics',
      ],
      properties: workerProperties({
        kind: { enum: ['with-notice', 'without-notice'] },
        terminationDate: nonEmptyString(),
        terminationReasonCode: nonEmptyString(),
        projectedNoticeEndDate: nonEmptyString(),
        ideDmDev: nonEmptyString(),
        establishmentRegistrationNumber: nonEmptyString(),
        lotationCode: nonEmptyString(),
        rubrics: terminationRubricsArraySchema(),
      }),
    },
    'S-2300': {
      required: [
        'employerCnpj',
        'kind',
        'workerId',
        'cpf',
        'name',
        'birthDate',
        'registration',
        'categoryCode',
        'startDate',
        'role',
        'salaryAmount',
      ],
      properties: {
        employerCnpj: nonEmptyString(),
        employerCpf: nonEmptyString(),
        eventId: nonEmptyString(),
        kind: { enum: ['intern', 'autonomous', 'council-member'] },
        workerId: nonEmptyString(),
        cpf: nonEmptyString(),
        name: nonEmptyString(),
        birthDate: nonEmptyString(),
        registration: nonEmptyString(),
        categoryCode: nonEmptyString(),
        startDate: nonEmptyString(),
        role: nonEmptyString(),
        salaryAmount: periodicMoneySchema(),
        workplaceRegistrationNumber: nonEmptyString(),
        email: nonEmptyString(),
      },
    },
    'S-2306': {
      required: [
        'employerCnpj',
        'kind',
        'contractId',
        'cpf',
        'registration',
        'changeDate',
      ],
      properties: {
        employerCnpj: nonEmptyString(),
        employerCpf: nonEmptyString(),
        eventId: nonEmptyString(),
        kind: { enum: ['role', 'pay', 'internship', 'workplace'] },
        contractId: nonEmptyString(),
        cpf: nonEmptyString(),
        registration: nonEmptyString(),
        changeDate: nonEmptyString(),
        role: nonEmptyString(),
        salaryAmount: periodicMoneySchema(),
        workplaceRegistrationNumber: nonEmptyString(),
        educationInstitution: nonEmptyString(),
      },
    },
    'S-2399': {
      required: [
        'employerCnpj',
        'kind',
        'contractId',
        'cpf',
        'registration',
        'terminationDate',
        'acceptedS2300Receipt',
      ],
      properties: {
        employerCnpj: nonEmptyString(),
        employerCpf: nonEmptyString(),
        eventId: nonEmptyString(),
        kind: { enum: ['intern', 'autonomous', 'council-member'] },
        contractId: nonEmptyString(),
        cpf: nonEmptyString(),
        registration: nonEmptyString(),
        terminationDate: nonEmptyString(),
        acceptedS2300Receipt: nonEmptyString(),
        acceptedS2306Receipt: nonEmptyString(),
      },
    },
  };

  const event = byEvent[eventClass];
  return dtoObjectSchema(eventClass, event.properties, event.required);
}

function round1PendingDtoSchema(eventClass) {
  return dtoObjectSchema(
    eventClass,
    {
      round1Pending: { const: true },
      deferredReason: { const: 'builder_not_promoted_in_round0' },
    },
    ['round1Pending', 'deferredReason'],
  );
}

function requestExample(eventClass) {
  const dto = dtoExample(eventClass);
  const payloadHash = sha256Json(dto);
  const key = idempotency.buildEsocialIdempotencyKey({
    family: 'request',
    tenant_id: dto.tenantId,
    environment: 'QUALIFICATION',
    event_class: eventClass,
    source_event_id: dto.sourceEventId,
    source_entity_id: dto.sourceEntityId,
    competence: competenceFor(eventClass),
    payload_hash: payloadHash,
  });

  return stripUndefined({
    version: 'v1',
    family: 'request',
    'request-id': `req-request-${eventClass}`,
    'correlation-id': `corr-${eventClass}`,
    'idempotency-key': key.value,
    created_at: '2026-05-05T12:00:00.000Z',
    tenant_id: dto.tenantId,
    environment: 'QUALIFICATION',
    event_class: eventClass,
    source: {
      source_event_id: dto.sourceEventId,
      source_entity_id: dto.sourceEntityId,
      payroll_run_id: competenceFor(eventClass) ? 'payroll-2026-05' : undefined,
      employee_id: eventClass.startsWith('S-2') ? 'employee-1' : undefined,
      source_system: 'SGP',
    },
    kind: kindFor(eventClass),
    payload_hash: payloadHash,
    attempt: 1,
    'max-attempts': 3,
    'reply-to': 'sgp.esocial.submit.response',
    'dead-letter-topic': 'sgp.esocial.dlq',
    payload: dto,
  });
}

function dtoExample(eventClass) {
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

  if (eventClass === 'S-1005') {
    return {
      ...common,
      employerCnpj: '12345678000199',
      validityStart: '2026-05',
      establishmentRegistrationNumber: '12345678000199',
      cnaePreponderante: '8411600',
    };
  }

  if (eventClass === 'S-1020') {
    return {
      ...common,
      employerCnpj: '12345678000199',
      validityStart: '2026-05',
      lotationCode: 'LOT01',
      lotationTypeCode: '01',
      fpasCode: '582',
      thirdPartyCode: '0000',
    };
  }

  if (eventClass === 'S-1050') {
    return {
      ...common,
      employerCnpj: '12345678000199',
      validityStart: '2026-05',
      workScheduleCode: 'JORN01',
      description: 'Jornada padrao',
      dailyHours: '8.00',
    };
  }

  if (eventClass === 'S-1070') {
    return {
      ...common,
      employerCnpj: '12345678000199',
      validityStart: '2026-05',
      processNumber: '12345678901234567',
      subject: 'Processo administrativo',
      processType: '1',
      matterIndicator: '1',
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

  if (eventClass === 'S-1202') {
    return {
      ...common,
      employerCnpj: '12345678000199',
      competence: '2026-05',
      payrollRunId: 'payroll-2026-05-rpps',
      payrollRunStatus: 'GENERATED',
      workers: [
        {
          employeeId: 'rpps-worker-1',
          cpf: '12345678901',
          registration: 'RPPS-1',
          categoryCode: '301',
          rubrics: [
            {
              rubricCode: 'PROV',
              rubricTableId: 'SGP',
              amount: '5000.00',
              quantity: '1.0000',
              kind: 'EARNING',
            },
          ],
        },
      ],
    };
  }

  if (eventClass === 'S-1207') {
    return {
      ...common,
      employerCnpj: '12345678000199',
      competence: '2026-05',
      payrollRunId: 'payroll-2026-05-benefits',
      payrollRunStatus: 'GENERATED',
      benefits: [
        {
          employeeId: 'beneficiary-1',
          beneficiaryCpf: '12345678901',
          benefitSourceKind: 'RETIREMENT',
          benefitSourceId: 'sgp-s2410-benefit-1',
          benefitNumber: 'RET08000000000000001',
          activeBenefitCount: 1,
          rubrics: [
            {
              rubricCode: 'BEN',
              rubricTableId: 'SGP',
              amount: '3200.00',
              quantity: '1.0000',
              kind: 'EARNING',
            },
          ],
        },
      ],
    };
  }

  if (eventClass === 'S-1210') {
    return {
      ...common,
      employerCnpj: '12345678000199',
      competence: '2026-05',
      paymentBatchId: 'payments-2026-05',
      paymentBatchStatus: 'PAID',
      payrollRunId: 'payroll-2026-05',
      confirmedTotal: '1000.00',
      payments: [
        {
          employeeId: 'employee-1',
          cpf: '12345678901',
          amount: '1000.00',
          paymentDate: '2026-05-25',
          receiptReference: '1.1.0000000000000001200',
        },
      ],
    };
  }

  if (eventClass === 'S-1298') {
    return {
      ...common,
      employerCnpj: '12345678000199',
      competence: '2026-05',
      acceptedClosureReceipt: '1.1.0000000000000001299',
      acceptedClosureAt: '2026-05-02T12:30:00.000Z',
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

  if (eventClass === 'S-2205') {
    return workerExample(common, {
      changeDate: '2026-05-10',
      name: 'Maria Silva Atualizada',
      sex: 'F',
      dependents: [
        {
          sourceDependentId: 'dependent-1',
          name: 'Dependente Um',
          birthDate: '2015-03-12',
          relationshipCode: '03',
          cpf: '98765432100',
        },
      ],
    });
  }

  if (eventClass === 'S-2206') {
    return workerExample(common, {
      changeKind: 'promotion',
      changeDate: '2026-05-10',
      effectiveDate: '2026-05-15',
      description: 'Promocao funcional aprovada',
      jobName: 'Coordenador Administrativo',
      categoryCode: '301',
    });
  }

  if (eventClass === 'S-2210') {
    return workerExample(common, {
      kind: 'initial',
      accidentDate: '2026-05-02',
    });
  }

  if (eventClass === 'S-2220') {
    return workerExample(common, {
      kind: 'periodic',
      examDate: '2026-05-03',
    });
  }

  if (eventClass === 'S-2230') {
    return workerExample(common, {
      kind: 'medical-leave',
      startDate: '2026-05-04',
      leaveReasonCode: '01',
    });
  }

  if (eventClass === 'S-2240') {
    return workerExample(common, {
      operation: 'start',
      startDate: '2026-05-05',
      workplaceRegistrationNumber: '12345678000199',
      sector: 'Oficina',
      activityDescription: 'Operacao em area com ruido',
      riskCode: '02.01.001',
      riskDescription: 'Ruido continuo',
      intensity: '85.5000',
      responsibleCpf: '12345678901',
    });
  }

  if (eventClass === 'S-2298') {
    return workerExample(common, {
      kind: 'judicial',
      reinstatementDate: '2026-05-20',
      decisionDate: '2026-05-10',
      processNumber: '12345678901234567890',
      originalS2299Receipt: '1.1.0000000000000002299',
    });
  }

  if (eventClass === 'S-2299') {
    return workerExample(common, {
      kind: 'with-notice',
      terminationDate: '2026-05-31',
      terminationReasonCode: '02',
      projectedNoticeEndDate: '2026-06-30',
      ideDmDev: 'RESC-1',
      rubrics: [
        {
          rubricCode: 'RUB-RESC',
          quantity: '1.0000',
          amount: '2500.00',
        },
      ],
    });
  }

  if (eventClass === 'S-2300') {
    return {
      ...common,
      employerCnpj: '12345678000199',
      kind: 'intern',
      workerId: 'tsv-worker-1',
      cpf: '12345678901',
      name: 'TSV Fixture Worker',
      birthDate: '2000-01-01',
      registration: 'TSV-1',
      categoryCode: '901',
      startDate: '2026-05-01',
      role: 'Estagiario Administrativo',
      salaryAmount: 1200,
      workplaceRegistrationNumber: '12345678000199',
    };
  }

  if (eventClass === 'S-2306') {
    return {
      ...common,
      employerCnpj: '12345678000199',
      kind: 'role',
      contractId: 'tsv-contract-1',
      cpf: '12345678901',
      registration: 'TSV-1',
      changeDate: '2026-05-15',
      role: 'Estagiario de Controle',
    };
  }

  if (eventClass === 'S-2399') {
    return {
      ...common,
      employerCnpj: '12345678000199',
      kind: 'intern',
      contractId: 'tsv-contract-1',
      cpf: '12345678901',
      registration: 'TSV-1',
      terminationDate: '2026-05-31',
      acceptedS2300Receipt: '1.1.0000000000000002300',
      acceptedS2306Receipt: '1.1.0000000000000002306',
    };
  }

  return {
    ...common,
    round1Pending: true,
    deferredReason: 'builder_not_promoted_in_round0',
  };
}

function workerExample(common, fields) {
  return {
    ...common,
    employerCnpj: '12345678000199',
    employeeId: 'employee-1',
    cpf: '12345678901',
    registration: 'MAT-1',
    ...fields,
  };
}

function dtoObjectSchema(eventClass, eventProperties, eventRequired) {
  return {
    ...baseSchema(`eSocial ${eventClass} SGP request DTO v1`),
    type: 'object',
    additionalProperties: false,
    properties: {
      eventClass: { const: eventClass },
      tenantId: nonEmptyString(),
      sourceEventId: nonEmptyString(),
      sourceEntityId: nonEmptyString(),
      sourceEntityIds: {
        type: 'array',
        items: nonEmptyString(),
      },
      environment: {
        enum: ['qualification', 'restricted_production', 'production'],
      },
      operation: {
        enum: ['inclusion', 'change', 'rectification', 'exclusion'],
      },
      ...eventProperties,
    },
    required: ['eventClass', 'tenantId', 'sourceEventId', ...eventRequired],
    not: {
      anyOf: [
        { required: ['xml'] },
        { required: ['payloadXml'] },
        { required: ['signedXml'] },
        { required: ['signedEnvelope'] },
        { required: ['pkcs7'] },
        { required: ['pkcs7Sha256'] },
      ],
    },
  };
}

function errorsArray() {
  return {
    type: 'array',
    items: {
      type: 'object',
      additionalProperties: true,
      properties: {
        category: enumSchema(errorCategories),
        code: nonEmptyString(),
        message: nonEmptyString(),
        retryable: { type: 'boolean' },
        occurred_at: dateTimeString(),
      },
      required: ['category', 'code', 'message'],
    },
  };
}

function workerRemunerationSchema(includeLotation) {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      employeeId: nonEmptyString(),
      cpf: nonEmptyString(),
      registration: nonEmptyString(),
      categoryCode: nonEmptyString(),
      establishmentRegistrationNumber: nonEmptyString(),
      lotationCode: includeLotation ? nonEmptyString() : undefined,
      ideDmDev: nonEmptyString(),
      eventId: nonEmptyString(),
      rubrics: periodicRubricsArraySchema(),
    },
    required: ['employeeId', 'cpf', 'registration', 'categoryCode', 'rubrics'],
  };
}

function periodicRubricsArraySchema() {
  return {
    type: 'array',
    minItems: 1,
    items: {
      type: 'object',
      additionalProperties: false,
      properties: {
        rubricCode: nonEmptyString(),
        rubricTableId: nonEmptyString(),
        amount: periodicMoneySchema(),
        quantity: periodicMoneySchema(),
        kind: { enum: ['EARNING', 'DEDUCTION', 'INFORMATION', 'BASE'] },
      },
      required: ['rubricCode', 'amount', 'kind'],
    },
  };
}

function terminationRubricsArraySchema() {
  return {
    type: 'array',
    minItems: 1,
    items: {
      type: 'object',
      additionalProperties: false,
      properties: {
        rubricCode: nonEmptyString(),
        rubricTableId: nonEmptyString(),
        quantity: periodicMoneySchema(),
        amount: periodicMoneySchema(),
      },
      required: ['rubricCode', 'quantity', 'amount'],
    },
  };
}

function workerProperties(eventProperties) {
  return {
    employerCnpj: nonEmptyString(),
    employerCpf: nonEmptyString(),
    eventId: nonEmptyString(),
    employeeId: nonEmptyString(),
    cpf: nonEmptyString(),
    registration: nonEmptyString(),
    receiptReference: nonEmptyString(),
    ...eventProperties,
  };
}

function periodicMoneySchema() {
  return {
    anyOf: [nonEmptyString(), { type: 'number' }],
  };
}

function baseSchema(title) {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: `https://schemas.sistematech.local/esocial/v1/${slug(title)}.schema.json`,
    title,
  };
}

function enumSchema(values) {
  return { enum: [...values] };
}

function nonEmptyString() {
  return { type: 'string', minLength: 1 };
}

function dateTimeString() {
  return { type: 'string', format: 'date-time' };
}

function integer(minimum) {
  return { type: 'integer', minimum };
}

function schemaEventName(eventClass) {
  return eventClass.toLowerCase().replace('-', '');
}

function kindFor(eventClass) {
  if (eventClass.startsWith('S-10')) return 'tabelas';
  if (eventClass.startsWith('S-12')) return 'folha';
  if (eventClass === 'S-1298' || eventClass === 'S-1299') return 'fechamento';
  if (eventClass.startsWith('S-22') || eventClass.startsWith('S-23')) {
    return 'trabalhador';
  }
  if (eventClass.startsWith('S-5')) return 'retorno';
  if (eventClass === 'S-3000') return 'exclusao';
  return 'submit';
}

function competenceFor(eventClass) {
  return ['S-1000', 'S-1005', 'S-1010', 'S-1020', 'S-1050', 'S-1070'].includes(eventClass) ||
    eventClass.startsWith('S-12') ||
    eventClass.startsWith('S-50') ||
    eventClass === 'S-1298' ||
    eventClass === 'S-1299'
    ? '2026-05'
    : undefined;
}

function sha256Json(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
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

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function slug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '');
}
