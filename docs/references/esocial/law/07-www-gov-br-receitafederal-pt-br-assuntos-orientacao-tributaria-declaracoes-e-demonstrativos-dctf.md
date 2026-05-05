DCTFWeb
Declaração de Débitos e Créditos Tributários Federais

MIT
Módulo de Inclusão de Tributos

2025

Arquivo JSON de Importação:
Leiaute 1.0 (RETIFICADO - 20/02/2025)
DCTFWeb/MIT - JSON de Importação - Leiaute 1.0

PERÍODO DA APURAÇÃO

Campo Nível Tipo Descrição Obrigatório

PeriodoApuracao 1 Object Período da Apuração. Sim.

Mês da Apuração com 1 ou 2 dígitos.
MesApuracao 2 Number Sim.
Exemplo: 4

Ano da Apuração no formato AAAA.
AnoApuracao 2 Number Sim.
Exemplo: 2025

EVENTOS ESPECIAIS

Campo Nível Tipo Descrição Obrigatório

Lista dos eventos especiais da Apuração, informados em ordem
ListaEventosEspeciais 1 Array Não.
cronológica e sem repetição do dia. Quantidade máxima: 5.

Sim, ao menos uma ocorrência, se houver o array
(sem nome) 2 Object Agrupa os dados do evento especial. Pode ocorrer mais de uma vez.
ListaEventosEspeciais.

Número de identificação do evento especial com 1 dígito. Número único
Sim, para cada ocorrência de objeto em
IdEvento 3 Number e sequencial: de 1 a 5.
ListaEventosEspeciais.
Exemplo: 1

Dia do evento especial com 1 ou 2 dígitos. Sim, para cada ocorrência de objeto em
DiaEvento 3 Number
Exemplo: 13 ListaEventosEspeciais.

Tipo do evento especial, sendo:
1: Extinção;
2: Fusão;
Sim, para cada ocorrência de objeto em
TipoEvento 3 Number 3: Cisão Total;
ListaEventosEspeciais.
4: Cisão Parcial;
5: Incorporação (incorporada);
6: Incorporação (incorporadora).

20/02/2025 2 de 10
DCTFWeb/MIT - JSON de Importação - Leiaute 1.0

DADOS INICIAIS

Campo Nível Tipo Descrição Obrigatório

DadosIniciais 1 Object Dados iniciais da Apuração. Sim.

Indicador de Apuração sem movimento, sendo:
SemMovimento 2 Boolean false: Não; Sim.
true: Sim.

Qualificação da pessoa jurídica, sendo:
1: PJ em geral;
2: Agência de Fomento, Banco ou outra PJ de que trata o § 1° do art. 22
da Lei n° 8.212/1991;
3: Cooperativa de Crédito;
4: Sociedade Corretora de Seguros;
5: Sociedade Seguradora e de Capitalização ou Entidade Aberta de
Previdência Complementar com fins lucrativos;
6: Entidade Fechada de Previdência Complementar ou Entidade Aberta
QualificacaoPj 2 Number Sim.
de Previdência Complementar sem fins lucrativos;
7: Sociedade Cooperativa;
8: Sociedade Cooperativa de Produção Agropecuária ou de Consumo;
9: Autarquia ou Fundação Pública;
10: Empresa Pública, Sociedade de Economia Mista ou PJ de que trata o
inc. III do art. 34 da Lei n° 10.833/2003;
11: Estado, Distrito Federal, Município ou Órgão Público da
Administração Direta;
12: Mais de uma qualificação durante o mês.

20/02/2025 3 de 10
DCTFWeb/MIT - JSON de Importação - Leiaute 1.0

Forma de tributação do lucro, sendo:
1: Real Anual;
2: Real Trimestral;
3: Presumido; Sim, se SemMovimento for “false” e se
TributacaoLucro 2 Number
4: Arbitrado; QualificacaoPj for diferente de [11].
5: Imune do IRPJ;
6: Isenta do IRPJ;
7: Optante pelo Simples Nacional.

Critério de reconhecimento das variações monetárias, sendo:
1: Regime de Caixa;
VariacoesMonetarias 2 Number Sim, se SemMovimento for “false”.
2: Regime de Competência;
3: Regime de Caixa - Elevada oscilação da taxa de câmbio.

Sim, se SemMovimento for “false” e (se
Regime de apuração do PIS/Pasep e/ou da Cofins, sendo: QualificacaoPj for [9] ou (se QualificacaoPj for [1]
1: Não-cumulativa; e se TributacaoLucro for [1, 2, 5 ou 6]) ou (se
RegimePisCofins 2 Number 2: Cumulativa; QualificacaoPj for [4, 8 ou 10] e se
3: Não-cumulativa e Cumulativa; TributacaoLucro for diferente de [3, 4, 5 e 7]) ou
4: Não se aplica. (se QualificacaoPj for [12] e se TributacaoLucro
for diferente de [7])).

ResponsavelApuracao 2 Object Dados do responsável pelo preenchimento da Apuração. Sim.

String CPF do responsável com 11 dígitos.
CpfResponsavel 3 Sim.
(11) Exemplo: "12345678900"

TelResponsavel 3 Object Dados do telefone do responsável. Não.

String DDD do telefone do responsável com 2 dígitos.
Ddd 4 Sim, se houver o objeto TelResponsavel.
(2) Exemplo: “31”

String Número do telefone do responsável com 8 ou 9 dígitos.
NumTelefone 4 Sim, se houver o objeto TelResponsavel.
(9) Exemplo: “999991111”

String E-mail do responsável, com tamanho de 5 a 60 caracteres.
EmailResponsavel 3 Não.
(60) Exemplo: “responsavel@mail.com”

20/02/2025 4 de 10
DCTFWeb/MIT - JSON de Importação - Leiaute 1.0

Dados do registro profissional do responsável no Conselho Regional de
RegistroCrc 3 Object Não.
Contabilidade.

Sigla da unidade federativa do registro provisório ou definitivo originário
String
UfRegistro 4 do responsável, com 2 caracteres. Sim, se houver o objeto RegistroCrc.
(2)
Exemplo: “SP”

Número do registro profissional do responsável, podendo incluir sufixo
no caso de registro transferido ou secundário, com tamanho de 6 a 11
String
NumRegistro 4 caracteres. Sim, se houver o objeto RegistroCrc.
(11)
Exemplos: “123456”, “SP123456”, “123456P3”, “123456TMG”,
“SP123456P3” e “123456P3TMG”

DÉBITOS

Campo Nível Tipo Descrição Obrigatório

Dados dos débitos da Apuração, discriminados por grupo de tributo, os
Debitos 1 Object quais devem ser informados na ordem de apresentação desta tabela. Na Sim, se SemMovimento for “false”.
Apuração com movimento, deve ser informado ao menos um débito.

Sim, se TributacaoLucro for [1], se não houver
Indicador de que a PJ levantou balanço/balancete de suspensão ou
objeto na ListaEventosEspeciais com TipoEvento
redução no mês, sendo:
BalancoLucroReal 2 Boolean igual a [1, 2, 3 ou 5] e se não houver objeto na
false: Não;
ListaEventosEspeciais com TipoEvento igual a [4
true: Sim.
ou 6] e DiaEvento igual ao último dia do mês.

Não, mas pode existir somente se houver o objeto
Irpj 2 Object Dados dos débitos do grupo IRPJ.
Debitos e se QualificacaoPj for diferente de [11].

Não, mas pode existir somente se houver o objeto
Debitos, se QualificacaoPj for diferente de [11] e
Csll 2 Object Dados dos débitos do grupo CSLL. (se TributacaoLucro for diferente de [7] ou se
MesApuracao for [3] ou (se MesApuracao for [1
ou 2] e se houver o array ListaEventosEspeciais)).

20/02/2025 5 de 10
DCTFWeb/MIT - JSON de Importação - Leiaute 1.0

Não, mas pode existir somente se houver o objeto
Irrf 2 Object Dados dos débitos do grupo IRRF. Debitos, se QualificacaoPj for diferente de [9 e 11]
e se TributacaoLucro for diferente de [7].

Não, mas pode existir somente se houver o objeto
Ipi 2 Object Dados dos débitos do grupo IPI. Debitos, se QualificacaoPj for diferente de [2, 3, 4,
5 e 6] e se TributacaoLucro for diferente de [7].

Não, mas pode existir somente se houver o objeto
Iof 2 Object Dados dos débitos do grupo IOF.
Debitos.

Não, mas pode existir somente se houver o objeto
PisPasep 2 Object Dados dos débitos do grupo PIS/PASEP.
Debitos.

Não, mas pode existir somente se houver o objeto
Cofins 2 Object Dados dos débitos do grupo COFINS.
Debitos.

Não, mas pode existir somente se houver o objeto
ContribuicoesDiversas 2 Object Dados dos débitos do grupo CONTRIBUIÇÕES DIVERSAS.
Debitos.

Não, mas pode existir somente se houver o objeto
Cpss 2 Object Dados dos débitos do grupo CPSS. Debitos, se QualificacaoPj for [2, 9, 11 ou 12] e se
TributacaoLucro for diferente de [7].

Não, mas pode existir somente se houver o objeto
RetPagamentoUnificado 2 Object Dados dos débitos do grupo RET/PAGAMENTO UNIFICADO. Debitos, se QualificacaoPj for [1, 7, 10 ou 12] e se
TributacaoLucro for diferente de [7].

Sim, para os objetos Irpj, Csll, Irrf, Ipi, Iof,
PisPasep, Cofins, ContribuicoesDiversas, Cpss e
Lista dos débitos do grupo de tributo, exceto aqueles cujo fato gerador
ListaDebitos 3 Array RetPagamentoUnificado.
ocorreu após a data do último evento especial do mês.
Exceção: opcional se houver o array
ListaDebitosAposEvento no mesmo objeto.

20/02/2025 6 de 10
DCTFWeb/MIT - JSON de Importação - Leiaute 1.0

Não, mas pode existir para os objetos Irpj, Csll,
Irrf, Ipi, Iof, PisPasep, Cofins,
ContribuicoesDiversas, Cpss e
RetPagamentoUnificado, se houver o array
Lista dos débitos do grupo de tributo cujo fato gerador ocorreu após a
ListaDebitosAposEvento 3 Array ListaEventosEspeciais, se não houver objeto na
data do último evento especial do mês.
ListaEventosEspeciais com TipoEvento igual a [1,
2, 3 ou 5] e se não houver objeto na
ListaEventosEspeciais com TipoEvento igual a [4
ou 6] e DiaEvento igual ao último dia do mês.

Sim, ao menos uma ocorrência, para cada
(sem nome) 4 Object Agrupa os dados do débito. Pode ocorrer mais de uma vez. ocorrência dos arrays ListaDebitos e
ListaDebitosAposEvento.

Número de identificação do débito com 1 ou mais dígitos. Número único
e sequencial: de 1 até o valor correspondente à quantidade de débitos Sim, para cada ocorrência de objeto em
IdDebito 5 Number
da Apuração. ListaDebitos e em ListaDebitosAposEvento.
Exemplo: 1

Número de identificação do evento especial até cuja data foram
Sim, para cada ocorrência de objeto em
considerados os fatos geradores para a apuração do débito informado.
IdEventoDebito 5 Number ListaDebitos, se houver o array
Faz referência a um dos eventos da Apuração: valores de IdEvento.
ListaEventosEspeciais.
Exemplo: 1

String Código de receita do débito com 6 dígitos. Sim, para cada ocorrência de objeto em
CodigoDebito 5
(6) Exemplo: "022012" ListaDebitos e em ListaDebitosAposEvento.

Período de apuração do débito com 1 ou 2 dígitos, sendo: Sim, para cada ocorrência de objeto em
1 a 31: para periodicidade diária; ListaDebitos e em ListaDebitosAposEvento, se
PaDebito 5 Number
1 a 3: para periodicidade decendial; periodicidade do débito for diária, decendial ou
1 ou 2: para periodicidade quinzenal. quinzenal.

Ano do período de apuração do débito postergado no formato AAAA, Sim, para os objetos Irpj e Csll, para cada
podendo ser o mesmo ano da Apuração (apenas para débitos com ocorrência de objeto em ListaDebitos e em
AnoPostergado 5 Number
periodicidade trimestral) ou algum dos cinco anos anteriores. ListaDebitosAposEvento, se código do débito tiver
Exemplo: 2020 final “10”.

20/02/2025 7 de 10
DCTFWeb/MIT - JSON de Importação - Leiaute 1.0

Trimestre do período de apuração do débito postergado, com 1 dígito. Sim, para cada ocorrência de objeto em
Deve ser anterior ao trimestre do mês da Apuração. ListaDebitos e em ListaDebitosAposEvento, se
TrimPostergado 5 Number
Exemplo: 2 houver o campo AnoPostergado e se
periodicidade do débito for trimestral.

Sim, para os objetos Irpj e Csll, para cada
Ano de apuração do débito no formato AAAA, podendo ser o mesmo ano
ocorrência de objeto em ListaDebitos, se
da Apuração ou o ano precedente. Aplica-se à hipótese em que os
MesApuracao for [1, 2 ou 3], se TributacaoLucro
AnoDebito 5 Number débitos relativos ao ajuste anual do IRPJ e da CSLL de um determinado
for [1], se IdEventoDebito for [1], se periodicidade
ano podem ser declarados juntamente com os do ano anterior.
do débito for anual e se código do débito não
Exemplo: 2024
tiver final “10”.

Últimos 6 dígitos (número de ordem + DV) do CNPJ do estabelecimento Sim, para o objeto Ipi ou se código do débito for
String
CnpjEstabelecimento 5 do débito. do grupo CIDE, para cada ocorrência de objeto em
(6)
Exemplo: "000100" ListaDebitos e em ListaDebitosAposEvento.

Últimos 6 dígitos (número de ordem + DV) do CNPJ da incorporação, para Sim, para o objeto RetPagamentoUnificado, para
String débitos de incorporação, ou CNPJ completo da incorporação com 14 cada ocorrência de objeto em ListaDebitos e em
CnpjIncorporacao 5
(14) dígitos, para débitos de SCP do grupo RET/PAGAMENTO UNIFICADO. ListaDebitosAposEvento, se código do débito for
Exemplos: “000100” e "12345678000195" de incorporação ou de SCP.

Sim, para os objetos Irpj, Csll, PisPasep e Cofins,
para cada ocorrência de objeto em ListaDebitos e
String CNPJ da SCP a que corresponde o débito, com 14 dígitos.
CnpjScp 5 em ListaDebitosAposEvento, se código do débito
(14) Exemplo: "12345678000195"
for de SCP e se período de apuração do débito for
posterior a 2024.

Sim, para o objeto Iof, para cada ocorrência de
String Código IBGE do município de origem do ouro, com 7 dígitos. objeto em ListaDebitos e em
CodigoMunicipioOuro 5
(7) Exemplo: “3550308” ListaDebitosAposEvento, se CodigoDebito for
“402802”.

Valor do débito apurado com até 2 casas decimais. Sim, para cada ocorrência de objeto em
ValorDebito 5 Number
Exemplo: 777.55 ListaDebitos e em ListaDebitosAposEvento.

20/02/2025 8 de 10
DCTFWeb/MIT - JSON de Importação - Leiaute 1.0

SUSPENSÕES

Campo Nível Tipo Descrição Obrigatório

Não, mas pode existir somente se SemMovimento
ListaSuspensoes 1 Array Lista das suspensões da Apuração. for “false” e se não houver o array
ListaEventosEspeciais.

Sim, ao menos uma ocorrência, se houver o array
(sem nome) 2 Object Agrupa os dados da suspensão. Pode ocorrer mais de uma vez.
ListaSuspensoes.

Tipo da suspensão, sendo:
Sim, para cada ocorrência de objeto em
TipoSuspensao 3 Number 1: administrativa;
ListaSuspensoes.
2: judicial.

Motivo da suspensão judicial, sendo:
1: Liminar em Mandado de Segurança;
2: Depósito judicial do montante integral;
4: Antecipação de tutela;
5: Liminar em Medida Cautelar;
8: Sentença em Mandado de Segurança favorável ao contribuinte;
Sim, para cada ocorrência de objeto em
MotivoSuspensao 3 Number 9: Sentença em Ação Ordinária favorável ao contribuinte e confirmada
ListaSuspensoes, se TipoSuspensao for [2].
pelo TRF;
10: Acórdão do TRF favorável ao contribuinte;
11: Acórdão do STJ em Recurso Especial favorável ao contribuinte;
12: Acórdão do STF em Recurso Extraordinário favorável ao contribuinte;
13: Sentença de 1ª Instância não transitada em julgado com efeito
suspensivo.

Indicador de suspensão judicial com depósito, sendo: Sim, para cada ocorrência de objeto em
ComDeposito 3 Boolean false: Não; ListaSuspensoes, se MotivoSuspensao for
true: Sim. diferente de [2].

Número do processo judicial ou administrativo, com 20 ou 17 dígitos
String Sim, para cada ocorrência de objeto em
NumeroProcesso 3 respectivamente.
(20) ListaSuspensoes.
Exemplos: "98765431220251017777" e “12345987654202450”

20/02/2025 9 de 10
DCTFWeb/MIT - JSON de Importação - Leiaute 1.0

Indicador de que o processo judicial é de terceiro, sendo:
Sim, para cada ocorrência de objeto em
ProcessoTerceiro 3 Boolean false: Não (contribuinte é o autor);
ListaSuspensoes, se TipoSuspensao for [2].
true: Sim.

Data da decisão judicial no formato AAAAMMDD. Sim, para cada ocorrência de objeto em
DataDecisao 3 Number
Exemplo: 20240920 ListaSuspensoes, se TipoSuspensao for [2].

Número da Vara Judiciaria onde tramita o processo, com tamanho de 1 a
Sim, para cada ocorrência de objeto em
VaraJudiciaria 3 Number 4 dígitos.
ListaSuspensoes, se TipoSuspensao for [2].
Exemplo: 1

Código IBGE do município sede da vara judiciária onde tramita o
String Sim, para cada ocorrência de objeto em
CodigoMunicipioSj 3 processo, com 7 dígitos.
(7) ListaSuspensoes, se TipoSuspensao for [2].
Exemplo: "5002704"

Sim, para cada ocorrência de objeto em
ListaDebitosSuspensos 3 Array Lista dos débitos objeto da suspensão.
ListaSuspensoes.

Sim, ao menos uma ocorrência, para cada
(sem nome) 4 Object Agrupa os dados do débito suspenso. Pode ocorrer mais de uma vez.
ocorrência do array ListaDebitosSuspensos.

Número de identificação do débito suspenso. Faz referência a um dos
Sim, para cada ocorrência de objeto em
IdDebitoSuspenso 5 Number débitos da Apuração: valores de IdDebito.
ListaDebitosSuspensos.
Exemplo: 1

Valor suspenso do débito com até 2 casas decimais. Sim, para cada ocorrência de objeto em
ValorSuspenso 5 Number
Exemplo: 1000.00 ListaDebitosSuspensos.

REGRA DE FORMAÇÃO DO NOME DO ARQUIVO JSON

CNPJ raiz do contribuinte período da Apuração
+ “-MIT-” + + extensão
(8 dígitos) (formato AAAAMM)

Exemplo: 87654321-MIT-202504.json

20/02/2025 10 de 10
