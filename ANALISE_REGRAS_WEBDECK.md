# Análise de Engenharia Reversa — relatorio_regras.csv (WebDeck)

Documento de análise. Nenhuma migration, alteração em `models.py`, backend
ou frontend foi feita a partir deste documento — é investigação pura, para
subsidiar uma decisão de arquitetura posterior.

Fontes lidas por completo: `relatorio_regras.csv` (análise linha a linha via
awk/grep sobre as 5.140 linhas, não amostragem), `ONBOARDING_DESENVOLVEDOR.txt`,
`analise_sistema_antifraude.txt`. Leitura direcionada de
`DOCUMENTACAO_TECNICA.txt`, `backend/app/models.py`,
`backend/app/services/antifraude.py`, `backend/app/services/storm_adapter.py`,
`backend/app/services/hope_adapter.py`, `backend/app/routers/regras.py`,
`backend/app/routers/corretores.py`, `backend/app/routers/grupos.py`,
`backend/app/routers/propostas.py`, `backend/app/services/auditoria.py`, mais
consulta read-only ao PostgreSQL local (contagens de linhas, sem alterações).

---

## 1. Resumo executivo

O CSV **não é uma tabela de condições de regra antifraude**. É um **log
histórico (append-only) de matrícula de corretores em "esteiras/tabelas
comerciais"** do sistema legado WebDeck — o mesmo conceito de "tabela
comercial" usado no mercado de crédito consignado, onde o nome da tabela
("C6 05 MIL INSS - ESTEIRA NORMAL") codifica banco, limite de valor, convênio
e fila de processamento como texto livre, não como colunas estruturadas.

Isso bate com uma peça que **já existe** no modelo de dados do Antifraude
Unica: `GrupoCorretor` (tabela `grupos_corretores`, já tem coluna
`limite_valor`) e `Corretor.grupo_id`. Só que hoje essas colunas existem mas
**não são lidas por nada** — nem o motor antifraude, nem o sync do
Hope/Storm popula `Proposta.corretor_id`. São peças órfãs do modelo.

As tabelas relacionais `regra_banco/regra_convenio/regra_produto/regra_grupo/
regra_corretor/regra_uf` cogitadas inicialmente **não devem ser construídas**:
banco e convênio só aparecem embutidos no nome em ~30-40% das linhas, não
como dado estruturado — não há granularidade real para sustentar um
cruzamento relacional desses 6 eixos.

---

## 2. Análise do CSV (dados, não interpretação)

Estrutura real: `"Nome Regra";"Nome Grupo";"Codigo Corretor";"Nome Corretor";"Data de entrada"`
— 5.140 linhas de dados, 49 valores únicos de "Nome Regra".

**Volume por regra é extremamente desigual** — de 982 linhas (`HAPPY`,
`"NORMAL FACTA"`) a 1 linha (`"9327 "`, um corretor específico). A maioria
das "regras" são baldes/faixas compartilhadas por centenas de corretores,
mas pelo menos 2 (`"9327 "`, `"61622 - IDEAL CONSIG SERVICOS LTDA"`) são
overrides nomeados por um único corretor específico — não faixas genéricas.

**Padrão de valor embutido no nome**: 36 dos 49 nomes seguem o padrão
`\d+\s*MIL` (ex: "25 MIL" = R$25.000). Os 13 restantes não têm valor
numérico: `BLACKLIST`, `FGTS BLACKLIST`, `BANCO FACTA FGTS`, `CONVENIOS`,
`HAPPY`, `LIVRE`, `LIVRE PARA PORTABILIDADE`, `LIVRE FACTA (CLT E FGTS)`,
`NORMAL FACTA`, `FORCAS ARMADAS`, `31093 - LIVRE FACTA OC`,
`61622 - IDEAL CONSIG SERVICOS LTDA`, `"9327 "`.

**"Nome Grupo" (quando ≠ "-") majoritariamente repete "Nome Regra"** — só
diverge em dois casos: (a) `DINAMICA 20 MIL` se especializa por banco no
grupo (`BMG`, `C6`, `DAYCOVAL`, `FACTA`, `OLE`, `PAN`); (b) grupos-guarda-chuva
`ESTEIRA NORMAL` (recebe `HAPPY` e `NORMAL FACTA`) e `BLACKLIST` (recebe
`BLACKLIST`, `FGTS BLACKLIST`, `BANCO FACTA FGTS`).

**Datas concentradas em picos de lote**, não distribuídas uniformemente:
1.887 linhas no mesmo dia (08/01/2026), 563 em outro (16/10/2025), etc. —
típico de reprocessamento/re-registro em massa pelo WebDeck, não de
cadastro manual linha a linha.

**1.177 códigos de corretor aparecem em mais de uma linha.** Caso
investigado em detalhe — corretor 850 (RODRIGO IGNACIO MARIN):
```
16/10/2025  "C6 05 MIL INSS - ESTEIRA NORMAL"                 (grupo: -)
08/12/2025  "FGTS BLACKLIST" / "BANCO FACTA FGTS" / BLACKLIST (grupo: BLACKLIST, mesmo timestamp)
08/01/2026  "NORMAL FACTA" / HAPPY                             (grupo: ESTEIRA NORMAL, mesmo timestamp)
```
Ele entra no grupo BLACKLIST em dezembro/2025 e **volta a ser matriculado em
esteiras normais em janeiro/2026**. Isso só faz sentido se o CSV for um
**histórico cumulativo de eventos de matrícula**, não um snapshot do estado
atual — e sugere que "BLACKLIST" aqui é uma restrição **pontual/escopada**
(provavelmente ligada a FGTS+Facta especificamente), não um banimento
permanente e global do corretor.

**Banco de dados atual está vazio**: `corretores`, `grupos_corretores` e
`regras_antifraude` têm 0 linhas no Postgres local — qualquer importação
futura seria greenfield, sem dado existente para reconciliar.

**Achado crítico fora do CSV**: nem `hope_adapter.py` nem `storm_adapter.py`
extraem qualquer código de corretor do payload de Hope/Storm (confirmado por
leitura completa — zero menções a "corretor" em ambos os arquivos).
`Proposta.corretor_id` **nunca é preenchido hoje** pelo sync. Isso significa
que, mesmo importando o CSV perfeitamente, o motor não teria como ligar uma
proposta real recebida de Hope/Storm ao corretor certo — falta esse elo.

**Achado crítico #2**: a palavra "Facta" não aparece em **nenhum** lugar do
código ou da documentação do sistema novo fora do CSV (grep completo, zero
hits). `rpa/playwright/bancos/` só tem um arquivo de exemplo
(`exemplo_banco.py`), nenhum banco real implementado. Facta é um banco do
WebDeck **sem nenhuma integração** (API ou RPA) no Antifraude Unica hoje.

---

## 3. Interpretação provável do WebDeck

| Conceito cogitado | Existe como campo estruturado no CSV? | Onde realmente mora a informação |
|---|---|---|
| Nome Regra | Sim (coluna 1) | Nome livre da "tabela comercial"/esteira |
| Tipo | **Não** | Inferido do texto: número presente = faixa de limite; `BLACKLIST`=restrição; `LIVRE`=sem restrição |
| Valor | **Não** (embutido em texto) | Regex `\d+\s*MIL` em 36/49 nomes; ausente nos outros 13 |
| Corretor | Sim (colunas 3-4) | Código + nome, direto |
| Grupo | Sim (coluna 2, quase sempre redundante) | Só diverge para especializar banco (DINAMICA 20 MIL) ou agrupar categorias (ESTEIRA NORMAL, BLACKLIST) |
| Banco | **Não**, exceto embutido | Só explícito em alguns nomes/grupos (C6, BMG, FACTA, DAYCOVAL, OLE, PAN); ausente em >60% das linhas (ex: HAPPY, DINAMICA 06 MIL não têm banco identificável) |
| Convênio | **Não**, exceto embutido | INSS/FGTS/SIAPE/FORCAS ARMADAS aparecem em alguns nomes, não como coluna |
| Produto | **Não**, exceto embutido | `CARTAO` (cartão consignado) vs. implícito "empréstimo" no resto |

Conclusão: o WebDeck não modela "regra antifraude" no sentido do sistema
novo — modela **elegibilidade comercial do corretor por tabela/esteira**,
onde o nome da esteira é a unidade atômica de negócio (definida pelo time
comercial/parceiro bancário), não uma composição de condições.

---

## 4. Padrões, agrupamentos e hierarquia

- **Faixas de valor `DINAMICA N MIL`** formam uma hierarquia clara de 33
  degraus (05, 06, 07, 08, 10, 12, 14, 15, 16, 18, 20, 21, 22, 23, 24, 25,
  29, 30, 35, 36, 40, 50, 60, 70, 80 mil), incluindo variantes compostas
  (`"DINAMICA 25 MIL INSS e 30 MIL OC"` = limite diferente por convênio
  dentro da mesma faixa).
- **Categorias sem valor** formam 3 grupos-guarda-chuva reais:
  `ESTEIRA NORMAL` (HAPPY + NORMAL FACTA — fila padrão sem faixa de valor
  definida), `BLACKLIST` (3 variantes, sempre ligadas a FGTS/Facta nos casos
  investigados), e miscelânea sem grupo (`LIVRE`, `CONVENIOS`,
  `FORCAS ARMADAS`, `LIVRE PARA PORTABILIDADE`).
- **Overrides individuais** (`"9327 "`, `"61622 - ..."`) — corretor
  específico tratado como sua própria "regra", fora da hierarquia de faixas.
- Confirma-se em `analise_sistema_antifraude.txt` (linha 32) que "valor da
  proposta vs. limite do corretor" já era um critério de decisão **previsto**
  desde a concepção do motor — o CSV é plausivelmente a fonte de dados para
  calibrar exatamente esse critério, hoje não implementado.

---

## 5. Cruzamento com o motor antifraude atual

`MotorAntifraude` (`backend/app/services/antifraude.py`) tem 6 tipos de
regra (`BLACKLIST`, `VALOR_MAXIMO`, `BANCO_CONVENIO`, `UF_BLOQUEADA`,
`SCORE_RISCO`, `LIMITE_DIARIO`), todos avaliando `RegraAntifraude.parametros`
(JSON estático). **Nenhum deles lê `Corretor.limite_valor_diario` ou
`GrupoCorretor.limite_valor`** — confirmado por leitura completa do arquivo
(285 linhas, sem nenhuma referência a essas colunas). São colunas mortas no
schema atual.

**O que faz sentido integrar, eventualmente:**
- Um novo tipo de regra que valida `proposta.valor` contra o
  `limite_valor` do grupo/esteira do corretor — isso é literalmente o
  "VALOR_MAXIMO" que já existe, só que **dinâmico por corretor** em vez de
  estático por regra. Fecha a lacuna identificada em
  `analise_sistema_antifraude.txt` linha 32.
- Cadastro de `GrupoCorretor` + `Corretor` a partir do CSV, como dado
  operacional (não como regra booleana).

**O que NÃO faz sentido integrar (por ora):**
- Bloqueio automático por "estar no grupo BLACKLIST do CSV" — o caso do
  corretor 850 mostra que essa marca é escopada/temporal, não um banimento
  permanente. Tratar como bloqueio automático arriscaria bloquear
  corretores ativos por má-leitura do dado histórico.
- Qualquer regra específica de banco `FACTA` — banco sem nenhuma integração
  no sistema novo; a regra nunca dispararia com dado real (não há
  `Proposta.banco == "FACTA"` possível hoje).
- Tabelas relacionais `regra_banco/regra_convenio/regra_produto/regra_uf` —
  o dado não tem granularidade estruturada para sustentar isso; seria
  modelar uma precisão que a fonte não tem.
- Qualquer regra automática usando os dados importados **antes** de
  `Proposta.corretor_id` ser de fato populado no sync (hoje sempre NULL) —
  a regra existiria mas nunca disparia, dando falsa sensação de cobertura.

`analise_sistema_antifraude.txt` (seção 8) já recomenda explicitamente
**"Deploy gradual de regras: nova regra em modo shadow antes de produção
(registra a decisão mas não bloqueia, permitindo validação)"** — esse é o
caminho indicado para esses dados de origem incerta.

---

## 6. O que deve virar o quê

| Dado do CSV | Destino recomendado | Por quê |
|---|---|---|
| Nome Regra + Nome Grupo (quando têm valor `N MIL`) | Cadastro operacional: `GrupoCorretor.nome` + `GrupoCorretor.limite_valor` | É dado de elegibilidade comercial, não uma condição booleana de fraude |
| Codigo/Nome Corretor + vínculo ao grupo | Cadastro operacional: `Corretor` (upsert por `codigo_externo`) + `Corretor.grupo_id` (ou associação N:N — ver seção 9) | Mesma razão |
| Faixa de valor do grupo do corretor vs. `proposta.valor` | Novo tipo de regra antifraude, em modo shadow (não bloqueante) inicialmente | Fecha a lacuna real do motor, mas com dado de origem/semântica não 100% confirmada — shadow evita dano |
| Grupos `BLACKLIST`/`FGTS BLACKLIST`/`BANCO FACTA FGTS` | Não vira bloqueio automático agora — metadado visível no cadastro do corretor, sem efeito no motor até confirmação de negócio | Evidência (corretor 850) de restrição escopada/temporal, não banimento permanente |
| Banco/convênio/produto embutidos no nome (C6, BMG, FACTA, INSS, FGTS, CARTAO...) | Metadado de referência (campo texto livre/JSON), não catálogo estruturado nem tabela relacional | Dado não é estruturado o suficiente para virar FK/multi-select real |
| Linhas específicas de 1 corretor (`9327`, `61622`) | Corretor com grupo próprio (grupo de 1 membro) | Consistente com o resto do modelo, sem modelagem especial |
| Tabelas `regra_banco/regra_convenio/regra_produto/regra_grupo/regra_corretor/regra_uf` cogitadas originalmente | Não implementar | Sem lastro nos dados reais |

**Pré-requisito não opcional, fora do escopo do CSV**: sem popular
`Proposta.corretor_id` durante o sync (extrair código do corretor do payload
Hope/Storm e resolver contra `Corretor.codigo_externo`), nenhuma regra
baseada em corretor jamais dispararia em produção.

---

## 7. Nível de confiança por conclusão

| Conclusão | Confiança | Evidência |
|---|---|---|
| CSV é histórico cumulativo de eventos, não snapshot do estado atual | **Alta** | Caso do corretor 850 com datas/grupos conflitantes; picos de volume por dia típicos de reprocessamento em lote |
| "Nome Regra"/"Nome Grupo" = tabela comercial/esteira do WebDeck, não regra booleana | **Alta** | Ausência total de colunas Banco/Convênio/Produto/UF/valor estruturado; padrão de nomenclatura de mercado consignado |
| Valor embutido via `N MIL` é confiável para 36/49 nomes | **Alta** | Padrão regex direto, validado manualmente contra a lista completa |
| `GrupoCorretor`/`Corretor.grupo_id` é o destino certo no schema atual | **Média-alta** | Estrutura já existe e casa com o dado, mas é 1:1 (FK singular) enquanto o CSV mostra corretores em múltiplos grupos simultâneos — precisa decisão de negócio sobre desambiguação ou migração para N:N |
| "BLACKLIST" no CSV não deve virar bloqueio automático imediato | **Média** | Só um caso investigado em profundidade (corretor 850); padrão pode não generalizar para todos os 38+38+38 registros nos 3 grupos de blacklist — recomenda-se confirmação do time de negócio antes de decidir o oposto |
| Facta não tem integração no sistema novo hoje | **Alta** | Grep completo no código e documentação, zero menções fora do CSV |
| Motor antifraude não lê `limite_valor`/`limite_valor_diario` hoje | **Alta** | Leitura completa de `antifraude.py`, confirmado linha a linha |
| `Proposta.corretor_id` nunca é populado pelo sync hoje | **Alta** | Leitura completa de `hope_adapter.py` e `storm_adapter.py`, zero menção a corretor |
| Banco/convênio/produto embutidos no nome não sustentam modelagem relacional | **Média-alta** | Cobertura de banco explícito é minoritária (<40% dos nomes); pode haver conhecimento de negócio não capturado no CSV que preencheria essas lacunas |

---

## 8. Tabela completa — as 49 regras do CSV, uma a uma

Legenda de classificação: **regra antifraude** · **esteira operacional** ·
**grupo comercial** · **limite de alçada** · **limite de valor** ·
**política de aprovação** · **classificação de corretor**. Várias linhas
recebem mais de uma classificação, porque no dado real uma mesma tabela
comercial serve a mais de uma função ao mesmo tempo.

| Nome Regra (volume) | Grupo Webdeck | Valor limite | Como o Webdeck parece usar | Classificação recomendada |
|---|---|---|---|---|
| HAPPY (982) | ESTEIRA NORMAL | — | Fila de processamento padrão, sem faixa de valor própria; parceiro/produto "Happy" | Esteira operacional |
| NORMAL FACTA (982) | ESTEIRA NORMAL | — | Fila padrão do banco Facta (sem integração no sistema novo) | Esteira operacional — hoje sem efeito prático (Facta não integrado) |
| DINAMICA 06 MIL (792) | DINAMICA 06 MIL | R$ 6.000 | Faixa de limite genérica "dinâmica" | Grupo comercial + limite de valor (candidato a regra antifraude em shadow) |
| C6 05 MIL INSS - ESTEIRA NORMAL (538) | — | R$ 5.000 | Banco C6, convênio INSS, fila normal — nome já embute 3 dimensões | Grupo comercial + limite de valor (candidato em shadow) |
| DINAMICA 80 MIL (314) | DINAMICA 80 MIL | R$ 80.000 | Topo da hierarquia "dinâmica" | Grupo comercial + limite de valor (candidato em shadow) |
| DINAMICA 20 MIL (287, com 6 subgrupos por banco: PAN, BMG, C6, DAYCOVAL, FACTA, OLE) | DINAMICA 20 MIL (+ variantes por banco) | R$ 20.000 | Mesma faixa de valor, especializada por banco parceiro no campo Grupo | Grupo comercial por banco + limite de valor (candidato em shadow) |
| DINAMICA 25 MIL (222) | DINAMICA 25 MIL | R$ 25.000 | Faixa genérica | Grupo comercial + limite de valor (candidato em shadow) |
| DINAMICA 30 MIL (162) | DINAMICA 30 MIL | R$ 30.000 | Faixa genérica | Grupo comercial + limite de valor (candidato em shadow) |
| DINAMICA 10 MIL (139) | DINAMICA 10 MIL | R$ 10.000 | Faixa genérica | Grupo comercial + limite de valor (candidato em shadow) |
| LIVRE (106) | LIVRE | — (sem teto) | Corretor sem restrição de valor | Classificação de corretor |
| DINAMICA 15 MIL (93) | DINAMICA 15 MIL | R$ 15.000 | Faixa genérica | Grupo comercial + limite de valor (candidato em shadow) |
| DINAMICA 25 MIL INSS e 50 MIL OC (90) | idem | R$ 25.000 (INSS) / R$ 50.000 (Outros Convênios) | Limite diferente por convênio dentro da mesma tabela | Grupo comercial + limite de valor duplo (por convênio) |
| 31093 - LIVRE FACTA OC (53) | DINAMICA 50 MIL | R$ 50.000 (herdado do grupo) | Rede/downline de um corretor "cabeça" (código 31093) que herda o teto de 50 mil via Grupo | Classificação de corretor (hierarquia de indicação) + herda limite do grupo |
| DINAMICA 50 MIL (52) | DINAMICA 50 MIL | R$ 50.000 | Faixa genérica | Grupo comercial + limite de valor (candidato em shadow) |
| BLACKLIST (38) | BLACKLIST | — | Restrição — escopo real não confirmado | Classificação de corretor (metadado); NÃO regra antifraude até confirmação de negócio |
| FGTS BLACKLIST (38) | BLACKLIST | — | Restrição ligada a operações FGTS especificamente | Classificação de corretor (metadado); NÃO regra antifraude até confirmação |
| DINAMICA 40 MIL (38) | DINAMICA 40 MIL | R$ 40.000 | Faixa genérica | Grupo comercial + limite de valor (candidato em shadow) |
| BANCO FACTA FGTS (38) | BLACKLIST | — | Restrição ligada a Facta + FGTS (banco sem integração hoje) | Classificação de corretor (metadado), sem efeito prático hoje |
| DINAMICA 25 MIL INSS e 30 MIL OC (30) | idem | R$ 25.000 (INSS) / R$ 30.000 (OC) | Igual ao caso "e 50 MIL OC", teto OC menor | Grupo comercial + limite de valor duplo |
| DINAMICA 05 MIL (26) | DINAMICA 05 MIL | R$ 5.000 | Faixa genérica (base da hierarquia) | Grupo comercial + limite de valor (candidato em shadow) |
| DINAMICA 22 MIL (23) | DINAMICA 22 MIL | R$ 22.000 | Faixa genérica | Grupo comercial + limite de valor (candidato em shadow) |
| CARTAO 05 MIL (16) | — | R$ 5.000 | Produto "cartão consignado", não empréstimo | Grupo comercial (produto=cartão) + limite de valor |
| NOVO 15 MIL (8) | — | R$ 15.000 | Variante "nova" da tabela (reformulação de tabela comercial) | Grupo comercial + limite de valor (candidato em shadow) |
| DINAMICA 35 MIL (8) | DINAMICA 35 MIL | R$ 35.000 | Faixa genérica | Grupo comercial + limite de valor (candidato em shadow) |
| NOVO 25 MIL (5) | — | R$ 25.000 | Variante "nova" | Grupo comercial + limite de valor (candidato em shadow) |
| DINAMICA 60 MIL (5) | DINAMICA 60 MIL | R$ 60.000 | Faixa genérica | Grupo comercial + limite de valor (candidato em shadow) |
| DINAMICA 24 MIL (5) | DINAMICA 24 MIL | R$ 24.000 | Faixa genérica | Grupo comercial + limite de valor (candidato em shadow) |
| DINAMICA 18 MIL (5) | DINAMICA 18 MIL | R$ 18.000 | Faixa genérica | Grupo comercial + limite de valor (candidato em shadow) |
| DINAMICA 08 MIL (5) | DINAMICA 08 MIL | R$ 8.000 | Faixa genérica | Grupo comercial + limite de valor (candidato em shadow) |
| CONVENIOS (4) | — | — | Classificação por tipo de convênio, sem valor associado | Classificação de corretor |
| NOVO 20 MIL (4) | — | R$ 20.000 | Variante "nova" | Grupo comercial + limite de valor (candidato em shadow) |
| CARTAO 10 MIL (4) | — | R$ 10.000 | Produto cartão | Grupo comercial + limite de valor (candidato em shadow) |
| DINAMICA 16 MIL (3) | DINAMICA 16 MIL | R$ 16.000 | Faixa genérica | Grupo comercial + limite de valor (candidato em shadow) |
| DINAMICA 07 MIL (3) | DINAMICA 07 MIL | R$ 7.000 | Faixa genérica | Grupo comercial + limite de valor (candidato em shadow) |
| LIVRE PARA PORTABILIDADE (2) | — | — (sem teto) | Sem restrição, específico para operações de portabilidade | Classificação de corretor |
| LIVRE FACTA (CLT E FGTS) (2) | — | — (sem teto) | Sem restrição, específico Facta CLT+FGTS (banco não integrado) | Classificação de corretor, sem efeito prático hoje |
| FORCAS ARMADAS (2) | — | — | Classificação por convênio "Forças Armadas", sem valor | Classificação de corretor |
| DINAMICA 70 MIL (2) | DINAMICA 70 MIL | R$ 70.000 | Faixa genérica | Grupo comercial + limite de valor (candidato em shadow) |
| DINAMICA 40 MIL INSS E 50 MIL OC (2) | idem | R$ 40.000 (INSS) / R$ 50.000 (OC) | 2 valores por convênio | Grupo comercial + limite de valor duplo |
| DINAMICA 21 MIL (2) | DINAMICA 21 MIL | R$ 21.000 | Faixa genérica | Grupo comercial + limite de valor (candidato em shadow) |
| DINAMICA 12 MIL (2) | DINAMICA 12 MIL | R$ 12.000 | Faixa genérica | Grupo comercial + limite de valor (candidato em shadow) |
| 61622 - IDEAL CONSIG SERVICOS LTDA (2) | — | — | Override nomeado por um corretor/PJ específico, não faixa compartilhada | Classificação de corretor (caso individual) |
| NOVO 10 MIL (1) | — | R$ 10.000 | Variante "nova" | Grupo comercial + limite de valor (candidato em shadow) |
| DINAMICA 50 MIL SIAPE (1) | — | R$ 50.000 | Convênio SIAPE especificamente | Grupo comercial + limite de valor (candidato em shadow) |
| DINAMICA 36 MIL (1) | DINAMICA 36 MIL | R$ 36.000 | Faixa genérica | Grupo comercial + limite de valor (candidato em shadow) |
| DINAMICA 29 MIL (1) | DINAMICA 29 MIL | R$ 29.000 | Faixa genérica | Grupo comercial + limite de valor (candidato em shadow) |
| DINAMICA 23 MIL (1) | DINAMICA 23 MIL | R$ 23.000 | Faixa genérica | Grupo comercial + limite de valor (candidato em shadow) |
| DINAMICA 14 MIL (1) | DINAMICA 14 MIL | R$ 14.000 | Faixa genérica | Grupo comercial + limite de valor (candidato em shadow) |
| "9327 " (1) | — | — | Override nomeado por corretor específico (Helena Vitória da Silva Martins) | Classificação de corretor (caso individual) |

**Nenhuma linha do CSV é, por si só, uma "regra antifraude" pronta** no
sentido em que o motor atual entende regra (condição booleana que soma
score ou bloqueia). Nenhuma linha corresponde a "política de aprovação" ou
"limite de alçada" no sentido de quem pode aprovar o quê — esses dois
conceitos não aparecem no CSV; a hierarquia de aprovação do sistema já é
tratada à parte pelos perfis de usuário (admin/gestor/analista/operador),
não por esteira comercial. As 36 linhas com valor numérico são
**candidatas** a alimentar uma regra de limite por corretor — mas só depois
de (1) confirmação de negócio sobre bloquear vs. sinalizar, e (2) o
pré-requisito técnico de `Proposta.corretor_id` ser populado no sync
(seções 5 e 6). As 13 linhas sem valor numérico majoritariamente não viram
regra nenhuma — são metadado de segmentação comercial ou (no caso da
blacklist) uma bandeira que precisa de confirmação antes de virar bloqueio.

---

## 9. Impacto por área (caso a implementação seja aprovada no futuro)

**Importação (sync Hope/Storm):**
Hoje `hope_adapter.py` e `storm_adapter.py` não extraem nenhum código de
corretor do payload — `Proposta.corretor_id` fica sempre `NULL`. Sem
resolver esse elo primeiro, nenhuma regra baseada nas tabelas do WebDeck
teria como disparar em uma proposta real. Pré-requisito técnico, não tarefa
opcional.

**Motor antifraude (`antifraude.py`):**
Novo avaliador que, em vez de ler `params["valor_maximo"]` estático, leria
`proposta.corretor.grupo.limite_valor` dinamicamente. Deveria nascer em
modo "somente registro" (shadow — grava a avaliação mas não soma score nem
bloqueia), conforme recomendação já registrada em
`analise_sistema_antifraude.txt`. A blacklist do CSV ficaria de fora do
motor até confirmação de negócio sobre seu real escopo.

**Aprovação manual (`propostas.py` → `aprovar_manual`):**
Hoje essa rota não roda o motor de novo — só verifica se o status atual é
`ANALISE_MANUAL`. Se o negócio confirmar que o limite do corretor deve
valer também na aprovação, seria um aviso informativo ("valor acima da
faixa histórica deste corretor"), não um bloqueio automático do clique —
consistente com o princípio do sistema de que aprovação é sempre decisão
humana.

**Dashboard:**
As faixas/esteiras importadas poderiam aparecer como coluna informativa na
Mesa de Crédito e no modal de detalhe da proposta ("corretor: faixa X — até
R$ Y"), e no debug da proposta como mais um item avaliado. Sem efeito em
nenhum KPI existente enquanto estiver em modo shadow.

**Corretores e grupos:**
A importação alimentaria `grupos_corretores` (a partir de Nome Regra + Nome
Grupo, deduplicando por faixa) e `corretores` (upsert por `codigo_externo`).
A tela de corretores passaria a mostrar a esteira/faixa de cada um.

---

## 10. Tabelas existentes do projeto que devem ser reutilizadas

- `grupos_corretores` — já existe, já tem `limite_valor`. Destino natural
  de cada faixa/esteira do CSV.
- `corretores` — já existe, já tem `grupo_id` (FK) e `codigo_externo`
  (exatamente o "Codigo Corretor" do CSV).
- `regras_antifraude` — já existe, já é genérica (`tipo` + `parametros`
  JSON); um tipo novo caberia nela sem redesenhar a tabela.
- `auditoria_logs` / `logs_auditoria` — já existem e já são o padrão usado
  em toda mutação do sistema (`AuditoriaService` + `log_auditoria`); uma
  futura importação deveria escrever nos dois, como qualquer outra rotina
  de escrita — hoje `corretores.py`/`grupos.py` não fazem isso.

## 11. Tabelas novas que realmente seriam necessárias

Nenhuma tabela nova é estritamente necessária para o caso simples. Duas
decisões de negócio, ainda pendentes, é que determinariam se algo novo
entra:

- Se um corretor puder pertencer a mais de uma esteira ao mesmo tempo (o
  dado real mostra isso acontecendo, ex: bancos diferentes na mesma faixa
  "DINAMICA 20 MIL"), o `grupo_id` singular de hoje não é suficiente — aí
  sim uma tabela associativa `corretor_grupo` (N:N) seria necessária.
- Se a blacklist do CSV precisar de rastreamento próprio (motivo, escopo
  banco/convênio, data de início/fim), o modelo atual de `blacklist`
  (CPF/CNPJ/telefone/email) não cobre "corretor restrito a um
  banco+convênio específico" — precisaria de campos novos ou uma tabela
  separada. Isso só deveria ser decidido depois da confirmação de negócio
  sobre o que "BLACKLIST" no CSV realmente significa.

As tabelas `regra_banco`, `regra_convenio`, `regra_produto`, `regra_grupo`,
`regra_corretor`, `regra_uf` cogitadas inicialmente **não entram** nessa
lista — a razão está detalhada na seção 12.

## 12. O que NÃO deve ser implementado

- As 6 tabelas relacionais `regra_banco/regra_convenio/regra_produto/
  regra_grupo/regra_corretor/regra_uf` cogitadas originalmente — o CSV não
  tem banco/convênio/produto como dado estruturado (só embutido em texto em
  ~30-40% das linhas); modelar isso como FK relacional seria inventar
  precisão que a fonte não tem.
- Bloqueio automático baseado em estar no grupo `BLACKLIST`/`FGTS BLACKLIST`/
  `BANCO FACTA FGTS` — evidência (corretor 850, seção 2) de que é restrição
  escopada/temporal, não permanente; bloquear sem confirmação arrisca
  barrar corretor ativo.
- Qualquer regra ou tela específica do banco Facta — sem nenhuma
  integração (API ou RPA) no sistema novo hoje; a regra nunca teria dado
  real para avaliar.
- Qualquer regra automática (bloqueante, fora de shadow) usando os dados
  importados antes de `Proposta.corretor_id` ser de fato populado no sync
  — a regra existiria mas nunca dispararia de verdade, dando falsa sensação
  de cobertura.
- Reescrever a tela `RegrasPage.tsx` do zero antes desta análise ser
  validada — o formato de edição (multi-select Banco/Convênio/Produto/UF)
  cogitado originalmente não corresponde ao grão real dos dados.

---

## Próximos passos (aguardando revisão)

Este documento é investigação, não implementação. Os pontos de confiança
"Média" na seção 7 precisam de confirmação do time de negócio da Unica (em
especial: o que "BLACKLIST" realmente bloqueia, e se corretores em
múltiplas esteiras simultâneas é esperado/normal) antes de qualquer
migration ou código ser proposto.
