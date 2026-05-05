import { parseProcessingResponseXml } from './processing.parser';

describe('ProcessingParser', () => {
  it('parses successful ConsultarLoteEventos return with receipt', () => {
    const result = parseProcessingResponseXml(processingXml('201'));

    expect(result.protocol).toBe('1.2.202605.000000000000000001');
    expect(result.responseCode).toBe('201');
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      eventReference: 'IDES09SUCCESS000000000000000000001',
      responseCode: '201',
      receipt: '1.1.0000000000000000001',
      errors: [],
    });
  });

  it('parses schema errors and event occurrences', () => {
    const result = parseProcessingResponseXml(processingXml('402'));

    expect(result.events[0]).toMatchObject({
      responseCode: '402',
      receipt: null,
      errors: [
        {
          type: 'ERROR',
          code: '187',
          description: 'Schema invalido.',
          location: '/eSocial/evtInfoEmpregador',
        },
      ],
    });
  });

  it('rejects SOAP faults and malformed XML', () => {
    expect(() =>
      parseProcessingResponseXml(
        '<Envelope><Body><Fault><faultstring>timeout</faultstring></Fault></Body></Envelope>',
      ),
    ).toThrow('SOAP fault');

    expect(() => parseProcessingResponseXml('<eSocial>')).toThrow(
      'Invalid eSocial processing response XML',
    );
  });
});

function processingXml(code: '201' | '402'): string {
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
                      : `<ocorrencias><ocorrencia><tipo>1</tipo><codigo>187</codigo><descricao>Schema invalido.</descricao><localizacao>/eSocial/evtInfoEmpregador</localizacao></ocorrencia></ocorrencias>`
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
