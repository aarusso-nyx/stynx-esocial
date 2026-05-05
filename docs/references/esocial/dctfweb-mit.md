---
scope: DCTFWeb, MIT, CSLL e substituição GFIP/SEFIP
version_pinned: DCTFWeb e MIT vigentes em 2026; MIT manual 1.0 de 14/02/2025
last_reviewed: 2026-05-03
primary_sources:
  - https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/declaracoes-e-demonstrativos/DCTFWeb
  - https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/declaracoes-e-demonstrativos/DCTFWeb/arquivos/manual-mit-1-0-14-02.pdf
  - https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/declaracoes-e-demonstrativos/DCTFWeb/arquivos/mit_leiaute_json_importacao_20-02-2025.pdf
  - https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/tributos/CSLL
  - https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/tributos/AdCSLL
---

# DCTFWeb e MIT

| Tema                    | Regra/escopo                                                                                       | Impacto operacional                                                                  | Fonte |
| ----------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----- |
| DCTFWeb                 | Declaração usada para confessar débitos de contribuições previdenciárias e outras entidades/fundos | Integrar totalizadores de folha e escrituração digital à declaração                  | [1]   |
| MIT                     | Módulo Integrado de Tributos possui manual e leiaute JSON oficial para importação                  | Gerar arquivo importável conforme leiaute publicado                                  | [2]   |
| Leiaute JSON MIT        | A Receita Federal publica leiaute JSON de importação para MIT                                      | Validar estrutura antes de submissão/importação                                      | [3]   |
| CSLL                    | Contribuição Social sobre o Lucro Líquido é tributo administrado pela Receita Federal              | Tratar CSLL como obrigação fiscal quando aplicável ao declarante                     | [4]   |
| Adicional CSLL          | Adicional da CSLL possui orientação tributária própria da Receita Federal                          | Separar rubricas/valores quando o layout exigir discriminação                        | [5]   |
| Substituição GFIP/SEFIP | DCTFWeb integra obrigações substitutivas no ambiente de escrituração digital                       | Não gerar obrigação legada como fonte primária quando a substituição estiver vigente | [1]   |

## Source Index

| Marker | Primary source                                                                                                                                                  |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [1]    | https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/declaracoes-e-demonstrativos/DCTFWeb                                                     |
| [2]    | https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/declaracoes-e-demonstrativos/DCTFWeb/arquivos/manual-mit-1-0-14-02.pdf                   |
| [3]    | https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/declaracoes-e-demonstrativos/DCTFWeb/arquivos/mit_leiaute_json_importacao_20-02-2025.pdf |
| [4]    | https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/tributos/CSLL                                                                            |
| [5]    | https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/tributos/AdCSLL                                                                          |
