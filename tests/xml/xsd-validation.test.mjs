import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  InMemoryXsdValidationFailureSink,
  PROMOTED_TABLE_EVENT_CLASSES,
  XsdValidationError,
  buildTableEvent,
  signValidatedPromotedTableXml,
  validateAndCapturePromotedTableXml,
  validatePromotedTableXml,
} from '../../packages/domain/dist/index.js';

const now = new Date('2026-05-05T12:00:00.000Z');
const root = new URL('../..', import.meta.url).pathname;
const tenantId = '00000000-0000-4000-8000-000000000601';
const environment = 'QUALIFICATION';

test('promoted table XML validates against bound S-1.3 XSDs with unsigned pre-signing stub', () => {
  for (const eventClass of PROMOTED_TABLE_EVENT_CLASSES) {
    const built = buildTableEvent(tableDto(eventClass));
    const result = validatePromotedTableXml({
      eventClass,
      xml: built.xml,
      tenantId,
      environment,
      now,
    });

    assert.equal(result.valid, true, eventClass);
    assert.equal(result.status, 'building');
    assert.equal(result.eventClass, eventClass);
    assert.equal(result.issues.length, 0);
    assert.match(result.payloadHash, /^sha256:[a-f0-9]{64}$/u);
    assert.match(result.xsdPath, /^packages\/domain\/src\/xml\/xsd\/bundle\//u);
  }
});

test('committed table golden variants validate against their bound S-1.3 XSDs', () => {
  for (const event of ['s1000', 's1005', 's1010', 's1020', 's1050', 's1070']) {
    const eventClass = `S-${event.slice(1)}`;
    const dir = join(root, 'docs/templates/golden/builders', event);
    for (const fileName of readdirSync(dir).filter((file) => file.endsWith('.golden.xml'))) {
      const result = validatePromotedTableXml({
        eventClass,
        xml: readFileSync(join(dir, fileName), 'utf8'),
        tenantId,
        environment,
        now,
      });

      assert.equal(result.valid, true, fileName);
      assert.equal(result.eventClass, eventClass, fileName);
      assert.equal(result.issues.length, 0, fileName);
    }
  }
});

test('XSD validation captures invalid node failures for persistence', async () => {
  const built = buildTableEvent(tableDto('S-1000'));
  const invalidXml = built.xml.replace(
    '<classTrib>85</classTrib>',
    '<classTrib>bad</classTrib>',
  );
  const sink = new InMemoryXsdValidationFailureSink();

  const result = await validateAndCapturePromotedTableXml(
    {
      eventClass: 'S-1000',
      xml: invalidXml,
      tenantId,
      batchId: '20000000-0000-4000-8000-000000000601',
      eventRecordId: '30000000-0000-4000-8000-000000000601',
      environment,
      now,
    },
    sink,
  );

  assert.equal(result.valid, false);
  assert.equal(result.status, 'validation_failed');
  assert.equal(result.statusUpdate.failure_category, 'xsd_validation');
  assert.equal(sink.failures.length > 0, true);
  assert.equal(sink.failures[0].tenantId, tenantId);
  assert.equal(sink.failures[0].eventClass, 'S-1000');
  assert.equal(sink.failures[0].severity, 'ERROR');
  assert.match(sink.failures[0].payloadHash, /^sha256:[a-f0-9]{64}$/u);
  assert.match(sink.failures[0].message, /classTrib|valid/u);
});

test('XXE and DTD payloads are rejected before XSD and signing', async () => {
  const sink = new InMemoryXsdValidationFailureSink();
  const xxe = '<!DOCTYPE eSocial [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><eSocial>&xxe;</eSocial>';
  const result = await validateAndCapturePromotedTableXml(
    {
      eventClass: 'S-1000',
      xml: xxe,
      tenantId,
      environment,
      now,
    },
    sink,
  );

  assert.equal(result.valid, false);
  assert.equal(result.statusUpdate.failure_category, 'xml_security');
  assert.equal(result.issues[0].code, 'XML_DTD_FORBIDDEN');
  assert.equal(sink.failures[0].xsdCode, 'XML_DTD_FORBIDDEN');

  assert.throws(
    () =>
      signValidatedPromotedTableXml({
        eventClass: 'S-1000',
        xml: xxe,
        certificate: localCertificate(),
        tenantId,
        environment,
        now,
      }),
    XsdValidationError,
  );
});

test('stylesheet, external identifier, and unresolved entity payloads are rejected before XSD', async () => {
  const cases = [
    [
      '<?xml-stylesheet type="text/xsl" href="file:///tmp/esocial.xsl"?><eSocial />',
      'XML_STYLESHEET_FORBIDDEN',
    ],
    [
      '<eSocial SYSTEM "file:///etc/passwd" />',
      'XML_EXTERNAL_IDENTIFIER_FORBIDDEN',
    ],
    [
      '<eSocial>&tenantSecret;</eSocial>',
      'XML_ENTITY_REFERENCE_FORBIDDEN',
    ],
  ];

  for (const [xml, code] of cases) {
    const sink = new InMemoryXsdValidationFailureSink();
    const result = await validateAndCapturePromotedTableXml(
      {
        eventClass: 'S-1000',
        xml,
        tenantId,
        environment,
        now,
      },
      sink,
    );

    assert.equal(result.valid, false, code);
    assert.equal(result.statusUpdate.failure_category, 'xml_security', code);
    assert.equal(result.issues[0].code, code);
    assert.equal(sink.failures[0].xsdCode, code);
  }
});

test('valid promoted table XML can be signed only after XSD validation', () => {
  for (const eventClass of PROMOTED_TABLE_EVENT_CLASSES) {
    const built = buildTableEvent(tableDto(eventClass));
    const signed = signValidatedPromotedTableXml({
      eventClass,
      xml: built.xml,
      certificate: localCertificate(),
      tenantId,
      environment,
      now,
    });

    assert.equal(signed.validation.valid, true, eventClass);
    assert.equal(signed.signed.requestXmlSha256, built.xmlSha256, eventClass);
    assert.match(signed.signed.signedBytes.toString('utf8'), /<ds:Signature\b/u, eventClass);
  }
});

function tableDto(eventClass) {
  const base = {
    eventClass,
    tenantId,
    competence: '2026-01',
    sourceEntityId: sourceEntityId(eventClass),
  };
  switch (eventClass) {
    case 'S-1000':
      return {
        ...base,
        employer: {
          registrationNumber: '12345678000199',
        },
      };
    case 'S-1005':
      return {
        ...base,
        establishment: {
          registrationNumber: '12345678000199',
          employerRegistrationNumber: '12345678000199',
        },
      };
    case 'S-1010':
      return {
        ...base,
        rubric: {
          code: 'BASE',
          description: 'Rubrica base',
          natureCode: '1000',
          type: 'earning',
          incidences: {
            codIncPisPasep: '11',
          },
          employerRegistrationNumber: '12345678000199',
        },
      };
    case 'S-1020':
      return {
        ...base,
        taxLotation: {
          code: 'LOT01',
          employerRegistrationNumber: '12345678000199',
          fpasCode: '582',
        },
      };
    case 'S-1050':
      return {
        ...base,
        workSchedule: {
          code: 'JORN01',
          description: 'Jornada padrao',
          dailyHours: '8.00',
          employerRegistrationNumber: '12345678000199',
        },
      };
    case 'S-1070':
      return {
        ...base,
        process: {
          processNumber: '12345678901234567',
          subject: 'Processo administrativo',
          employerRegistrationNumber: '12345678000199',
        },
      };
    default:
      throw new Error(`unhandled event class ${eventClass}`);
  }
}

function sourceEntityId(eventClass) {
  return {
    'S-1000': '00000000-0000-4000-8000-000000000001',
    'S-1005': '00000000-0000-4000-8000-000000000005',
    'S-1010': '00000000-0000-4000-8000-000000000010',
    'S-1020': '00000000-0000-4000-8000-000000000020',
    'S-1050': '00000000-0000-4000-8000-000000000050',
    'S-1070': '00000000-0000-4000-8000-000000000070',
  }[eventClass];
}

function localCertificate() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  return {
    reference: {
      tenantId,
      environment,
      label: 'phase6-local',
      secretRef: 'local-test://phase6-cert',
      version: 'local-v1',
    },
    privateKeyPem: privateKey.export({
      type: 'pkcs8',
      format: 'pem',
    }),
    publicKeyPem: publicKey.export({
      type: 'spki',
      format: 'pem',
    }),
    validFrom: '2026-01-01T00:00:00.000Z',
    validUntil: '2027-01-01T00:00:00.000Z',
  };
}
