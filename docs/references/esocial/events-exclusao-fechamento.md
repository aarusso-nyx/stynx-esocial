---
scope: Exclusão, fechamento, reabertura e retransmissão eSocial
version_pinned: eSocial S-1.3, MOS consolidado até NO S-1.3 08/2026
last_reviewed: 2026-05-03
primary_sources:
  - https://www.gov.br/esocial/pt-br/documentacao-tecnica/manuais/mos-s-1-3-consolidada-ate-a-no-s-1-3-08-2026.pdf
---

# Exclusão, fechamento e retransmissão

| Tema          | Finalidade                                           | Quando usar                                        | Campos-chave                                       | Regra prática                                          | Fonte |
| ------------- | ---------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------ | ----- |
| S-3000        | Exclusão de eventos                                  | Exclui evento aceito quando o MOS permite exclusão | Identificador do evento a excluir e tipo do evento | Não substitui retificação quando retificação é a regra | [1]   |
| S-1298        | Reabertura                                           | Reabre movimento periódico fechado                 | Competência                                        | Necessário antes de retificar periódicos fechados      | [1]   |
| S-1299        | Fechamento                                           | Fecha a escrituração mensal                        | Competência e indicativos                          | Gera totalização final do movimento                    | [1]   |
| Retificação   | Retificação por reenvio com chave do evento original | Quando o evento aceita retificação                 | Identificação e dados corrigidos                   | Mantém histórico conforme regras do MOS                | [1]   |
| Retransmissão | Novo envio após falha de recepção/processamento      | Quando retorno indica erro corrigível              | Lote/evento e recibo quando houver                 | Deve observar retornos e status do serviço             | [1]   |

## Source Index

| Marker | Primary source                                                                                                 |
| ------ | -------------------------------------------------------------------------------------------------------------- |
| [1]    | https://www.gov.br/esocial/pt-br/documentacao-tecnica/manuais/mos-s-1-3-consolidada-ate-a-no-s-1-3-08-2026.pdf |
