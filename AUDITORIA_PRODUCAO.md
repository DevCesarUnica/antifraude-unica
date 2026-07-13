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

- **A1 — ✅ CORRIGIDO** — Cache "envenenado" do Titan em erro.
  `titan.py:318-332`: quando a API Titan falhava, `_get()` cacheava a
  resposta **mock** por 300s sob a mesma chave dos dados reais. Mesmo
  depois do Titan voltar, chamadas dentro dessa janela continuavam
  recebendo dado mock, sem invalidação automática. Corrigido removendo o
  cache do fallback mock (`_set_cache_ttl` e o método inteiro, que ficou
  órfão, foram removidos) — a próxima chamada sempre tenta a API real de
  novo; o circuit breaker já existente evita bater na API repetidamente
  enquanto ela estiver fora do ar.
- **A2 — ✅ CORRIGIDO** — `_auto_mapear_convenio` sem tratamento de corrida.
  `antifraude.py:152-166` fazia SELECT-then-INSERT em `Convenio` (que tem
  `UNIQUE(nome)`) sem `try/except IntegrityError`. Duas propostas
  concorrentes com convênio novo idêntico (dois workers Celery, ou duas
  syncs simultâneas) faziam a segunda estourar `IntegrityError` não
  tratado, deixando a proposta presa em `EM_ANALISE`. Corrigido com
  `self._db.begin_nested()` (SAVEPOINT) em volta do INSERT — em caso de
  `IntegrityError` (corrida confirmada, convênio já existe), o savepoint é
  revertido automaticamente e o processamento segue normalmente, sem subir
  a exceção para `_processar_sync`.
- **A3 — Header HTTP arbitrário usado como autoria — RE-ESCOPADO, precisa
  decisão (ver seção 4.2).** `corretores.py:271`, `importacoes.py:59`:
  `criado_por=request.headers.get("x-usuario")` — qualquer chamador pode
  forjar `X-Usuario: admin`. Investigação mostrou que o problema é maior
  do que a descrição original sugeria: `POST /corretores/importar` e
  `POST /importacoes/propostas` **não têm nenhuma autenticação hoje**
  (nenhum `Depends(verificar_token)` no arquivo inteiro) — não é só
  trocar a fonte do `criado_por`, é decidir se esses dois endpoints
  passam a exigir token, com o mesmo risco já sinalizado no C4
  (poderia quebrar alguma automação que hoje chama sem token).
- **A4 — ✅ CORRIGIDO** — `PropostasPage.tsx` sem paginação nenhuma.
  `GET /propostas/` era chamado sem `skip`/`limit` explícitos e o
  cabeçalho mostrava `propostas.length` (travado em 50, o default do
  backend) como se fosse o total real — enganoso com milhares de
  propostas no banco. Endpoint passou a retornar
  `{items, total, skip, limit}` (`PropostasListaResponse`, mesmo padrão
  da Mesa de Crédito) e o frontend ganhou paginação Anterior/Próxima com
  o total real.
- **A5 — ✅ CORRIGIDO** — FKs centrais sem índice: `Proposta.corretor_id`,
  `Corretor.grupo_id`, `Pendencia.responsavel_id` — todas usadas em
  `filter`/`join` em produção, nenhuma indexada. Adicionado `index=True`
  nos três em `models.py` e aplicado `CREATE INDEX IF NOT EXISTS` no
  banco de desenvolvimento real (`migrate_indices_fks_a5.sql` — rodar
  também em produção).
- **A6 — Importação manual de CSV pode setar `corretor_id` sem confiança
  — precisa decisão (ver seção 4.2).** `routers/importacoes.py:21,70-78,97`
  aceita mapear uma coluna do CSV direto para `Proposta.corretor_id`,
  ignorando completamente `resolver_corretor()` — quebra a "regra de
  ouro" documentada no próprio `resolver_corretor.py` ("nunca vincula sem
  confiança"). Único freio é a FK do Postgres (id inexistente derruba a
  linha); um `corretor_id` válido mas errado passa sem alerta. Forçar
  `resolver_corretor()` aqui muda o comportamento de importações CSV que
  hoje funcionam — pode rejeitar/alterar vínculos que times operacionais
  já contam como válidos.
- **A7 — ✅ CORRIGIDO** — Valores monetários como `Float`, sem
  `CHECK >= 0`. `Proposta.valor`, `GrupoCorretor.limite_valor`,
  `Corretor.limite_valor_diario` — todos `Float` (IEEE-754) em sistema
  financeiro, sem nenhuma constraint impedindo valor negativo.
  Confirmado (`SELECT COUNT(*) WHERE valor < 0`) zero violações
  existentes nas 3 tabelas antes de aplicar. Adicionado `CheckConstraint`
  nos 3 models e `migrate_check_valores_nao_negativos_a7.sql` (bloco
  `DO $$ ... EXCEPTION WHEN duplicate_object`, já que `ADD CONSTRAINT`
  não aceita `IF NOT EXISTS` no Postgres) — aplicada no banco de dev,
  **rodar também em produção** (checando antes que não há violações lá).
- **A8 — ✅ CORRIGIDO** — Badge de status com cores invertidas entre
  telas. `PropostasPage.tsx` tinha sua própria paleta divergente da usada
  em `DashboardPropostasTable.tsx`/`PropostaDetalheModal.tsx` (que já
  eram idênticas entre si) — a mesma proposta bloqueada aparecia com
  cores diferentes dependendo de qual tela o analista estava olhando.
  Extraído `STATUS_META`/`StatusBadge` para `frontend/src/lib/
  statusBadge.tsx`, único agora nos três lugares.
- **A9 — ✅ CORRIGIDO** — Celery Beat estava configurado, mas sem serviço
  `beat` no docker-compose. `celery_app.py:46-52` define
  `varredura-propostas-pendentes` a cada 5 minutos (resgata propostas
  travadas), mas sem um container `celery beat` rodando essa tarefa nunca
  era disparada — a "rede de segurança" documentada em `tasks.py` ficava
  inerte no deploy atual. Migrada a lógica de resgate para
  `core/scheduler.py` (mesmo agendador interno criado para o sync da
  Titan): roda a cada 5 min chamando `processar_proposta_core()` direto
  (síncrono), em vez de `apply_async` — não dependia mais de Celery Beat,
  mas também não dependia de um worker Celery/Redis disponível para
  consumir a fila, que este ambiente não tem rodando. A task Celery
  original (`workers/tasks.py::varredura_pendentes`) foi mantida
  inalterada, para quando houver `celery beat` + worker reais em produção.
- **A10 — ✅ CORRIGIDO** — `UsuariosPage.tsx`: mapa de cor de perfil
  errado ativo por shadowing. Existiam duas constantes `BADGE_PERFIL` no
  mesmo arquivo — uma local (com "supervisor", que não existe no enum do
  backend, e sem "operador") fazia sombra sobre a versão correta
  declarada no fim do arquivo. Removida a constante local errada.

---

### 🟡 MÉDIO

- **M1** — `SCORE_RISCO` ignora completamente o parâmetro documentado
  `fatores: [{campo,valor,peso}]` — só avalia um fator hardcoded
  (valor > 3× referência). Um admin que configure múltiplos fatores pela
  tela `/regras` não recebe nenhum erro, mas eles são ignorados.
- **M2** — `Corretor.limite_valor_diario` é campo morto: `LIMITE_DIARIO`
  lê `params["limite_valor_diario"]` (global da regra), nunca o valor
  individual cadastrado no corretor.
- **M3 — ✅ CORRIGIDO (era a documentação, não o código)** — Hardcode de
  `"HOPE"` fora dos dois locais documentados como únicos permitidos:
  `routers/buscar.py:71` também hardcoda `"banco": "HOPE"`, mas dentro de
  `_normalizar_hope()`, uma função exclusiva de normalizar resultado de
  busca vindo da Titan — mesmo raciocínio do `hope_adapter.py`, código
  correto. Só o `ONBOARDING_DESENVOLVEDOR.txt` ("REGRA 1: só dois
  lugares") estava desatualizado; corrigido para citar os três.
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
- **M6 — ✅ CORRIGIDO** — `schemas_importacao.py` (177 linhas) era código
  morto — zero importadores em todo o backend, confirmado antes de
  remover. Arquivo excluído.
- **M7 — ✅ CORRIGIDO** — CORS com `allow_origins=["*"]` +
  `allow_credentials=True` (`main.py:35-41`) — combinação não
  recomendada. Confirmado que o frontend nunca usa `withCredentials`
  (auth é Bearer token no header, não cookie) — `allow_credentials` não
  tinha função nenhuma. Trocado para `allow_credentials=False`.
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
- **M11 — ✅ CORRIGIDO** — 12 das 16 rotas autenticadas do frontend
  colidiam com prefixos do proxy do Vite — navegação direta por URL/F5
  quebrava em `/propostas`, `/regras`, `/bancos`, `/usuarios`, `/storm`,
  `/corretores`, `/grupos`, `/importacoes`, `/pendencias`, `/logs`,
  `/relatorios`, `/blacklist` (a requisição de navegação era interceptada
  pelo proxy do Vite e recebia JSON da API em vez do HTML do app React).
  Confirmado que o proxy era vestigial: `lib/api.ts` já usa `baseURL`
  absoluta (`VITE_API_URL`/`localhost:8000` direto, habilitado por CORS),
  nenhuma chamada relativa same-origin no frontend inteiro dependia dele.
  Removido o bloco `server.proxy` de `vite.config.ts`.
- **M12 — ✅ CORRIGIDO** — `StormPage.tsx` expunha um painel "Diagnóstico
  API Storm" (o próprio comentário no código dizia "remover após
  confirmar estrutura") com JSON bruto de cliente (CPF, nome, telefone)
  direto na tela, mais 9 `console.log` de payloads completos (clientes,
  contratos, parceiros, colaboradores) espalhados pelo arquivo — clara
  instrumentação de desenvolvimento esquecida. Painel e state associado
  (`debugCliente`/`debugContratos`/`showDebug`) removidos; os
  `console.log` de payload removidos, mantidos só os `console.error` de
  tratamento de erro real.
- **M13 — ✅ já estava corrigido** (comentário no próprio código:
  `routers/blacklist.py:94-96` já cita "bug corrigido: ver M13 da
  auditoria" de uma sessão anterior a esta). `contagem_por_tipo` é
  calculada com `GROUP BY` sobre a base inteira (`ativo=True`), não sobre
  a página atual — confirmado correto, só a tabela desta auditoria não
  tinha sido atualizada.
- **M14** — `DashboardPropostasTable.tsx` não usa React Query; após uma
  ação (aprovar/bloquear) os KPIs do topo do dashboard só atualizam até
  10s depois (intervalo de refetch), sem invalidação imediata.
- **M15 — melhorado** — `TipoRegra.LIMITE_CORRETOR_SHADOW` pode ser
  cadastrado pela tela `/regras` sem nenhum aviso de que não tem
  avaliador — dá falsa sensação de cobertura. Investigação mostrou que o
  risco real é menor do que a descrição sugeria: o backend já tem
  "defesa em profundidade" (`antifraude.py::_limite_corretor_shadow`
  sempre força `score_contribuicao=0`/`bloqueante=False`, ignorando os
  valores da regra — este tipo NUNCA pode bloquear/pontuar, mesmo se
  alguém editar a regra na tela) e o formulário de criação já mostra um
  aviso claro sobre "Modo Observação". O gap real era só visual na
  listagem: uma regra criada manualmente com `shadow_mode=False` (default
  do campo) não mostrava o badge "Observação". Corrigido forçando o badge
  para este tipo independente do campo `shadow_mode` no banco.
- **M16 — corrigido o caso citado** — Rotas estáticas posicionadas de
  forma frágil: `corretores.py` tinha `GET /importacoes/historico`
  definida DEPOIS de `GET /{corretor_id}`. Na prática não colidia hoje
  (segmentos e métodos diferentes o suficiente), mas é o tipo de
  ordenação que quebra silenciosamente com mudanças futuras — movida
  para antes das rotas dinâmicas, seguindo a boa prática já usada em
  `grupos.py` (`/esteiras` antes de `/{grupo_id}`). Não encontrei outra
  instância real de colisão em `grupos.py` além dessa já correta.

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

- **A9 — Robô de varredura não disparava (Celery Beat sem serviço).**
  Adicionado job `_varredura_propostas_pendentes()` em
  `core/scheduler.py` (mesmo agendador interno do sync da Titan), rodando
  a cada 5 min — reprocessa `ENFILEIRADA` presas > 5 min chamando
  `processar_proposta_core()` direto (síncrono) e marca `EM_ANALISE`
  presas > 10 min como `ERRO`, sem depender de Celery Beat nem de um
  worker Celery/Redis consumindo fila (nenhum dos dois está rodando neste
  ambiente). Task Celery original (`workers/tasks.py::varredura_pendentes`)
  mantida inalterada para quando houver infraestrutura real. Validado:
  backend reiniciado sem erro, job registrado no log, execução manual
  direta contra o banco real sem exceção (0 propostas travadas no
  momento do teste). Ver detalhe completo na seção 2, ALTO A9.

- **A4 — `PropostasPage.tsx` sem paginação real.** Backend passou a
  retornar `{items, total, skip, limit}` (`PropostasListaResponse`) em
  `GET /propostas/`, com `total = q.count()` antes do `offset`/`limit`.
  Frontend ganhou paginação Anterior/Próxima e o cabeçalho passou a
  mostrar o total real em vez de `propostas.length` (que ficava travado
  em 50). Validado por leitura estática (import fresco do Python +
  compilação limpa do Vite) — não confirmado via HTTP ao vivo por causa
  do problema de porta fantasma já registrado em memória; usuário
  optou por não bloquear o avanço aguardando validação manual.

- **A2 — `_auto_mapear_convenio` sem tratamento de corrida.** Envolvido
  em `self._db.begin_nested()` (SAVEPOINT) + `try/except IntegrityError`
  — corrida entre propostas concorrentes com convênio novo idêntico não
  sobe mais exceção até o motor, evitando a proposta presa em
  `EM_ANALISE`. Validado: `import app.main` limpo.

- **A5 — Índices em FKs sem índice.** Adicionado `index=True` em
  `Proposta.corretor_id`, `Corretor.grupo_id`, `Pendencia.responsavel_id`
  (`models.py`) e criado `backend/migrate_indices_fks_a5.sql`. Aplicado
  diretamente no banco de desenvolvimento (`CREATE INDEX IF NOT EXISTS`)
  — confirmado via `pg_indexes` que os 3 índices existem agora.
  **Rodar o mesmo script em produção.**

- **A8 — Cores de status divergentes entre telas.** Extraído
  `STATUS_META`/`StatusBadge` (únicos) para
  `frontend/src/lib/statusBadge.tsx`; `PropostasPage.tsx`,
  `DashboardPropostasTable.tsx` e `PropostaDetalheModal.tsx` agora
  importam da mesma fonte — elimina tanto a divergência de cores quanto
  a duplicação de código (também citada na seção BAIXO).

- **A10 — Badge de perfil errado por shadowing.** Removida a constante
  `BADGE_PERFIL` local (duplicada e incorreta) em `UsuariosPage.tsx`;
  só resta a versão correta no fim do arquivo, com `operador` incluído.

- **M6 — `schemas_importacao.py` código morto.** Confirmado zero
  importadores em todo o backend antes de remover; arquivo excluído.

- **Blacklist.ativo (fragmento do C1).** Verificado que o filtro
  `Blacklist.ativo == True` já estava presente em `antifraude.py:206` —
  item já resolvido, a tabela da seção 4.1 só não tinha sido atualizada.

- **A1 — Cache do Titan envenenado em erro.** Removido o cache do
  fallback mock (método `_set_cache_ttl` ficou órfão e foi excluído) —
  falha da API Titan não polui mais o cache real; a próxima chamada
  sempre tenta a API de novo, protegida pelo circuit breaker já
  existente. Validado: `import app.main` limpo.

- **A7 — Valores monetários sem `CHECK >= 0`.** Adicionado
  `CheckConstraint` em `Proposta.valor`, `GrupoCorretor.limite_valor` e
  `Corretor.limite_valor_diario`. Confirmado zero violações existentes
  antes de aplicar; migração `migrate_check_valores_nao_negativos_a7.sql`
  rodada no banco de dev (validado via `pg_constraint`). **Rodar também
  em produção**, confirmando antes que não há valores negativos lá.

- **A3 e A6 — investigados, não corrigidos.** Ambos se mostraram mais
  arriscados do que a descrição original da auditoria sugeria — A3
  esbarra em endpoints sem autenticação nenhuma (não é só trocar a fonte
  do `criado_por`), e A6 exige mudar o comportamento de importações CSV
  que hoje funcionam. Movidos para a seção 4.2 (precisam da sua decisão).

- **M7 — CORS.** `allow_credentials` trocado para `False` — confirmado
  que o frontend nunca usa `withCredentials`, então não tinha função.

- **M3 e M13 — já estavam corrigidos.** M3 era a documentação
  (ONBOARDING) desatualizada, não o código. M13 já tinha sido corrigido
  numa sessão anterior a esta (o próprio código já citava o achado).
  Ambos só precisavam ser marcados nesta auditoria.

- **M11 — Vite proxy colidindo com rotas do React Router.** Removido o
  bloco `server.proxy` de `vite.config.ts`, confirmado vestigial (o
  frontend já chama o backend direto via `baseURL` absoluta + CORS).
  Validado: `curl http://localhost:3000/propostas` passou a retornar o
  HTML do app em vez de JSON da API.

- **M12 — Painel de diagnóstico e `console.log` de PII em `StormPage.tsx`.**
  Removidos o painel "Diagnóstico API Storm" (JSON bruto de cliente na
  tela) e 9 `console.log` de payloads completos; mantidos só os
  `console.error` de tratamento de erro real.

- **M15 — Aviso de regra sem efeito real.** Backend já tinha "defesa em
  profundidade" (nunca bloqueia/pontua para este tipo, independente da
  configuração). Corrigido o gap visual: badge "Observação" na listagem
  agora aparece sempre para este tipo, independente do campo
  `shadow_mode` no banco.

- **M16 — Rota estática após rota dinâmica em `corretores.py`.** `GET
  /importacoes/historico` movida para antes de `GET /{corretor_id}`,
  seguindo o padrão já correto de `grupos.py`.

O restante da lista (seção 4) continua aguardando priorização — itens que
precisam de decisão de negócio/produto ficam na seção 4.2.

---

## 4. Correções recomendadas — separadas por segurança de aplicação

### 4.1 Seguras para corrigir agora (bug claro, sem mudança de regra de negócio)

| # | Correção | Risco de aplicar |
|---|---|---|
| C1 | ✅ **FEITO** — código corrigido + `migrate_blacklist_schema.sql` aplicada (tabela real estava com schema antigo, sem `tipo`/`valor`) | Aplicado e validado com CPF fictício via simulador. **Mudança de comportamento observável**: propostas com CPF na blacklist agora bloqueiam/pontuam de verdade — avise o time antes de replicar em outros ambientes. |
| C3 | ✅ **FEITO** — já corrigido em sessão anterior (ver PROBLEMAS_PENDENTES.txt) | — |
| A2 | ✅ **FEITO** — `_auto_mapear_convenio` envolvido em SAVEPOINT + `try/except IntegrityError` | Aplicado. Sem mudança de comportamento hoje — só evita que a proposta fique presa numa corrida rara. |
| A5 | ✅ **FEITO** — índices adicionados às 3 FKs (`models.py` + `migrate_indices_fks_a5.sql` aplicada no banco de dev) | Aplicado. Rodar `migrate_indices_fks_a5.sql` em produção também. |
| A10 | ✅ **FEITO** — removida a constante `BADGE_PERFIL` duplicada/errada em `UsuariosPage.tsx` | Aplicado — puramente visual. |
| M6 | ✅ **FEITO** — `schemas_importacao.py` removido | Aplicado — zero importadores confirmados antes de remover. |
| A8 | ✅ **FEITO** — `StatusBadge`/cores unificados em `frontend/src/lib/statusBadge.tsx` | Aplicado — visual, elimina divergência entre telas. |
| — | Adicionar `Blacklist.ativo == True` ao filtro (parte do C1) | Já estava aplicado no código (`antifraude.py:206`) — item já resolvido, só não tinha sido marcado nesta tabela. |

### 4.2 Precisam de decisão de negócio/produto antes de corrigir

| # | Motivo para não corrigir sozinho |
|---|---|
| C2, C4, C5, C6/C7, C8 | ✅ **FEITOS** em sessão anterior a esta (ver `PROBLEMAS_PENDENTES.txt`) — tabela mantida só por rastreabilidade histórica. |
| A4 | ✅ **FEITO** — ver seção 3 (paginação real implementada e o usuário optou por não bloquear aguardando validação manual). |
| M4 | Adicionar auditoria em ~8 routers é mecânico, mas é volume grande de mudança — posso fazer em lote se você aprovar. |
| A3 | `POST /corretores/importar` e `POST /importacoes/propostas` não têm autenticação nenhuma hoje — corrigir o `criado_por` forjável exige antes decidir se esses endpoints passam a exigir token (mesmo risco do C4: pode quebrar automação hoje sem token). |
| A6 | Forçar `resolver_corretor()` na importação CSV muda o resultado de importações que hoje funcionam sem essa validação — quero seu aval antes de potencialmente rejeitar/alterar vínculos que já são tratados como válidos operacionalmente. |

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
