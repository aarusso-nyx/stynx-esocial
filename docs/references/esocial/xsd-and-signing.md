---
scope: XSD e assinatura digital eSocial
version_pinned: eSocial S-1.3, pacote técnico e MOS consolidado até NO S-1.3 08/2026
last_reviewed: 2026-05-03
primary_sources:
  - https://www.gov.br/esocial/pt-br/documentacao-tecnica/manuais/mos-s-1-3-consolidada-ate-a-no-s-1-3-08-2026.pdf
  - https://www.gov.br/esocial/pt-br/documentacao-tecnica/leiautes-esocial-versao-s-1-3-nt-06-2026/tabelas.html
---

# XSD e assinatura

| Tema                | Obrigação técnica                                                         | Detalhe operacional                                                       | Fonte |
| ------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----- |
| Leiaute XML         | Eventos seguem leiautes oficiais e tabelas publicadas para a versão S-1.3 | Validar XML contra o pacote técnico correspondente antes da transmissão   | [1]   |
| Tabelas oficiais    | Domínios de códigos são publicados como anexos do leiaute                 | Validar natureza de rubrica, categorias e códigos contra tabelas oficiais | [2]   |
| Assinatura digital  | Eventos exigem assinatura digital conforme regras técnicas do eSocial     | Usar certificado digital compatível com ICP-Brasil quando aplicável       | [1]   |
| Certificado A1/A3   | Certificados digitais identificam o transmissor ou procurador autorizado  | Guardar cadeia e validade para auditoria de envio                         | [1]   |
| Validação de cadeia | Recepção oficial valida assinatura, estrutura e regras de negócio         | Separar erro de schema de erro de regra de negócio                        | [1]   |

## Source Index

| Marker | Primary source                                                                                                 |
| ------ | -------------------------------------------------------------------------------------------------------------- |
| [1]    | https://www.gov.br/esocial/pt-br/documentacao-tecnica/manuais/mos-s-1-3-consolidada-ate-a-no-s-1-3-08-2026.pdf |
| [2]    | https://www.gov.br/esocial/pt-br/documentacao-tecnica/leiautes-esocial-versao-s-1-3-nt-06-2026/tabelas.html    |
