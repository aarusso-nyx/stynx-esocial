import { parseProtocolResponseXml, protocolFromXml } from './protocol.parser';

describe('ProtocolParser', () => {
  it.each([
    ['1', 'CNPJ', '12345678000199', 'cnpj'],
    ['2', 'CPF', '12345678909', 'cpf'],
    ['3', 'CAEPF', '12345678901234', 'caepf'],
    ['4', 'CNO', '123456789012', 'cno'],
  ] as const)('routes tpInsc %s to %s', (tpInsc, type, registration, field) => {
    const result = parseProtocolResponseXml(protocolXml(tpInsc, registration));

    expect(result.protocol).toBe('1.2.202605.000000000000000001');
    expect(result.employer).toMatchObject({
      type,
      registration,
      [field]: registration,
    });
  });

  it('extracts protocol from successful EnviarLoteEventos response', () => {
    expect(protocolFromXml(protocolXml('1', '12345678000199'))).toBe(
      '1.2.202605.000000000000000001',
    );
  });

  it('rejects SOAP faults and malformed XML', () => {
    expect(() =>
      parseProtocolResponseXml(
        '<Envelope><Body><Fault><faultstring>certificate fault</faultstring></Fault></Body></Envelope>',
      ),
    ).toThrow('SOAP fault');

    expect(() => parseProtocolResponseXml('<eSocial>')).toThrow(
      'Invalid eSocial protocol response XML',
    );
  });
});

function protocolXml(tpInsc: string, nrInsc: string): string {
  return `
  <eSocial>
    <retornoEnvioLoteEventos>
      <ideEmpregador>
        <tpInsc>${tpInsc}</tpInsc>
        <nrInsc>${nrInsc}</nrInsc>
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
