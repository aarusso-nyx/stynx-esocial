import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  parseEsocialReturnXml,
  parseProcessingResponseXml,
  parseProtocolResponseXml,
  parseTotalizerXml,
  protocolFromXml,
} from '../../packages/domain/dist/index.js';

const root = new URL('../..', import.meta.url).pathname;

test('return parsers cover protocol success, processing rejection, SOAP fault, and malformed XML', () => {
  const protocol = parseProtocolResponseXml(protocolXml());
  assert.equal(protocol.protocol, '1.2.202605.000000000000000001');
  assert.equal(protocol.responseCode, '201');
  assert.equal(protocol.employer?.type, 'CNPJ');
  assert.equal(protocolFromXml(protocolXml()), protocol.protocol);

  const rejected = parseProcessingResponseXml(processingXml('402'));
  assert.equal(rejected.events[0]?.responseCode, '402');
  assert.equal(rejected.events[0]?.receipt, null);
  assert.deepEqual(rejected.events[0]?.errors, [
    {
      type: 'ERROR',
      code: '187',
      description: 'Schema invalido.',
      location: '/eSocial/evtInfoEmpregador',
    },
  ]);

  const fault = parseEsocialReturnXml(
    '<Envelope><Body><Fault><faultstring>certificate fault</faultstring></Fault></Body></Envelope>',
  );
  assert.equal(fault.kind, 'soap_fault');
  assert.equal(fault.responseCode, 'SOAP_FAULT');
  assert.match(fault.responseDescription, /certificate fault/u);

  assert.throws(
    () => parseProcessingResponseXml('<eSocial>'),
    /Invalid eSocial processing response XML/u,
  );
});

test('totalizer parser covers every S-50xx variant and preserves trace fields', () => {
  const cases = [
    ['s5001-totalizer.golden.xml', 'S-5001'],
    ['s5002-totalizer.golden.xml', 'S-5002'],
    ['s5011-totalizer.golden.xml', 'S-5011'],
    ['s5012-totalizer.golden.xml', 'S-5012'],
    ['s5013-totalizer.golden.xml', 'S-5013'],
  ];

  for (const [fileName, expectedKind] of cases) {
    const parsed = parseTotalizerXml(liftedParserFixture(fileName));
    assert.equal(parsed.kind, expectedKind, fileName);
    assert.match(parsed.competence, /^\d{4}-\d{2}$/u, fileName);
    assert.match(parsed.sourceEventReceipt, /^\d/u, fileName);
    assert.equal(parsed.payload.kind, expectedKind, fileName);
    assert.equal(parsed.payload.sourceEventReceipt, parsed.sourceEventReceipt);
    assert.equal(parsed.payload.rawXml, liftedParserFixture(fileName));
  }
});

function liftedParserFixture(fileName) {
  return readFileSync(
    join(
      root,
      'packages/domain/src/sgp-lifted/esocial-worker/parsers/__fixtures__',
      fileName,
    ),
    'utf8',
  );
}

function protocolXml() {
  return `
  <eSocial>
    <retornoEnvioLoteEventos>
      <ideEmpregador>
        <tpInsc>1</tpInsc>
        <nrInsc>12345678</nrInsc>
      </ideEmpregador>
      <status>
        <cdResposta>201</cdResposta>
        <descResposta>Lote recebido com sucesso.</descResposta>
      </status>
      <dadosRecepcaoLote>
        <dhRecepcao>2026-05-02T12:00:00-03:00</dhRecepcao>
        <protocoloEnvio>1.2.202605.000000000000000001</protocoloEnvio>
      </dadosRecepcaoLote>
    </retornoEnvioLoteEventos>
  </eSocial>`;
}

function processingXml(code) {
  const success = code === '201';
  return `
  <eSocial>
    <retornoProcessamentoLoteEventos>
      <ideEmpregador>
        <tpInsc>1</tpInsc>
        <nrInsc>12345678</nrInsc>
      </ideEmpregador>
      <status>
        <cdResposta>201</cdResposta>
        <descResposta>Lote Processado com Sucesso.</descResposta>
      </status>
      <dadosRecepcaoLote>
        <dhRecepcao>2026-05-02T12:00:00-03:00</dhRecepcao>
        <protocoloEnvio>1.2.202605.000000000000000001</protocoloEnvio>
      </dadosRecepcaoLote>
      <retornoEventos>
        <evento Id="IDES09SUCCESS000000000000000000001">
          <retornoEvento>
            <eSocial>
              <retornoEvento>
                <processamento>
                  <cdResposta>${code}</cdResposta>
                  <descResposta>${success ? 'Sucesso.' : 'Schema invalido.'}</descResposta>
                  <dhProcessamento>2026-05-02T12:05:00-03:00</dhProcessamento>
                  ${
                    success
                      ? ''
                      : '<ocorrencias><ocorrencia><tipo>1</tipo><codigo>187</codigo><descricao>Schema invalido.</descricao><localizacao>/eSocial/evtInfoEmpregador</localizacao></ocorrencia></ocorrencias>'
                  }
                </processamento>
                ${
                  success
                    ? '<recibo><nrRecibo>1.1.0000000000000000001</nrRecibo></recibo>'
                    : ''
                }
              </retornoEvento>
            </eSocial>
          </retornoEvento>
        </evento>
      </retornoEventos>
    </retornoProcessamentoLoteEventos>
  </eSocial>`;
}
