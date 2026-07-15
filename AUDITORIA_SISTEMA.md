# Auditoria Técnica — Inventário do Sistema

Mapeamento completo do repositório Antifraude Unica Promotora, produzido como
Etapa 1 da auditoria de pré-produção. Ver `AUDITORIA_PRODUCAO.md` para os
achados, severidades e correções.

---

## 1. Backend — `backend/app/`

### 1.1 Routers (`app/routers/`, 19 arquivos)

| Router | Prefixo | Auth em mutações? | Auditoria em mutações? |
|---|---|---|---|
| `auth.py` | `/auth` | N/A (login) | Parcial (log de tentativa) |
| `propostas.py` | `/propostas` | Parcial (sem checagem de perfil) | Sim (AuditoriaService + log_auditoria) |
| `regras.py` | `/regras` | Sim (admin/gestor) | Sim |
| `titan.py` | `/titan` | **Não** | Não |
| `bancos.py` | `/bancos` | **Não** | N/A (leitura) |
| `usuarios.py` | `/usuarios` | Sim (admin/gestor, deveria ser só admin em 2 rotas) | Parcial |
| `storm.py` | `/storm` | Só `/sync` | Não |
| `convenios.py` | `/convenios` | **Não** | Não |
| `corretores.py` | `/corretores` | **Não** | Não |
| `grupos.py` | `/grupos` | Só `/importar-webdeck` | Só `/importar-webdeck` |
| `layouts.py` | `/layouts` | **Não** | Não |
| `importacoes.py` | `/importacoes` | **Não** | Parcial |
| `averbacoes.py` | `/averbacoes` | **Não** | Não |
| `retornos_banco.py` | `/retornos-banco` | **Não** | Parcial |
| `pendencias.py` | `/pendencias` | **Não** | Não |
| `logs.py` | `/logs` | Parcial (auditoria sim, acesso não) | N/A |
| `relatorios.py` | `/relatorios` | **Não** | N/A (leitura) |
| `blacklist.py` | `/blacklist` | **Não** | **Não** |
| `buscar.py` | `/buscar` | **Não** | N/A (leitura) |

### 1.2 Services (`app/services/`)

| Service | Responsabilidade |
|---|---|
| `antifraude.py` | Motor de regras (avalia Proposta contra RegraAntifraude ativas) |
| `auditoria.py` | `AuditoriaService` (eventos de proposta) + `log_auditoria()` (ações de usuário) |
| `resolver_corretor.py` | Resolve `Proposta.corretor_id` a partir do payload de origem (Fase 2) |
| `limite_corretor_shadow.py` | Avaliação informativa de limite por esteira (shadow, Fase 2) |
| `hope_adapter.py` / `storm_adapter.py` | Normalizam payload externo → `PropostaCreate` |
| `titan.py` / `storm.py` | Clientes HTTP das APIs externas (circuit breaker, retry, cache) |
| `titan_sync.py` / `storm_sync.py` | Importação em lote (polling) → cria Proposta |
| `titan_envio.py` | Envio de proposta aprovada à API Titan (fluxo humano, via `/propostas/{id}/enviar-banco`) |
| `titan_mock.py` | Dados de referência mock para dev sem API key |
| `propostas_dashboard.py` | Query + normalização para a Mesa de Crédito |
| `banks/` (`base.py`, `hope.py`, `registry.py`) | Abstração `BankAdapter` — usada só por `/bancos` (health/produtos), **não** pelo fluxo real de envio |

### 1.3 Workers (`app/workers/`) — Celery (produção)

| Arquivo | Conteúdo |
|---|---|
| `celery_app.py` | Config Celery: filas `propostas`/`propostas.dlq`, Celery Beat a cada 5min |
| `tasks.py` | `processar_proposta` (motor), `enviar_ao_banco`, `processar_dlq`, `varredura_pendentes` |

**Ver AUDITORIA_PRODUCAO.md — este módulo tem uma implementação da pipeline de
processamento DIVERGENTE da usada em `routers/propostas.py::_processar_sync`
(o shim síncrono que roda hoje em dev).**

### 1.4 Models (`app/models.py`) — tabelas

| Tabela | Uso confirmado |
|---|---|
| `grupos_corretores` (GrupoCorretor) | Sim — Esteiras Comerciais |
| `corretores` (Corretor) | Sim |
| `corretor_esteiras` (CorretorEsteira) | Sim — N:N corretor×esteira |
| `contatos_corretores` (ContatoCorretor) | Sim |
| `propostas` (Proposta) | Sim — núcleo do sistema |
| `regras_antifraude` (RegraAntifraude) | Sim |
| `blacklist` (Blacklist) | Sim no CRUD — **quebrado no motor** (ver auditoria) |
| `auditoria_logs` (AuditoriaLog) | Sim — eventos de proposta |
| `usuarios` (Usuario) | Sim |
| `layouts_importacao` / `mapeamentos_dados` | Sim |
| `importacoes_propostas` / `importacoes_corretores` | Parcial — importador WebDeck não usa nenhuma das duas |
| `averbacoes` (Averbacao) | CRUD existe, **sem consumidor real** (nem UI, nem gatilho automático) |
| `retornos_banco` (RetornoBanco) | Idem |
| `pendencias` (Pendencia) | CRUD existe, sem UI |
| `logs_acesso` (LogAcesso) | Sim, mas `username` sempre NULL |
| `logs_auditoria` (LogAuditoria) | Sim — ações de usuário |
| `convenios` (Convenio) | Sim |
| `titan_cache` (TitanCache) | Sim — cache interno |

### 1.5 Schemas

| Arquivo | Status |
|---|---|
| `schemas.py` | Ativo — usado por praticamente todos os routers |
| `schemas_titan.py` | Parcialmente usado (só `TitanCriarOperacaoRequest`) |
| `schemas_importacao.py` | **Código morto — zero importadores em todo o backend** |

### 1.6 Integrações externas

| Integração | Cliente | Circuit breaker | Retry | Cache |
|---|---|---|---|---|
| Titan (Hope) | `services/titan.py` | Sim (`core/circuit_breaker.py`) | tenacity, 3x | Redis/SQLite fallback, TTL |
| Storm | `services/storm.py` | Sim | tenacity, 3x | Token OAuth2 (não dados) |
| Envio ao banco (aprovação humana) | `services/titan_envio.py` | **Não usa o circuit breaker do Titan** | Próprio, 3x | N/A |
| Envio ao banco (Celery, dead branch) | `workers/tasks.py::_chamar_banco` | Não | Não | N/A |

---

## 2. Frontend — `frontend/src/`

### 2.1 Páginas (`pages/`, 17 arquivos)

DashboardPage, PropostasPage, RegrasPage, EsteirasPage, GruposPage,
CorretoresPage, StormPage, BancosPage, UsuariosPage, LoginPage, LogsPage,
PendenciasPage, ImportacoesPage, RelatoriosPage, BlacklistPage.

Duas telas implementam a mesma coisa de forma independente:
`PropostasPage.tsx` e a Mesa de Crédito (`DashboardPropostasTable.tsx`,
usada dentro de `DashboardPage.tsx`).

### 2.2 Componentes (`components/`, 5 arquivos)

`Header.tsx`, `Layout.tsx`, `DashboardPropostasTable.tsx`,
`PropostaDetalheModal.tsx`, `BuscarContratoModal.tsx` — todos com uso
confirmado. Sem diretório `hooks/` (nenhum hook customizado extraído).

### 2.3 API layer / adapters (`lib/`)

| Arquivo | Status |
|---|---|
| `api.ts` | Ativo, mas ~25 funções exportadas nunca chamadas por nenhuma página (ver auditoria) |
| `hopeAdapter.ts` | **Código morto — nunca importado** |
| `stormAdapter.ts` | **Código morto — nunca importado** (`StormPage.tsx` usa `storm-utils.ts` direto) |
| `storm-utils.ts` | Ativo |

### 2.4 Proxy Vite × Rotas React Router

`vite.config.ts` mapeia ~19 prefixos direto para o backend. **12 das 16
rotas autenticadas em `App.tsx` colidem com esses prefixos** — navegação
direta por URL ou F5 nessas páginas quebra (o proxy intercepta antes do
React Router montar). Ver detalhamento em `AUDITORIA_PRODUCAO.md`.

---

## 3. Banco de dados — Postgres

- **Sem Alembic real**: `alembic` está instalado mas não há `alembic.ini`
  nem `versions/`. Schema evolui via `Base.metadata.create_all()` (só
  cria tabelas novas) + scripts `.sql` soltos rodados manualmente, sem
  tracking de quais já rodaram em qual ambiente.
- **Índices**: presentes e consistentes em tabelas mais novas
  (`CorretorEsteira`, `Blacklist.valor`, `AuditoriaLog`, `LogAuditoria`),
  **ausentes em FKs centrais mais antigas** (`Proposta.corretor_id`,
  `Corretor.grupo_id`, `Pendencia.responsavel_id`).
- **Constraints**: `UniqueConstraint` usado corretamente onde importa
  (`proposta_id_externo`, `Blacklist(tipo,valor)`, `Convenio.nome`).
  Nenhum `CHECK` em colunas monetárias (`Proposta.valor`,
  `GrupoCorretor.limite_valor`, `Corretor.limite_valor_diario`), todas
  declaradas como `Float` em vez de `Numeric`.
- **Duas tabelas de auditoria** com nomes quase-anagramas
  (`auditoria_logs` × `logs_auditoria`) e propósitos diferentes — ver
  detalhamento na auditoria.

---

## 4. Infraestrutura / Deploy

- `docker-compose.yml`: define `postgres`, `redis`, `backend` (uvicorn
  --reload), `worker` (Celery), `flower`, `frontend`.
- **`frontend/Dockerfile` não existe** — o build do serviço `frontend`
  falha (ver AUDITORIA_PRODUCAO.md, CRÍTICO).
- Não há serviço `celery beat` no compose — o `beat_schedule` configurado
  em `celery_app.py` (robô de varredura a cada 5 min) nunca é disparado
  nesse ambiente.
- Sem testes automatizados em todo o repositório (`grep` por
  `test_*.py`/`*.test.tsx`/`*.spec.ts` retorna zero arquivos).
