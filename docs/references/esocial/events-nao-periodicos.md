---
scope: Eventos eSocial não periódicos
version_pinned: eSocial S-1.3, MOS consolidado até NO S-1.3 08/2026
last_reviewed: 2026-05-03
primary_sources:
  - https://www.gov.br/esocial/pt-br/documentacao-tecnica/manuais/mos-s-1-3-consolidada-ate-a-no-s-1-3-08-2026.pdf
---

# Eventos não periódicos

| Evento | Finalidade                                             | Quando emitir                                          | Campos-chave                                        | Regra prática                                     | Fonte |
| ------ | ------------------------------------------------------ | ------------------------------------------------------ | --------------------------------------------------- | ------------------------------------------------- | ----- |
| S-2200 | Cadastramento inicial/admissão/ingresso de trabalhador | Ingresso de empregado, servidor ou vínculo equivalente | CPF, matrícula, categoria, cargo, jornada, admissão | Base inicial do vínculo ativo                     | [1]   |
| S-2205 | Alteração de dados cadastrais do trabalhador           | Mudança cadastral sem alteração contratual             | Nome, endereço, dependentes, documentos             | Mantém histórico sem recriar vínculo              | [1]   |
| S-2206 | Alteração de contrato de trabalho/vínculo              | Mudança contratual ou funcional                        | Cargo, função, jornada, salário, local              | Exige vínculo já existente                        | [1]   |
| S-2210 | Comunicação de Acidente de Trabalho                    | Acidente ou doença ocupacional comunicável             | Data, tipo acidente, parte atingida, atestado       | Evento de SST com prazos próprios                 | [1]   |
| S-2220 | Monitoramento da saúde do trabalhador                  | ASO e exames ocupacionais                              | Tipo exame, médico, resultado, data                 | Compõe histórico de saúde ocupacional             | [1]   |
| S-2230 | Afastamento temporário                                 | Início, alteração ou término de afastamento            | Motivo, datas, informação previdenciária            | Afeta remuneração e obrigações periódicas         | [1]   |
| S-2231 | Cessão/exercício em outro órgão                        | Informação de cessão ou exercício externo              | Órgão cessionário, datas, ônus                      | Aplicável ao contexto de órgão público            | [1]   |
| S-2240 | Condições ambientais do trabalho                       | Exposição a agentes nocivos e ambiente                 | Ambiente, fatores de risco, EPIs/EPCs               | Base para eventos de SST e aposentadoria especial | [1]   |
| S-2250 | Aviso prévio                                           | Comunicação de aviso prévio trabalhista                | Tipo, data, cumprimento ou indenização              | Relaciona-se ao desligamento                      | [1]   |
| S-2260 | Convocação para trabalho intermitente                  | Convocação de intermitente                             | Período, local, remuneração                         | Aplicável a contrato intermitente                 | [1]   |
| S-2298 | Reintegração                                           | Retorno por decisão administrativa/judicial            | Data retorno, processo, efeitos                     | Reabre vínculo desligado                          | [1]   |
| S-2299 | Desligamento                                           | Encerramento de vínculo                                | Motivo, data, verbas rescisórias                    | Fecha vínculo e bases rescisórias                 | [1]   |
| S-2300 | Trabalhador sem vínculo/estatutário - início           | Início de TSVE ou categoria pública equivalente        | CPF, categoria, matrícula, início                   | Base para TSVE e agentes públicos sem vínculo CLT | [1]   |
| S-2306 | Alteração contratual de TSVE                           | Mudança em TSVE                                        | Categoria, função, remuneração, local               | Atualiza vínculo TSVE                             | [1]   |
| S-2399 | TSVE - término                                         | Encerramento de TSVE                                   | Data, motivo, verbas quando aplicável               | Fecha TSVE                                        | [1]   |
| S-2400 | Cadastro de beneficiário de ente público               | Cadastro inicial de beneficiário RPPS                  | CPF, dados pessoais, benefício                      | Base para eventos de benefício                    | [1]   |
| S-2405 | Alteração de cadastro de beneficiário                  | Mudança cadastral do beneficiário                      | Dados cadastrais e dependentes                      | Atualiza cadastro RPPS                            | [1]   |
| S-2410 | Cadastro de benefício previdenciário                   | Concessão de benefício RPPS                            | Número benefício, tipo, início                      | Base para pagamentos de benefício                 | [1]   |
| S-2416 | Alteração de benefício                                 | Alteração em benefício concedido                       | Dados do benefício e efeitos                        | Mantém histórico do benefício                     | [1]   |
| S-2418 | Reativação de benefício                                | Reativa benefício cessado/suspenso                     | Data e motivo de reativação                         | Retoma efeitos do benefício                       | [1]   |
| S-2420 | Término de benefício                                   | Cessação de benefício RPPS                             | Data e motivo de cessação                           | Fecha benefício                                   | [1]   |

## Source Index

| Marker | Primary source                                                                                                 |
| ------ | -------------------------------------------------------------------------------------------------------------- |
| [1]    | https://www.gov.br/esocial/pt-br/documentacao-tecnica/manuais/mos-s-1-3-consolidada-ate-a-no-s-1-3-08-2026.pdf |
