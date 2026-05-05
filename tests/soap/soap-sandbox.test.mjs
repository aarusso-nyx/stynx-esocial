import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { test } from 'node:test';

import {
  buildTableEvent,
  signValidatedPromotedTableXml,
} from '../../packages/domain/dist/index.js';
import {
  SandboxSoapTransport,
  SoapTransportGuardError,
  assertSoapEndpointAllowed,
  loadCommittedEnviarLoteWsdl,
  resolveEsocialSoapEndpoints,
} from '../../services/submission/dist/transport/soap-sandbox.js';

const now = new Date('2026-05-05T12:00:00.000Z');
const tenantId = '00000000-0000-4000-8000-000000000603';
const environment = 'QUALIFICATION';

test('SOAP sandbox performs deterministic submit and return exchanges with hashes', async () => {
  const endpoints = resolveEsocialSoapEndpoints('qualification', {
    nodeEnv: 'test',
  });
  const transport = new SandboxSoapTransport();
  const built = buildTableEvent({
    eventClass: 'S-1000',
    tenantId,
    sourceEntityId: '00000000-0000-4000-8000-000000000001',
    competence: '2026-01',
    employer: {
      registrationNumber: '12345678000199',
    },
  });
  const signed = signValidatedPromotedTableXml({
    eventClass: 'S-1000',
    xml: built.xml,
    certificate: localCertificate(),
    tenantId,
    environment,
    now,
  });

  const submit = await transport.submit({
    endpointUrl: endpoints.submit,
    signedBatchXml: signed.signed.signedBytes.toString('utf8'),
    now,
    protocolSeed: 'phase6-submit',
  });
  const returned = await transport.queryReturn({
    endpointUrl: endpoints.returnQuery,
    protocol: submit.protocol,
    now,
  });

  assert.equal(submit.accepted, true);
  assert.equal(returned.accepted, true);
  assert.match(submit.protocol, /^LOCAL-[0-9A-F]{24}$/u);
  assert.equal(submit.requestXmlSha256, signed.signed.requestXmlSha256);
  assert.equal(submit.signedPayloadSha256, signed.signed.signedPayloadSha256);
  assert.match(submit.soapRequestSha256, /^[a-f0-9]{64}$/u);
  assert.match(submit.soapResponseSha256, /^[a-f0-9]{64}$/u);
  assert.equal(returned.protocol, submit.protocol);
  assert.match(returned.soapResponse, /retornoProcessamento/u);
});

test('SOAP WSDL stub is committed and dev/test guard rejects gov.br and production routing', () => {
  const wsdl = loadCommittedEnviarLoteWsdl();
  assert.match(wsdl, /ServicoEnviarLoteEventos/u);
  assert.match(wsdl, /127\.0\.0\.1/u);

  assert.throws(
    () =>
      assertSoapEndpointAllowed(
        'https://webservices.esocial.gov.br/servicos/empregador/lote/eventos/envio',
        { nodeEnv: 'test' },
      ),
    (error) =>
      error instanceof SoapTransportGuardError &&
      error.code === 'SOAP_GOV_BR_FORBIDDEN_IN_TEST',
  );

  assert.throws(
    () =>
      resolveEsocialSoapEndpoints('production', {
        nodeEnv: 'test',
        config: {
          production: {
            submit: 'https://webservices.esocial.gov.br/submit',
            returnQuery: 'https://webservices.esocial.gov.br/return',
          },
        },
      }),
    (error) =>
      error instanceof SoapTransportGuardError &&
      error.code === 'SOAP_PRODUCTION_ENDPOINT_FORBIDDEN_IN_TEST',
  );

  const restricted = resolveEsocialSoapEndpoints('restricted-production', {
    nodeEnv: 'test',
  });
  assert.match(restricted.submit, /127\.0\.0\.1/u);
  assert.match(restricted.returnQuery, /restricted-production/u);
});

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
