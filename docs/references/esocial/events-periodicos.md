---
scope: Eventos eSocial periódicos
version_pinned: eSocial S-1.3, MOS consolidado até NO S-1.3 08/2026
last_reviewed: 2026-05-03
primary_sources:
  - https://www.gov.br/esocial/pt-br/documentacao-tecnica/manuais/mos-s-1-3-consolidada-ate-a-no-s-1-3-08-2026.pdf
---

# Eventos periódicos

| Evento | Finalidade                                                | Quando emitir                                  | Campos-chave                            | Regra prática                                | Fonte |
| ------ | --------------------------------------------------------- | ---------------------------------------------- | --------------------------------------- | -------------------------------------------- | ----- |
| S-1200 | Remuneração de trabalhador vinculado ao RGPS              | Competência mensal com remuneração             | CPF, matrícula, rubricas, lotação       | Usa rubricas S-1010 e bases oficiais         | [1]   |
| S-1202 | Remuneração de servidor vinculado ao RPPS                 | Competência mensal de servidor RPPS            | CPF, matrícula, rubricas RPPS           | Apuração própria de RPPS                     | [1]   |
| S-1207 | Benefícios previdenciários RPPS                           | Competência de benefício RPPS                  | Beneficiário, benefício, rubricas       | Base periódica para benefícios               | [1]   |
| S-1210 | Pagamentos de rendimentos do trabalho                     | Pagamento efetuado ao trabalhador/beneficiário | Data pagamento, recibos, rubricas pagas | Relaciona pagamento à competência            | [1]   |
| S-1260 | Comercialização da produção rural                         | Situações de produção rural                    | Valores e identificação do adquirente   | Aplicação específica rural                   | [1]   |
| S-1270 | Contratação de trabalhadores avulsos não portuários       | Contratação avulsa não portuária               | Valores e tomador                       | Aplicação específica de avulsos              | [1]   |
| S-1280 | Informações complementares aos eventos periódicos         | Fatores complementares de apuração             | Indicativos e informações tributárias   | Ajusta cálculo de contribuições              | [1]   |
| S-1295 | Solicitação de totalização para pagamento em contingência | Contingência antes do fechamento               | Período e identificadores               | Permite totalização parcial                  | [1]   |
| S-1298 | Reabertura dos eventos periódicos                         | Reabrir movimento fechado                      | Competência                             | Permite retificação antes de novo fechamento | [1]   |
| S-1299 | Fechamento dos eventos periódicos                         | Encerrar movimento mensal                      | Competência e indicativos               | Gera totalização final                       | [1]   |

## Source Index

| Marker | Primary source                                                                                                 |
| ------ | -------------------------------------------------------------------------------------------------------------- |
| [1]    | https://www.gov.br/esocial/pt-br/documentacao-tecnica/manuais/mos-s-1-3-consolidada-ate-a-no-s-1-3-08-2026.pdf |
