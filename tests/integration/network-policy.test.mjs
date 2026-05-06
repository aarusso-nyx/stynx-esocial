import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';

import {
  SoapClientTransport,
  SoapTransportGuardError,
} from '../../packages/domain/dist/index.js';

const now = new Date('2026-05-06T12:00:00.000Z');

test('runtime network policy denies non-allowlisted SOAP hosts and allows approved hosts', async () => {
  const requestXml = '<eSocial><evtInfoEmpregador Id="ID1234567890123456789012345678901234"/></eSocial>';
  const signedXml = '<eSocial><evtInfoEmpregador Id="ID1234567890123456789012345678901234"/><Signature>stub</Signature></eSocial>';
  const requestHash = `sha256:${createHash('sha256').update(requestXml).digest('hex')}`;
  const deniedAt = now.toISOString();

  assert.throws(
    () =>
      new SoapClientTransport({
        environment: 'qualification',
        endpoints: {
          submit: 'https://blocked-soap.example.test/submit',
          returnQuery: 'https://allowed-soap.example.test/return',
        },
        allowlistHosts: ['allowed-soap.example.test'],
      }),
    (error) =>
      error instanceof SoapTransportGuardError &&
      error.code === 'SOAP_ENDPOINT_NOT_ALLOWLISTED',
  );

  const evidence = {
    event: 'network.denied',
    deniedAt,
    deniedHost: 'blocked-soap.example.test',
    requestHash,
    message: 'Test/dev SOAP endpoint host is not allowlisted.',
  };
  assert.match(evidence.requestHash, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(JSON.stringify(evidence).includes(requestXml), false);

  const requests = [];
  const transport = new SoapClientTransport({
    environment: 'qualification',
    endpoints: {
      submit: 'https://allowed-soap.example.test/submit',
      returnQuery: 'https://allowed-soap.example.test/return',
    },
    allowlistHosts: ['allowed-soap.example.test'],
    fetch: async (url, init) => {
      requests.push({ url, init });
      return {
        status: 200,
        async text() {
          return '<retornoEnvioLoteEventos><status>201</status><protocoloEnvio>PROTO-ALLOW</protocoloEnvio></retornoEnvioLoteEventos>';
        },
      };
    },
  });

  const response = await transport.submit('enviar_lote_eventos', signedXml, {
    tenantId: '00000000-0000-4000-8000-000000000701',
    environment: 'qualification',
    eventClass: 'S-1000',
    requestXml,
    now,
  });
  assert.equal(requests.length, 1);
  assert.equal(response.httpStatus, 200);
  assert.equal(response.protocol, 'PROTO-ALLOW');
});
