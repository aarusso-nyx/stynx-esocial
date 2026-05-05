---
scope: Eventos eSocial totalizadores
version_pinned: eSocial S-1.3, MOS consolidado até NO S-1.3 08/2026
last_reviewed: 2026-05-03
primary_sources:
  - https://www.gov.br/esocial/pt-br/documentacao-tecnica/manuais/mos-s-1-3-consolidada-ate-a-no-s-1-3-08-2026.pdf
---

# Eventos totalizadores

| Evento | Finalidade                                            | Quando retorna                           | Campos-chave                            | Uso de conferência                     | Fonte |
| ------ | ----------------------------------------------------- | ---------------------------------------- | --------------------------------------- | -------------------------------------- | ----- |
| S-5001 | Informações das contribuições sociais por trabalhador | Retorno do processamento de remuneração  | Bases e contribuições por CPF/vínculo   | Usado para conferência de contribuição | [1]   |
| S-5002 | Imposto de renda retido na fonte por trabalhador      | Retorno de processamento de pagamentos   | Bases, deduções e IRRF por beneficiário | Usado para conferência de IRRF         | [1]   |
| S-5003 | FGTS por trabalhador                                  | Retorno de bases de FGTS                 | Base, depósito, vínculo                 | Usado para conferência de FGTS         | [1]   |
| S-5011 | Contribuições sociais consolidadas do contribuinte    | Totalização por contribuinte/competência | Bases e débitos consolidados            | Usado para DCTFWeb/eSocial fiscal      | [1]   |
| S-5012 | IRRF consolidado do contribuinte                      | Totalização de IRRF                      | Bases e valores consolidados            | Usado para conferência fiscal          | [1]   |
| S-5013 | FGTS consolidado do contribuinte                      | Totalização de FGTS                      | Bases e valores consolidados            | Usado para recolhimento FGTS           | [1]   |

## Source Index

| Marker | Primary source                                                                                                 |
| ------ | -------------------------------------------------------------------------------------------------------------- |
| [1]    | https://www.gov.br/esocial/pt-br/documentacao-tecnica/manuais/mos-s-1-3-consolidada-ate-a-no-s-1-3-08-2026.pdf |
