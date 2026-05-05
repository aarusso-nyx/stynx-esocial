import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { test } from 'node:test';

import {
  buildTableEvent,
  DeterministicSandboxTransport,
  SoapClientTransport,
  SoapTransportGuardError,
  assertSoapEndpointAllowed,
  loadCommittedEnviarLoteWsdl,
  resolveEsocialSoapEndpoints,
  signValidatedPromotedTableXml,
  transportFactory,
} from '../../packages/domain/dist/index.js';

const now = new Date('2026-05-05T12:00:00.000Z');
const tenantId = '00000000-0000-4000-8000-000000000603';
const environment = 'QUALIFICATION';

test('SOAP sandbox performs deterministic submit and return exchanges with hashes', async () => {
  const endpoints = resolveEsocialSoapEndpoints('qualification', {
    nodeEnv: 'test',
  });
  const transport = new DeterministicSandboxTransport({ endpoints });
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

  const submit = await transport.submit('enviar_lote_eventos', signed.signed.signedBytes.toString('utf8'), {
    tenantId,
    environment: 'qualification',
    eventClass: 'S-1000',
    requestXml: built.xml,
    now,
  });
  const returned = await transport.consultProtocol(submit.protocol, {
    tenantId,
    environment: 'qualification',
    eventClass: 'S-1000',
    now,
  });

  assert.equal(submit.soapStatus, 'accepted');
  assert.equal(returned.soapStatus, 'accepted');
  assert.match(submit.protocol, /^LOCAL-[0-9A-F]{24}$/u);
  assert.equal(submit.requestHash, signed.signed.requestXmlSha256);
  assert.equal(submit.signedPayloadHash, signed.signed.signedPayloadSha256);
  assert.match(submit.soapRequestHash, /^[a-f0-9]{64}$/u);
  assert.match(submit.responseHash, /^[a-f0-9]{64}$/u);
  assert.equal(returned.protocol, submit.protocol);
  assert.match(returned.rawResponse, /retornoProcessamento/u);
});

test('SOAP WSDL stub is committed and dev/test guard rejects official hosts and production routing', () => {
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

  assert.throws(
    () => resolveEsocialSoapEndpoints('restricted_production', { nodeEnv: 'test' }),
    (error) =>
      error instanceof SoapTransportGuardError &&
      error.code === 'SOAP_ENDPOINT_REQUIRED',
  );
});

test('transport factory wires sandbox, restricted client, and TLS guards without hardcoded endpoints', () => {
  const qualification = transportFactory('qualification', {
    nodeEnv: 'test',
    ci: true,
  });
  assert.equal(qualification instanceof DeterministicSandboxTransport, true);

  const restricted = transportFactory('restricted_production', {
    nodeEnv: 'test',
    mode: 'client',
    config: {
      restricted_production: {
        submit: 'https://restricted-esocial.example.test/submit',
        returnQuery: 'https://restricted-esocial.example.test/return',
      },
    },
    allowlistHosts: ['restricted-esocial.example.test'],
  });
  assert.equal(restricted instanceof SoapClientTransport, true);

  assert.throws(
    () =>
      transportFactory('restricted_production', {
        nodeEnv: 'test',
        mode: 'client',
        config: {
          restricted_production: {
            submit: 'http://restricted-esocial.example.test/submit',
            returnQuery: 'https://restricted-esocial.example.test/return',
          },
        },
        allowlistHosts: ['restricted-esocial.example.test'],
      }),
    (error) =>
      error instanceof SoapTransportGuardError &&
      error.code === 'SOAP_ENDPOINT_HTTPS_REQUIRED',
  );
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
