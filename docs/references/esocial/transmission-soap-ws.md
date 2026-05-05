---
scope: Transmissão eSocial SOAP e web services
version_pinned: eSocial S-1.3, MOS consolidado até NO S-1.3 08/2026
last_reviewed: 2026-05-03
primary_sources:
  - https://www.gov.br/esocial/pt-br/documentacao-tecnica/manuais/mos-s-1-3-consolidada-ate-a-no-s-1-3-08-2026.pdf
  - https://www.gov.br/esocial/pt-br/acesso-ao-sistema/ambiente-de-producao-restrita/ambiente-de-producao-restrita
---

# Transmissão SOAP e web services

| Tema                     | Regra                                                                       | Operação prática                                              | Fonte |
| ------------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------- | ----- |
| Ambientes                | Produção restrita é o ambiente oficial de testes do eSocial                 | Validar homologação sem produzir efeitos reais                | [2]   |
| Produção                 | Ambiente de produção recebe eventos com efeitos oficiais                    | Separar credenciais, certificados e endpoints por ambiente    | [1]   |
| Lote de eventos          | Eventos são enviados em estrutura de lote conforme serviços web             | Controlar protocolo, recibo e retorno de processamento        | [1]   |
| Retorno de recepção      | A recepção informa protocolo ou rejeição inicial                            | Persistir retorno bruto e status interpretado                 | [1]   |
| Retorno de processamento | O processamento informa recibos ou ocorrências por evento                   | Mapear status para aceito, rejeitado, em processamento e erro | [1]   |
| WS-Security              | Serviços usam padrões de segurança e assinatura definidos no manual técnico | Não misturar assinatura de evento com autenticação/transporte | [1]   |

## Source Index

| Marker | Primary source                                                                                                 |
| ------ | -------------------------------------------------------------------------------------------------------------- |
| [1]    | https://www.gov.br/esocial/pt-br/documentacao-tecnica/manuais/mos-s-1-3-consolidada-ate-a-no-s-1-3-08-2026.pdf |
| [2]    | https://www.gov.br/esocial/pt-br/acesso-ao-sistema/ambiente-de-producao-restrita/ambiente-de-producao-restrita |
