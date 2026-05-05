export type ResponseClass = 'ACCEPTED' | 'RECOVERABLE' | 'DEFINITIVE';

export interface ResponseClassification {
  responseCode: string;
  class: ResponseClass;
  description: string;
}

export const OFFICIAL_RESPONSE_CLASSIFICATIONS: ResponseClassification[] = [
  {
    responseCode: '101',
    class: 'RECOVERABLE',
    description: 'Lote Aguardando Processamento.',
  },
  { responseCode: '201', class: 'ACCEPTED', description: 'Sucesso.' },
  {
    responseCode: '202',
    class: 'ACCEPTED',
    description: 'Sucesso com advertencia.',
  },
  { responseCode: '301', class: 'RECOVERABLE', description: 'Erro servidor.' },
  {
    responseCode: '401',
    class: 'DEFINITIVE',
    description: 'Erro no conteudo do evento.',
  },
  { responseCode: '402', class: 'DEFINITIVE', description: 'Schema invalido.' },
  {
    responseCode: '403',
    class: 'DEFINITIVE',
    description: 'Leiaute invalido.',
  },
  {
    responseCode: '404',
    class: 'DEFINITIVE',
    description: 'Erro do certificado digital da assinatura do evento.',
  },
  {
    responseCode: '405',
    class: 'DEFINITIVE',
    description: 'Erro na assinatura evento.',
  },
  {
    responseCode: '406',
    class: 'DEFINITIVE',
    description:
      'Evento nao pertence ao grupo especificado no lote de eventos.',
  },
  {
    responseCode: '407',
    class: 'RECOVERABLE',
    description: 'Regra de precedencia na transmissao de eventos nao seguida.',
  },
  {
    responseCode: '408',
    class: 'RECOVERABLE',
    description: 'Erro na integracao com o sistema CNPJ / CPF.',
  },
  {
    responseCode: '409',
    class: 'RECOVERABLE',
    description: 'Erro na integracao com o sistema Procuracao Eletronica RFB.',
  },
  {
    responseCode: '410',
    class: 'RECOVERABLE',
    description:
      'Erro na integracao com o sistema Procuracao Eletronica Caixa.',
  },
  {
    responseCode: '411',
    class: 'DEFINITIVE',
    description: 'Assinante invalido ou sem perfil de procuracao eletronica.',
  },
  {
    responseCode: '501',
    class: 'DEFINITIVE',
    description: 'Solicitacao de Consulta Incorreta - Erro Preenchimento.',
  },
  {
    responseCode: '502',
    class: 'DEFINITIVE',
    description: 'Solicitacao de Consulta Incorreta - Schema Invalido.',
  },
  {
    responseCode: '503',
    class: 'DEFINITIVE',
    description:
      'Solicitacao de Consulta Incorreta - Versao do Schema Nao Permitida.',
  },
  {
    responseCode: '504',
    class: 'DEFINITIVE',
    description: 'Solicitacao de Consulta Incorreta - Erro Certificado.',
  },
  {
    responseCode: '505',
    class: 'DEFINITIVE',
    description: 'Solicitacao de Consulta Incorreta - Consulta nula ou vazia.',
  },
];

export const OFFICIAL_RESPONSE_CLASSIFICATION_BY_CODE = new Map(
  OFFICIAL_RESPONSE_CLASSIFICATIONS.map((classification) => [
    classification.responseCode,
    classification,
  ]),
);
