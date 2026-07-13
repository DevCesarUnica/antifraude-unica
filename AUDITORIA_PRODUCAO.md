# Auditoria de Produção — Antifraude Unica Promotora

Auditoria técnica completa de pré-produção. Metodologia: leitura integral de
`ONBOARDING_DESENVOLVEDOR.txt`, `DOCUMENTACAO_TECNICA.txt`,
`ANALISE_REGRAS_WEBDECK.md`, seguida de 4 investigações profundas em paralelo
(routers/segurança, models/banco, motor antifraude/integrações, frontend) +
investigação direta própria sobre `workers/`, Docker e módulos não cobertos.
Nenhum código foi alterado nesta etapa — conforme solicitado, este é o
relatório completo antes de qualquer correção.

---

## 1. Resumo executivo

O sistema tem uma arquitetura bem pensada em várias partes (circuit breaker,
auditoria append-only, shadow mode, idempotência de sync) mas **não está
pronto para produção hoje**. Foram encontrados **8 problemas CRÍTICOS**, a
maioria deles do tipo "o recurso existe no código mas nunca funcionou ou não
funciona no caminho real de produção" — o tipo de bug mais perigoso porque
não aparece em teste manual via dev, só em auditoria de código.

Os três achados mais graves, em ordem de impacto:

1. **A regra BLACKLIST do motor antifraude nunca dispara.** O código
   consulta uma coluna (`Blacklist.cpf`) que não existe no modelo — todo
   CPF cadastrado na blacklist é ignorado silenciosamente, sem erro visível
   em nenhum lugar da UI.
2. **A pipeline de processamento de proposta existe em DUAS implementações
   divergentes** — uma usada em dev (`routers/propostas.py`) e outra em
   produção via Celery (`workers/tasks.py`). A versão de produção não
   resolve corretor nem calcula o limite por esteira (Fase 2 inteira nunca
   roda em produção real).
3. **A maioria dos endpoints do backend não exige autenticação**, incluindo
   remover CPF da blacklist, exportar relatórios com CPF completo, criar
   operações financeiras reais no Titan e aprovar/recusar contratos reais
   no hub Storm — tudo isso hoje é acessível por qualquer pessoa com acesso
   de rede ao backend, sem login.

Nenhum desses três é uma opinião de estilo — são bugs/lacunas verificáveis
lendo o código, com cenário concreto de falha. Nenhuma correção foi aplicada
ainda; a lista completa de correções recomendadas está na seção 5, já
separada entre "segura para corrigir agora" e "precisa de decisão de
negócio".

---

## 2. Problemas encontrados, por severidade

### 🔴 CRÍTICO

#### C1. Regra BLACKLIST nunca dispara (AttributeError silencioso) — ✅ CORRIGIDO
`backend/app/services/antifraude.py:190-192`:
```python
entry = self._db.query(Blacklist).filter(
    Blacklist.cpf == proposta.cpf_cliente
).first()
```
O modelo `Blacklist` (`models.py:281-297`) não tem coluna `cpf` — foi
desenhado como tabela genérica `tipo` (enum CPF/CNPJ/TELEFONE/EMAIL) +
`valor`. `Blacklist.cpf` não existe; o acesso lança `AttributeError` antes
mesmo do `.filter()` rodar. Isso é capturado pelo `except Exception` genérico
de `_avaliar_regra` (`antifraude.py:184-186`), que só loga
`motor.regra_erro` e retorna `disparou=False`. **Toda proposta passa como se
a blacklist estivesse vazia**, mesmo com CPFs cadastrados via
`POST /blacklist` (que funciona normalmente do lado do CRUD). Verificado
diretamente por mim, não só pelo agente — confirmado lendo `models.py` e
`antifraude.py` lado a lado.

**Causa raiz mais profunda, descoberta só na hora de corrigir:** o bug não
era só no código — a tabela `blacklist` no Postgres **nunca tinha sido
migrada** para o schema atual de `models.py`. Ainda tinha as colunas antigas
(`id, cpf, motivo, adicionado_por, criado_em`), sem `tipo`/`valor`/`fonte`/
`ativo`. Ou seja, mesmo corrigindo só o código, qualquer query com
`Blacklist.tipo`/`Blacklist.valor` (inclusive o próprio `POST /blacklist/`
do router mais novo) quebrava com
`psycopg2.errors.UndefinedColumn: column blacklist.tipo does not exist`.
Isso nunca apareceu em teste manual porque ninguém nunca tinha conseguido
cadastrar nada na blacklist nesse ambiente para começo de conversa.

**Correção aplicada:**
1. `backend/services/antifraude.py` — troca de
   `Blacklist.cpf == proposta.cpf_cliente` para
   `Blacklist.tipo == TipoBlacklist.CPF, Blacklist.valor == proposta.cpf_cliente,
   Blacklist.ativo == True` (import de `TipoBlacklist` adicionado).
2. `backend/migrate_blacklist_schema.sql` (nova migration, aplicada no
   Postgres local) — cria o enum `tipo_blacklist`, adiciona
   `tipo`/`valor`/`fonte`/`ativo`, remove a coluna `cpf` antiga (tabela
   confirmada vazia antes de rodar — 0 linhas, sem risco de perda de
   dado), recria a constraint `uq_blacklist_tipo_valor` e os índices
   `ix_blacklist_valor`/`ix_blacklist_tipo`/`ix_blacklist_ativo`.

**Validado com dado real (fluxo completo, depois limpo):** criei uma regra
BLACKLIST de teste, cadastrei um CPF fictício via `POST /blacklist/`,
simulei via `POST /regras/simular` — resultado `BLOQUEADO`, motivo "CPF
99988877766 na blacklist: ...". Simulei de novo com um CPF diferente —
resultado `MANUAL` (sem falso positivo). Regra de teste desativada e
entrada de blacklist removida depois da validação.

#### C2. Pipeline de processamento duplicada e divergente (dev vs. produção)
- `routers/propostas.py:25-80` (`_processar_sync`) — shim síncrono "modo dev
  sem Celery", ativo hoje neste ambiente. Chama `resolver_corretor()` e
  `avaliar_shadow()` (Fase 2/3 desta sessão).
- `workers/tasks.py:49-116` (`processar_proposta`, task Celery real,
  registrada em `@shared_task(name="propostas.processar")`) — **não chama
  nem `resolver_corretor` nem `avaliar_shadow`**. `docker-compose.yml`
  sobe um serviço `worker` rodando exatamente essa task
  (`celery -A app.workers.celery_app worker ... -Q propostas,propostas.dlq`).

Ou seja: em qualquer deploy real via Docker que use o worker Celery (o que
o próprio comentário em `propostas.py:24` recomenda: "Em produção com
Docker, substitui por: from app.workers.tasks import processar_proposta"),
**`Proposta.corretor_id`, `corretor_resolucao` e `limite_corretor_shadow`
nunca são preenchidos** — toda a Fase 2/3 fica inerte. Pior: a troca entre
os dois caminhos não é automática nem condicional a ambiente — depende de
alguém trocar manualmente o import, sem qualquer flag de configuração.
Confirmado independentemente por 2 dos 4 agentes de auditoria e por mim via
leitura de `docker-compose.yml` (serviço `worker` existe e roda a task real).

#### C3. Fallback de status assume APROVADO sem guarda (violação em potencial da regra "nunca aprova automaticamente")
Em **ambos** os arquivos da pipeline duplicada (C2):
```python
if decisao.resultado == ResultadoMotor.BLOQUEADO:
    status = BLOQUEADA
elif decisao.resultado == ResultadoMotor.MANUAL:
    status = ANALISE_MANUAL
else:
    status = APROVADA   # ⚠️ fallback, não checagem explícita
```
Hoje `MotorAntifraude.avaliar()` nunca retorna `ResultadoMotor.APROVADO` —
então esse `else` é código morto **hoje**. Mas é uma armadilha de design:
qualquer regressão futura em `antifraude.py` (um novo tipo de regra que
erre o valor de retorno, uma reordenação de `if`, uma variável não
inicializada) faria a proposta ser aprovada **automaticamente, sem nenhuma
ação humana** — violando a "REGRA ABSOLUTAMENTE INVIOLÁVEL" documentada no
próprio ONBOARDING. Em `workers/tasks.py:91-94` isso é ainda mais grave:
o `else` também dispara `enviar_ao_banco.apply_async(...)` — ou seja, a
falha auto-aprovaria **e** auto-enviaria ao banco, sem o clique humano que
hoje existe em `/propostas/{id}/enviar-banco`. O correto é inverter a
lógica: tratar `BLOQUEADO` explicitamente e cair em `ANALISE_MANUAL` para
**qualquer outro valor**, nunca o oposto (fail-safe em vez de fail-open).

#### C4. Maioria dos endpoints mutantes sem autenticação nenhuma
Confirmado endpoint a endpoint (ver `AUDITORIA_SISTEMA.md` §1.1 para a
tabela completa). Destaques mais graves:
- `DELETE /blacklist/{id}` — remove um CPF da blacklist **sem login e sem
  nenhum registro de auditoria** (nem quem, nem quando).
- `POST /storm/antifraude/{id}/aprovar|recusar|pendenciar` — aprova/recusa
  **contratos bancários reais** no hub Storm sem autenticação.
- `POST /titan/operacoes` — cria uma operação financeira real no banco Hope
  sem autenticação.
- `GET /relatorios/*` — exporta CPF completo, valor, score de fraude e o
  log de auditoria inteiro em CSV/JSON sem login.
- `GET /buscar/*` — mesma exposição de CPF/nome/valor.

Isso não é "endpoint auxiliar esquecido" — são as ações mais sensíveis do
sistema (dinheiro, dados pessoais, decisão de crédito).

#### C5. Controle de perfil ausente nas ações de aprovação/bloqueio
`HIERARQUIA_USUARIOS.txt` documenta explicitamente que `POST
/propostas/{id}/aprovar` e `/bloquear` exigem perfil ADMIN, GESTOR ou
ANALISTA (nunca OPERADOR). No código (`routers/propostas.py:309, 343, 464`
— `aprovar_manual`, `bloquear_manual`, `reprocessar`), a única checagem é
`Depends(verificar_token)` — **qualquer usuário autenticado, inclusive
OPERADOR, pode aprovar ou bloquear uma proposta de crédito real hoje**,
contrariando a especificação documentada e verificável.

#### C6. `docker-compose.yml` referencia um Dockerfile de frontend que não existe
`docker-compose.yml` declara o serviço `frontend` com `build: context:
./frontend`, mas **não existe `frontend/Dockerfile`** no repositório.
`docker-compose up` falha na etapa de build do frontend — o deploy
documentado (Docker) está quebrado hoje, verificável tentando o build.

#### C7. Secrets inseguros como default, sem validação de ambiente
`backend/app/core/config.py:9,16,22`:
```python
database_url: str = "postgresql://postgres:unica123@localhost:5432/antifraude"
titan_api_key: str = "123"
secret_key: str = "mude-em-producao"
```
Esses defaults também aparecem embutidos em `docker-compose.yml`
(`SECRET_KEY=${SECRET_KEY:-changeme-in-production}`,
`TITAN_API_KEY=${TITAN_API_KEY:-123}`). Não há nenhuma validação de startup
que rejeite esses valores quando `environment == "production"` — se o
`.env`/variáveis de ambiente não forem configuradas corretamente no deploy,
o sistema sobe silenciosamente com uma chave JWT pública (permite forjar
token de admin) e uma senha de banco conhecida.

#### C8. `_seed_admin` roda a cada tentativa de login, não só na inicialização
`routers/auth.py:56-69,75`: `_seed_admin(db)` é chamado **dentro de**
`POST /auth/login`, incondicionalmente, a cada requisição. Se a tabela
`usuarios` ficar vazia por qualquer motivo em produção (bug, reset
acidental, migração mal feita), um usuário `admin/admin123` é recriado
silenciosamente no meio do login de qualquer pessoa que tentar entrar,
sem alerta a ninguém.

---

### 🟠 ALTO

- **A1 — Cache "envenenado" do Titan em erro.** `titan.py:318-332`: quando
  a API Titan falha, `_get()` cacheia a resposta **mock** por 300s. Mesmo
  depois do Titan voltar, chamadas dentro dessa janela continuam recebendo
  dado mock, sem invalidação automática — só `DELETE /titan/cache` manual.
- **A2 — `_auto_mapear_convenio` sem tratamento de corrida.**
  `antifraude.py:152-166` faz SELECT-then-INSERT em `Convenio` (que tem
  `UNIQUE(nome)`) sem `try/except IntegrityError`. Duas propostas
  concorrentes com convênio novo idêntico (dois workers Celery, ou duas
  syncs simultâneas) fazem a segunda estourar `IntegrityError` não tratado,
  que sobe até `_processar_sync` (também sem try/except ao redor do motor)
  e deixa a proposta **presa em `EM_ANALISE`**. Sem recuperação automática
  (o robô de varredura do Celery Beat não roda neste ambiente — ver C2/A9)
  e sem recuperação manual (`/reprocessar` só aceita `ERRO`/`BLOQUEADA`).
- **A3 — Header HTTP arbitrário usado como autoria.** `corretores.py:271`,
  `importacoes.py:59`: `criado_por=request.headers.get("x-usuario")` —
  qualquer chamador pode forjar `X-Usuario: admin` sem nenhuma verificação
  contra o JWT, corrompendo a trilha de autoria da importação.
- **A4 — `PropostasPage.tsx` sem paginação nenhuma.** `GET /propostas/` é
  chamado sem `skip`/`limit`; com 2.252 propostas já no banco hoje, a tela
  carrega e renderiza tudo de uma vez numa `<table>` sem virtualização —
  risco real de travar a aba do navegador conforme a base cresce. Contraste:
  a Mesa de Crédito (`/dashboard`) pagina corretamente.
- **A5 — FKs centrais sem índice**: `Proposta.corretor_id`,
  `Corretor.grupo_id`, `Pendencia.responsavel_id` — todas usadas em
  `filter`/`join` em produção, nenhuma indexada. Contraste:
  `CorretorEsteira` (tabela mais nova) tem `index=True` nas duas FKs —
  o padrão é conhecido no projeto, só não foi aplicado retroativamente.
- **A6 — Importação manual de CSV pode setar `corretor_id` sem confiança.**
  `routers/importacoes.py:21,70-78,97` aceita mapear uma coluna do CSV
  direto para `Proposta.corretor_id`, ignorando completamente
  `resolver_corretor()` — quebra a "regra de ouro" documentada no próprio
  `resolver_corretor.py` ("nunca vincula sem confiança"). Único freio é a
  FK do Postgres (id inexistente derruba a linha); um `corretor_id` válido
  mas errado passa sem alerta.
- **A7 — Valores monetários como `Float`, sem `CHECK >= 0`.**
  `Proposta.valor`, `GrupoCorretor.limite_valor`,
  `Corretor.limite_valor_diario` — todos `Float` (IEEE-754) em sistema
  financeiro, sem nenhuma constraint impedindo valor negativo.
- **A8 — Badge de status com cores invertidas entre telas.**
  `PropostasPage.tsx` mostra `BLOQUEADA` em laranja/`ERRO` em vermelho;
  `DashboardPropostasTable.tsx`/`PropostaDetalheModal.tsx` mostram o
  oposto — a mesma proposta bloqueada aparece com cores diferentes
  dependendo de qual tela o analista está olhando.
- **A9 — Celery Beat configurado, mas sem serviço `beat` no
  docker-compose.** `celery_app.py:46-52` define
  `varredura-propostas-pendentes` a cada 5 minutos (resgata propostas
  travadas). Sem um container `celery beat` rodando, essa tarefa nunca é
  disparada — a "rede de segurança" documentada em `tasks.py` está inerte
  no deploy atual.
- **A10 — `UsuariosPage.tsx`: mapa de cor de perfil errado ativo por
  shadowing.** Existem duas constantes `BADGE_PERFIL` no mesmo arquivo —
  uma local (com "supervisor", que não existe no enum do backend, e sem
  "operador") faz sombra sobre a versão correta declarada no fim do
  arquivo. Usuários com perfil `operador` perdem a cor distintiva.

---

### 🟡 MÉDIO

- **M1** — `SCORE_RISCO` ignora completamente o parâmetro documentado
  `fatores: [{campo,valor,peso}]` — só avalia um fator hardcoded
  (valor > 3× referência). Um admin que configure múltiplos fatores pela
  tela `/regras` não recebe nenhum erro, mas eles são ignorados.
- **M2** — `Corretor.limite_valor_diario` é campo morto: `LIMITE_DIARIO`
  lê `params["limite_valor_diario"]` (global da regra), nunca o valor
  individual cadastrado no corretor.
- **M3** — Hardcode de `"HOPE"` fora dos dois locais documentados como
  únicos permitidos: `routers/buscar.py:70` também hardcoda `"banco":
  "HOPE"` — inofensivo na prática, mas invalida a auditoria "grep por HOPE
  deve achar só 2 lugares" descrita no ONBOARDING.
- **M4** — Endpoints mutantes sem nenhuma auditoria: `convenios.py`,
  `corretores.py` (CRUD + contatos + importação em massa),
  `grupos.py` (CRUD + vínculo, exceto `/importar-webdeck` que audita),
  `layouts.py`, `averbacoes.py`, `retornos_banco.py` (parcial),
  `pendencias.py`, `storm.py` (aprovar/recusar/pendenciar contratos reais).
- **M5 — ✅ CORRIGIDO** — `services/banks/` (abstração `BankAdapter`)
  duplicava e divergia de `services/titan_envio.py` (fluxo real de envio).
  `HopeAdapter.enviar_proposta()` afirmava "Hope não tem endpoint de
  envio" — falso, o envio real funciona via `titan_envio.py`, só que por
  um caminho totalmente diferente que não passava pela abstração.
  Removido `enviar_proposta()`/`ResultadoEnvio` de `base.py` e `hope.py`
  (confirmado zero chamadores em todo o backend) em vez de migrar
  `titan_envio.py` para dentro da abstração — o fluxo de envio ao Titan é
  específico demais (payload, idempotência, mapeamento de IDs) para
  generalizar num contrato comum a todos os bancos. `BankAdapter`
  continua valendo para `health_check`/`get_produtos`/`get_referencia`,
  que são realmente usados por `routers/bancos.py`.
- **M6** — `schemas_importacao.py` (177 linhas) é código morto — zero
  importadores em todo o backend.
- **M7** — CORS com `allow_origins=["*"]` + `allow_credentials=True`
  (`main.py:35-41`) — combinação não recomendada, já listada como dívida
  técnica no próprio ONBOARDING mas ainda não corrigida.
- **M8** — `AuditoriaLog` (`auditoria_logs`) vs. `LogAuditoria`
  (`logs_auditoria`) — nomes quase-anagramas em português para tabelas com
  propósitos diferentes (eventos de proposta vs. ações de usuário) — risco
  real de confusão para novos desenvolvedores.
- **M9** — `ImportacaoProposta.status` usa `Enum` real,
  `ImportacaoCorretor.status` usa `String(20)` livre — tabelas quase
  gêmeas com tipagem inconsistente. O importador WebDeck
  (`grupos.py::importar_esteiras_webdeck`) não usa nenhuma das duas.
- **M10** — Sem Alembic real: schema evolui via `create_all()` + scripts
  `.sql` soltos, sem tracking de quais já rodaram em cada ambiente.
- **M11** — 12 das 16 rotas autenticadas do frontend colidem com prefixos
  do proxy do Vite — navegação direta por URL/F5 quebra em `/propostas`,
  `/regras`, `/bancos`, `/usuarios`, `/storm`, `/corretores`, `/grupos`,
  `/importacoes`, `/pendencias`, `/logs`, `/relatorios`, `/blacklist`.
- **M12** — `StormPage.tsx` expõe um painel "Diagnóstico API Storm" com
  JSON bruto de cliente (CPF, nome, telefone) direto na tela, mais vários
  `console.log` de payloads completos espalhados pelo arquivo — parece
  instrumentação de desenvolvimento esquecida.
- **M13** — `BlacklistPage.tsx`: contadores por tipo (CPF/CNPJ/...)
  calculados sobre a página atual (20 itens), não o total real — enganoso
  com blacklist grande.
- **M14** — `DashboardPropostasTable.tsx` não usa React Query; após uma
  ação (aprovar/bloquear) os KPIs do topo do dashboard só atualizam até
  10s depois (intervalo de refetch), sem invalidação imediata.
- **M15** — `TipoRegra.LIMITE_CORRETOR_SHADOW` pode ser cadastrado pela
  tela `/regras` sem nenhum aviso de que não tem avaliador — dá falsa
  sensação de cobertura (a regra fica "ativa" na listagem, mas nunca
  dispara).
- **M16** — Rotas estáticas posicionadas de forma frágil (funcionam hoje só
  por não haver colisão ainda): `corretores.py:323` (`/importacoes
  /historico` depois de `/{corretor_id}`), padrão similar em `grupos.py`.

---

### 🟢 BAIXO

- Colunas/relationships mortos: `LogAcesso.username` (sempre `None`),
  `GrupoCorretor.corretores`, `Proposta.auditoria`, `Corretor.propostas`
  (relationships SQLAlchemy nunca acessados via atributo).
- Lógica duplicada `_str()`/`_cpf_digits()` entre `hope_adapter.py` e
  `storm_adapter.py` (candidatos diretos a extrair para util comum).
- `frontend/src/lib/hopeAdapter.ts` e `stormAdapter.ts` — arquivos inteiros
  nunca importados (a sincronização Hope/Storm só é acionável fora da UI).
- ~25 funções exportadas em `api.ts` nunca chamadas por nenhuma página
  (módulos inteiros sem UI: Averbações, Retornos de Banco, parte de
  Corretores/Contatos, Titan direto).
- Duplicação de helpers (`fmtBRL`, `fmtCPF`, `StatusBadge`, `OrigemChip`)
  entre `DashboardPropostasTable.tsx` e `PropostaDetalheModal.tsx` — sem
  `lib/format.ts` compartilhado.
- `RegraAntifraude.peso_score` sem `CHECK >= 0`.
- `retornos_banco.py::_mapear_status` mapeia `REPROVACAO` e
  `CANCELAMENTO` para o mesmo `StatusProposta.REPROVADA`, perdendo
  distinção semântica em relatórios.
- Uso inconsistente de `alert()`/`confirm()` nativos em algumas páginas
  vs. banners inline em outras.
- `PropostasPage` e a Mesa de Crédito são duas implementações paralelas
  do mesmo conceito ("listar propostas") — candidato a consolidação.
- Falta de diretório `hooks/` no frontend — lógica de fetch/filtro
  duplicada inline em cada página.
- `docker-compose.yml` define `NEXT_PUBLIC_API_URL` (convenção Next.js)
  para um projeto Vite — variável provavelmente nunca lida.
- Endpoints órfãos sem UI: `POST /propostas/reprocessar-aprovadas`,
  `POST /titan/operacoes`, `GET /titan/operacoes/{id}`.
- `blacklist.py` redeclara seu próprio `get_db()` idêntico ao de
  `app.database`, em vez de importar.

---

## 3. Correções realizadas

- **C1 — Regra BLACKLIST nunca dispara.** Corrigido o código
  (`antifraude.py` passou a consultar `tipo`+`valor`+`ativo`, não a
  coluna inexistente `cpf`) **e** a causa raiz mais profunda descoberta
  no processo: a tabela `blacklist` no Postgres nunca tinha sido migrada
  para o schema atual (`backend/migrate_blacklist_schema.sql`, aplicada).
  Validado com CPF fictício via simulador — bloqueia de verdade agora.
  Ver detalhe completo na seção 2, CRÍTICO C1.

- **M5 — `services/banks/` divergia de `titan_envio.py`.** Removido o
  método `enviar_proposta()` (e o `ResultadoEnvio` que só ele usava) de
  `BankAdapter`/`HopeAdapter` — confirmado que não tinha nenhum chamador
  no backend. `HopeAdapter.enviar_proposta()` mentia dizendo que Hope não
  tinha endpoint de envio; o envio real sempre funcionou via
  `titan_envio.py` + `POST /propostas/{id}/enviar-banco`, só que por um
  caminho diferente. Validado: backend reiniciado sem erro de import,
  `GET /bancos/` (que usa `HopeAdapter` de verdade) respondendo normal.
  Ver detalhe completo na seção 2, MÉDIO M5.

O restante da lista (seção 4) continua aguardando priorização — auditoria
primeiro, relatório mostrado, correções aplicadas uma de cada vez conforme
você for pedindo.

---

## 4. Correções recomendadas — separadas por segurança de aplicação

### 4.1 Seguras para corrigir agora (bug claro, sem mudança de regra de negócio)

| # | Correção | Risco de aplicar |
|---|---|---|
| C1 | ✅ **FEITO** — código corrigido + `migrate_blacklist_schema.sql` aplicada (tabela real estava com schema antigo, sem `tipo`/`valor`) | Aplicado e validado com CPF fictício via simulador. **Mudança de comportamento observável**: propostas com CPF na blacklist agora bloqueiam/pontuam de verdade — avise o time antes de replicar em outros ambientes. |
| C3 | Inverter o fallback de status: só `BLOQUEADO` explícito vira `BLOQUEADA`; qualquer outro valor (inclusive um `APROVADO` inesperado) cai em `ANALISE_MANUAL` — nos dois arquivos (C2) | Nenhum — reforça a garantia já documentada, não muda comportamento hoje (o `else` é código morto atualmente) |
| A2 | Envolver `_auto_mapear_convenio` em `try/except IntegrityError` com rollback do savepoint | Nenhum — só evita a proposta ficar presa |
| A5 | Adicionar índice às 3 FKs sem índice | Nenhum — migration aditiva, sem downtime relevante |
| A10 | Remover a constante `BADGE_PERFIL` duplicada/errada em `UsuariosPage.tsx` | Nenhum — puramente visual |
| M6 | Remover `schemas_importacao.py` | Nenhum — zero importadores confirmados |
| A8 | Unificar `StatusBadge`/cores num único componente compartilhado | Nenhum — visual, elimina divergência |
| — | Adicionar `Blacklist.ativo == True` ao filtro (parte do C1) | Nenhum |

### 4.2 Precisam de decisão de negócio/produto antes de corrigir

| # | Motivo para não corrigir sozinho |
|---|---|
| C2 | Decidir formalmente: o sistema roda em modo síncrono (dev) ou Celery em produção? Se Celery, `workers/tasks.py` precisa ganhar `resolver_corretor`/`avaliar_shadow` — é lógica de negócio nova num arquivo diferente, prefiro seu aval antes de duplicar/unificar. |
| C4 | Adicionar `Depends(verificar_token)` em ~10 routers é simples tecnicamente, mas pode quebrar integrações hoje "funcionando sem token" (ex. scripts internos, Postman salvo) — quero confirmar com você antes de sair travando endpoint por endpoint. |
| C5 | Adicionar checagem de perfil em aprovar/bloquear/reprocessar — afeta diretamente quem pode aprovar crédito hoje; risco de bloquear um fluxo operacional real se algum OPERADOR depende disso hoje. |
| C6/C7 | Corrigir Dockerfile/secrets é seguro em si, mas exige acesso/decisão sobre como o deploy real vai gerenciar segredos (Vault? variável de CI/CD?) — não é só código. |
| C8 | Mover `_seed_admin` para só rodar em startup (não a cada login) é simples, mas quero confirmar que não há dependência operacional nesse comportamento hoje. |
| A4 | Adicionar paginação real em `PropostasPage` muda a UX da tela mais usada do sistema — prefiro alinhar layout/comportamento com você antes. |
| M4 | Adicionar auditoria em ~8 routers é mecânico, mas é volume grande de mudança — posso fazer em lote se você aprovar. |

---

## 5. Arquivos alterados

Nenhum. Esta etapa é só investigação e relatório, conforme solicitado.

---

## 6. Riscos remanescentes (se nada for corrigido)

- ~~Fraudadores com CPF na blacklist continuam sendo aprovados/analisados
  normalmente, sem nenhum sinal (C1)~~ — **corrigido** (ver seção 3).
- Qualquer pessoa com acesso à rede onde o backend roda pode hoje aprovar
  contratos reais no Storm, criar operações no Titan, remover CPF da
  blacklist e exportar dados pessoais — sem login (C4).
- Se o time subir o worker Celery em produção sem antes resolver C2, todo
  o trabalho de Fase 2/3 desta sessão (vínculo corretor↔proposta, shadow
  mode de limite) simplesmente não roda, silenciosamente.
- Um usuário OPERADOR pode aprovar/bloquear propostas de crédito hoje,
  contrariando a política documentada (C5).
- Deploy via `docker-compose up` falha hoje na etapa de build do frontend
  (C6).

---

## 7. Plano de melhorias futuras (fora do escopo de correção imediata)

1. Introduzir Alembic de verdade (versionamento de schema com rollback),
   substituindo os scripts `.sql` soltos.
2. Consolidar `PropostasPage` e a Mesa de Crédito numa única tela, ou
   documentar claramente por que as duas existem.
3. Extrair componentes/helpers compartilhados de UI (`StatusBadge`,
   formatação de moeda/CPF/data) para eliminar duplicação e divergência
   visual entre telas.
4. Avaliar se `Averbacao`/`RetornoBanco`/`Pendencia` devem ganhar UI ou
   ser removidos, já que hoje são CRUD completo sem nenhum consumidor real.
5. Trocar colunas monetárias de `Float` para `Numeric`/`Decimal` com
   `CHECK >= 0`.
6. Adicionar suíte de testes automatizados — hoje o repositório inteiro
   não tem nenhum teste, o que tornou esta auditoria manual necessária e
   vai continuar sendo necessária a cada mudança sem essa rede de
   segurança.
7. Revisitar a nomenclatura de `AuditoriaLog`/`LogAuditoria` para reduzir
   risco de confusão futura.
8. Decidir o destino de `services/banks/` (abstração multi-banco) —
   completar a migração ou remover.
