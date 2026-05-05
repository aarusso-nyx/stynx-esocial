---
scope: Eventos eSocial de tabela
version_pinned: eSocial S-1.3, MOS consolidado até NO S-1.3 08/2026
last_reviewed: 2026-05-03
primary_sources:
  - https://www.gov.br/esocial/pt-br/documentacao-tecnica/manuais/mos-s-1-3-consolidada-ate-a-no-s-1-3-08-2026.pdf
  - https://www.gov.br/esocial/pt-br/documentacao-tecnica/leiautes-esocial-versao-s-1-3-nt-06-2026/tabelas.html
---

# Eventos de tabela

| Evento | Finalidade                                                       | Quando emitir                                                                       | Campos-chave                                                                    | Regra prática                                                   | Fonte |
| ------ | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------- | ----- |
| S-1000 | Informações do empregador/contribuinte/órgão público             | Emitido no início da escrituração e quando houver alteração cadastral do declarante | Identificação, classificação tributária, contato, software house, dados do ente | Obrigatório antes de eventos dependentes do empregador          | [1]   |
| S-1005 | Tabela de estabelecimentos, obras ou unidades de órgãos públicos | Emitido para cada estabelecimento, obra ou unidade do órgão                         | Identificação, CNAE/FPAS quando aplicável, dados de contratação                 | Usado como referência por vínculos, remuneração e lotações      | [1]   |
| S-1010 | Tabela de rubricas                                               | Emitido antes de eventos periódicos que usam rubricas                               | Código, natureza, incidências previdenciárias, FGTS e IRRF                      | Incidências devem seguir tabelas oficiais e natureza da rubrica | [1]   |
| S-1020 | Tabela de lotações tributárias                                   | Emitido para lotações tributárias e obras/unidades com apuração                     | Código de lotação, tipo, FPAS/terceiros quando aplicável                        | Referenciado por remuneração e bases tributárias                | [1]   |
| S-1030 | Tabela de cargos/empregos públicos                               | Emitido para cargos efetivos, empregos e carreiras                                  | Código, CBO, nome, lei de criação quando aplicável                              | Referenciado nos eventos de vínculo e alterações                | [1]   |
| S-1035 | Tabela de carreiras públicas                                     | Emitido quando o órgão usa estrutura de carreira                                    | Código, nome e estrutura da carreira                                            | Referenciado por cargos quando houver carreira                  | [1]   |
| S-1040 | Tabela de funções/cargos em comissão                             | Emitido para função de confiança ou cargo em comissão                               | Código, CBO, nome e natureza                                                    | Referenciado por eventos de vínculo e alteração                 | [1]   |
| S-1050 | Tabela de horários/turnos de trabalho                            | Emitido para jornadas e turnos usados no vínculo                                    | Código, horários, duração, intervalo                                            | Referenciado por eventos contratuais quando aplicável           | [1]   |
| S-1060 | Tabela de ambientes de trabalho                                  | Emitido para ambientes relacionados a SST                                           | Código, local, descrição do ambiente e fatores de risco                         | Base para eventos de exposição e SST                            | [1]   |
| S-1070 | Tabela de processos administrativos/judiciais                    | Emitido quando há processo que afeta apuração                                       | Número, tipo, matéria e decisão                                                 | Referenciado por eventos fiscais e tributários                  | [1]   |

## Source Index

| Marker | Primary source                                                                                                 |
| ------ | -------------------------------------------------------------------------------------------------------------- |
| [1]    | https://www.gov.br/esocial/pt-br/documentacao-tecnica/manuais/mos-s-1-3-consolidada-ate-a-no-s-1-3-08-2026.pdf |
| [2]    | https://www.gov.br/esocial/pt-br/documentacao-tecnica/leiautes-esocial-versao-s-1-3-nt-06-2026/tabelas.html    |
