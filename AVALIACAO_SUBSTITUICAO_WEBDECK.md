# Avaliação — Substituição Operacional do WebDeck pelo Antifraude Unica

Avaliação técnica independente, produzida sob a ótica de um consultor de
transformação digital para operações de crédito consignado. Nenhum código foi
alterado para produzir este documento — é leitura e verificação, não
implementação.

**Pergunta respondida**: *O Antifraude Unica já pode substituir o WebDeck na
operação da Unica Promotora?*

## Veredicto

## ⚠️ PARCIALMENTE

O núcleo de mesa de crédito (motor antifraude, aprovação/bloqueio manual,
blacklist, busca global, auditoria, integração Hope/Titan) está funcional e
testado com dado real. Mas a função que o próprio WebDeck modela como unidade
de negócio — **elegibilidade e limite do corretor por esteira comercial** —
existe no Antifraude Unica só em modo sombra (nunca bloqueia, nunca avisa de
verdade) e **nunca disparou em uma proposta real**, porque 0 das 2.252
propostas já importadas do Hope têm `corretor_id` preenchido, e a Storm nunca
sincronizou uma proposta sequer em produção (0 linhas `storm-%` no banco).
Some-se a isso gaps de infraestrutura de produção que não são de negócio, mas
travam um go-live seguro hoje: o deploy "de produção" do `docker-compose.yml`
roda o **servidor de desenvolvimento do Vite** para o frontend (não um build
estático), o que reproduz em produção um bug de navegação já mapeado; não há
testes automatizados em todo o repositório; não há Alembic real (schema
evolui por scripts `.sql` soltos, sem tracking); CORS aceita qualquer origem.

---

## 0. Metodologia e fontes

Lidos por completo: `ONBOARDING_DESENVOLVEDOR.txt`, `DOCUMENTACAO_TECNICA.txt`,
`HIERARQUIA_USUARIOS.txt`, `ANALISE_REGRAS_WEBDECK.md`,
`ANALISE_VINCULO_CORRETOR_PROPOSTA.md`, `AUDITORIA_SISTEMA.md`,
`AUDITORIA_PRODUCAO.md`, `PROBLEMAS_PENDENTES.txt`, `analise_sistema_antifraude.txt`.

Verificado independentemente contra o código e o banco real (não apenas
confiado nos documentos, já que um deles — `DOCUMENTACAO_TECNICA.txt` —
estava desatualizado numa checagem anterior desta mesma sessão):

- Leitura direta de `backend/app/routers/propostas.py`, `storm.py`,
  `titan.py`, `blacklist.py`, `core/config.py`, `main.py`,
  `services/titan_envio.py`, `frontend/src/App.tsx`, `vite.config.ts`,
  `frontend/Dockerfile`, `docker-compose.yml`.
- Consulta read-only ao Postgres real (contagem de linhas, sem alterações)
  para `propostas`, `corretores`, `grupos_corretores`, `regras_antifraude`,
  `blacklist`, `usuarios`, `corretor_esteiras`, e cobertura de
  `Proposta.corretor_id`.
- Nenhuma escrita foi feita no banco além do teste de exportação Excel já
  registrado na conversa anterior (não relacionado a esta avaliação).

Não tive acesso ao código-fonte do WebDeck em si (é sistema de fornecedor
externo). O comparativo funcional abaixo é construído a partir de três
fontes indiretas, citadas em cada linha onde relevante: (1)
`relatorio_regras.csv` (extrato real de dados do WebDeck, analisado em
`ANALISE_REGRAS_WEBDECK.md`), (2) descrição do fluxo WebDeck+Storm em
`analise_sistema_antifraude.txt`, (3) o próprio `ONBOARDING_DESENVOLVEDOR.txt`
que descreve o que o sistema novo foi desenhado para substituir. Onde a
cobertura funcional do WebDeck não pôde ser confirmada por essas fontes, isso
está marcado explicitamente como suposição, não fato verificado.

---

## 1. Mapeamento funcional do Antifraude Unica (hoje)

| Módulo | Backend | Frontend | Estado real (verificado) |
|---|---|---|---|
| Dashboard / Mesa de Crédito | `routers/propostas.py` (`/dashboard`) | `DashboardPage.tsx` + `DashboardPropostasTable.tsx` | Funcional, paginado corretamente, KPIs com refetch a cada 10s (não em tempo real) |
| Propostas (listagem geral) | `/propostas/` (skip/limit, default 50) | `PropostasPage.tsx` | Funcional, mas o frontend **nunca envia** `skip`/`limit` — mostra sempre só as 50 mais recentes, sem forma de navegar para propostas mais antigas. Não é "carrega tudo e trava o navegador" (o backend limita a 50 por padrão), é "não dá para ver o histórico completo" |
| Busca Global (Ctrl+K) | `routers/buscar.py` | `BuscarContratoModal.tsx` | Funcional, multi-fonte (Hope+Storm+local), com dedup e fail-graceful |
| Corretores | `routers/corretores.py` | `CorretoresPage.tsx` | CRUD funcional, 3.324 corretores cadastrados (import do CSV WebDeck). **Sem autenticação em nenhuma rota** |
| Esteiras / Grupos comerciais | `routers/grupos.py`, `GrupoCorretor` | `EsteirasPage.tsx`, `GruposPage.tsx` | Cadastro funcional (49 grupos, 5.121 vínculos `corretor_esteiras`), avaliação de limite existe só em **modo shadow** — nunca bloqueia nem aparece como aviso real para o analista |
| Regras Antifraude | `services/antifraude.py`, `routers/regras.py` | `RegrasPage.tsx` (Centro de Controle) | Funcional — 6 tipos de regra, simulador, shadow mode, histórico. 38 regras cadastradas hoje |
| Blacklist | `routers/blacklist.py` | `BlacklistPage.tsx` | Funcional — 755 entradas. Regra do motor corrigida nesta mesma sessão de auditoria (bug crítico C1, já validado). Export Excel e contagem por tipo corretos (adicionados nesta sessão, ainda não commitados) |
| Auditoria | `services/auditoria.py` (`AuditoriaLog` + `LogAuditoria`) | `LogsPage.tsx` | Funcional nos fluxos de proposta e em parte dos CRUDs; **inconsistente** — `corretores.py`, `grupos.py` (exceto import), `layouts.py`, `averbacoes.py`, `retornos_banco.py`, `pendencias.py` não registram auditoria em suas mutações |
| Storm | `routers/storm.py`, `services/storm.py` | `StormPage.tsx` (4 abas) | Proxy/CRUD funcional contra a API real, mas **0 propostas Storm já sincronizadas para o banco local em produção** — a integração nunca rodou de fato no fluxo `/storm/sync` → banco, só foi validada com chamadas ao vivo e rollback |
| Hope/Titan | `services/titan.py`, `routers/titan.py` | `BancosPage.tsx` | Funcional e é a origem de 100% (2.252/2.252) das propostas reais hoje no banco |
| Envio ao banco pós-aprovação | `services/titan_envio.py`, `POST /propostas/{id}/enviar-banco` | — (sem botão na UI confirmado) | Funcional só para Hope; explicitamente não suporta Storm/manual (mensagem de erro do próprio endpoint). **Sem restrição de perfil** — qualquer usuário autenticado, inclusive operador, pode disparar uma operação financeira real no banco parceiro |
| Pendências | `routers/pendencias.py`, `Pendencia` | `PendenciasPage.tsx` | CRUD existe; sem autenticação; auditoria não implementada |
| Relatórios | `routers/relatorios.py` | `RelatoriosPage.tsx` | Só JSON — sem exportação em CSV/Excel (exceto blacklist, novo) |
| Averbações / Retornos de Banco | `routers/averbacoes.py`, `retornos_banco.py` | Sem UI confirmada | CRUD sem consumidor real |
| Usuários / Perfis | `routers/usuarios.py`, `routers/auth.py` | `UsuariosPage.tsx` | Funcional — 4 perfis com controle real no backend, verificado (`admin/gestor/analista/operador`) |

---

## 2. Comparativo funcional com o WebDeck

| Funcionalidade do WebDeck (inferida) | Classificação | Evidência |
|---|---|---|
| Fila/painel operacional (análise manual, aprovadas, erros, pendências) | ✅ Implementado | Mesa de Crédito + status de proposta cobrem o equivalente |
| Motor de regras antifraude (blacklist, valor, banco/convênio, UF) | ✅ Implementado | `antifraude.py`, 6 tipos de regra, corrigido e validado nesta auditoria |
| Blacklist sincronizada | 🟡 Parcial | Blacklist existe e funciona, mas é cadastro próprio (CRUD manual/import CSV) — não há sincronização automática contínua com nenhuma fonte externa hoje |
| Cadastro de corretores e limites (esteiras comerciais) | 🟡 Parcial | Cadastro migrado do CSV do WebDeck (3.324 corretores, 49 esteiras), mas o **limite nunca é aplicado a uma proposta real** — só shadow, e só teria dado para disparar em propostas Storm (Hope não carrega corretor_id, nunca) |
| Vínculo automático proposta → corretor | ❌ Não existe (Hope) / 🟡 Parcial não validado em produção (Storm) | 0/2.252 propostas reais têm `corretor_id`. Hope não expõe esse dado no payload (confirmado, `ANALISE_VINCULO_CORRETOR_PROPOSTA.md`); Storm expõe mas nunca rodou em produção real |
| Integração multi-banco via API/RPA (incl. Facta) | 🟡 Parcial / ❌ para bancos RPA | Hope e Storm (hub multibanco) integrados via API; **Facta — um banco citado 49x no CSV do WebDeck — não tem nenhuma integração** (API ou RPA) no sistema novo; `rpa/playwright/bancos/` só tem um arquivo de exemplo, nenhum robô real |
| Envio automático ao banco após aprovação | 🟡 Parcial | Funciona só para Hope; Storm e propostas manuais não suportado (erro explícito do próprio endpoint) |
| Auditoria completa de decisões | 🟡 Parcial | Forte no fluxo de proposta; ausente em ~8 outros módulos mutantes |
| Busca unificada de contrato/cliente | ✅ Implementado | Ctrl+K, multi-fonte |
| Gestão de usuários/permissões | ✅ Implementado | 4 perfis com enforcement real no backend |
| Relatórios exportáveis | 🟡 Parcial | Só blacklist tem export Excel; o resto é só JSON |
| Notificação em tempo real de proposta nova | ❌ Não existe | Documentado como pendente no próprio ONBOARDING; hoje é polling de 10s |

---

## 3. Cobertura do WebDeck (%)

Estimativa qualitativa por domínio funcional (não há métrica objetiva
possível sem o código-fonte do WebDeck):

| Domínio | Cobertura estimada |
|---|---|
| Motor de regras / blacklist / mesa de crédito | ~85% |
| Auditoria e rastreabilidade | ~65% |
| Cadastro de corretores/esteiras (dado) | ~90% (dado importado) |
| Aplicação real do limite por esteira (função) | ~5% (só shadow, nunca dispara com dado real) |
| Integração bancária (Hope + Storm) | ~70% (Facta e outros bancos RPA de fora) |
| Relatórios/exportação | ~30% |
| Operação diária (pronto para 100% do volume sem WebDeck) | **~60% no geral** |

O número agregado de ~60% reflete que as partes mais visíveis e testáveis
manualmente (aprovar/bloquear proposta, blacklist, motor de regra) estão
sólidas, mas a parte que dá nome ao dado de origem do WebDeck — controle de
esteira/limite por corretor — está estruturalmente pronta (schema, import,
shadow evaluation) mas **operacionalmente inerte**.

---

## 4. Funcionalidades faltantes (não contar como prontas)

- Aplicação real (não-shadow) de limite de esteira por corretor.
- Vínculo automático `Proposta.corretor_id` para propostas Hope (impossível
  hoje sem novo dado da Ceoslab/Titan — não é bug, é limitação de payload
  externo).
- Qualquer integração com o banco Facta (presente no WebDeck, ausente aqui).
- Envio ao banco para Storm/propostas manuais.
- Exportação de relatórios em CSV/Excel (fora blacklist).
- Notificações em tempo real.
- Refresh token de sessão (JWT expira em 8h, sem renovação).
- Suíte de testes automatizados (zero testes no repositório inteiro).
- Build de produção real do frontend (hoje roda `vite dev` no Docker).

---

## 5. Análise operacional

1. **Cadastro de Corretores** — Funcional (CRUD + import em massa via CSV),
   mas sem autenticação em nenhuma rota de `corretores.py`.
2. **Gestão de Esteiras** — Cadastro funcional; efeito sobre o motor é
   apenas informativo (shadow).
3. **Importação de Produção** — Sync Hope funcional e testado com 2.252
   propostas reais; sync Storm existe mas nunca populou o banco em produção.
4. **Aprovação** — Funcional, com controle de perfil correto
   (admin/gestor/analista, operador bloqueado — verificado no código).
5. **Reprovação/Bloqueio** — Idem, funcional e com controle de perfil.
6. **Auditoria** — Forte no core (proposta), fraca/ausente em ~8 módulos
   periféricos (corretores, grupos, layouts, averbações, retornos, pendências).
7. **Busca** — Funcional e testada (Hope+Storm+local com dedup).
8. **Blacklist** — Funcional; motor corrigido nesta auditoria (bug crítico
   que fazia a regra nunca disparar — corrigido e validado com CPF de teste).
9. **Mesa de Crédito** — Funcional, é a tela mais madura do sistema.
10. **Controle Operacional** (visão gerencial do dia a dia) — Parcial:
    dashboard existe, mas sem consolidado de esteira/corretor (porque essa
    parte nunca dispara), sem relatório exportável além de blacklist.

---

## 6. Análise de integração

| Integração | Atende produção? | Parcial? | Bloqueios |
|---|---|---|---|
| Hope/Titan | **Sim**, para importação e para envio ao banco pós-aprovação | — | `enviar-banco` sem controle de perfil (qualquer autenticado, incl. operador, pode disparar operação financeira real) |
| Storm | **Parcial** | Sim | Proxy/CRUD funcional e testado ao vivo, mas 0 propostas sincronizadas em produção até hoje — a integração "de importação" nunca foi exercitada de ponta a ponta com o banco local; `POST /storm/antifraude/{id}/reanalisar` **sem autenticação nenhuma** (confirmado no código, `storm.py:141-142`) |

---

## 7. Análise de risco — "se desligarmos o WebDeck hoje"

**O que para:**
- Toda a lógica de elegibilidade/limite comercial do corretor por esteira
  que o WebDeck hoje decide de fato (o Antifraude Unica só observa, não
  decide) — analistas perderiam esse sinal por completo, mesmo que hoje ele
  já não apareça na tela deles (shadow puro).
- Qualquer fluxo que dependa do banco Facta (sem integração no sistema novo).
- Qualquer RPA de banco sem API que o WebDeck opere hoje e que não tenha
  equivalente aqui (não confirmável sem acesso ao WebDeck — assumir que
  existe até prova em contrário).

**O que continua funcionando:**
- Importação e motor antifraude para propostas Hope (100% do volume real
  hoje).
- Aprovação/bloqueio manual com controle de perfil.
- Blacklist (agora corrigida).
- Busca global, auditoria de proposta, dashboard.

**O que precisa de contingência antes de desligar:**
- Plano manual/paralelo para controle de limite por esteira até a regra
  `LIMITE_CORRETOR` sair do shadow mode com aprovação de negócio (ver
  `ANALISE_REGRAS_WEBDECK.md` seção 12 — decisão pendente há tempo).
- Confirmação se existe volume real de operações Storm hoje — se sim, a
  ausência de dado sincronizado em produção é um risco imediato de
  "buraco" na esteira de propostas visível para os analistas.
- Corrigir a falta de controle de perfil em `enviar-banco` e autenticação
  em `reanalisar` do Storm antes de qualquer corte real — hoje são portas
  abertas para ação financeira sem controle adequado.
- Restaurar visibilidade de propostas Hope antigas (paginação real em
  `PropostasPage.tsx`) — hoje só as 50 mais recentes aparecem.

---

## 8. Análise de dados — cadeia Proposta → Corretor → Esteira → Regra

```
Proposta (2.252, 100% Hope)
   │
   ├─ corretor_id preenchido: 0 / 2.252  (0%)
   │     → Hope não expõe identificador confiável de corretor no payload
   │       (verificado exaustivamente, ANALISE_VINCULO_CORRETOR_PROPOSTA.md)
   │
   └─ Esteira/limite nunca avaliada para nenhuma proposta real hoje
         (avaliador shadow existe e foi validado 1x com dado ao vivo da
          Storm, em transação com rollback — não é validação em produção)

Corretor (3.324, importados do CSV WebDeck)
   └─ grupo_id (esteira) populado para os que bateram no CSV — cobertura
      de match Storm×CSV estimada em 26-38% numa amostra pequena (50
      contratos), não a população completa

Regra Antifraude (38 cadastradas)
   └─ Nenhuma lê Corretor.limite_valor_diario nem GrupoCorretor.limite_valor
      diretamente — o vínculo passa por um serviço separado
      (limite_corretor_shadow.py), não pelo motor principal
```

**Relacionamento incompleto identificado**: a cadeia inteira está
tecnicamente implementada e uma vez validada ponta a ponta com dado real
(seção 6 de `ANALISE_VINCULO_CORRETOR_PROPOSTA.md`), mas com **zero
execuções em produção** até o momento desta avaliação — 0 propostas reais
passaram por ela.

---

## 9. Análise de performance

- **Paginação**: backend suporta (`skip`/`limit`, default 50) na maioria
  dos endpoints de listagem; a Mesa de Crédito pagina corretamente.
  `PropostasPage.tsx` não usa os parâmetros — trava não em performance, mas
  em alcance (só mostra os 50 registros mais recentes).
- **Índices**: presentes em tabelas recentes (`CorretorEsteira`,
  `Blacklist.valor`, logs de auditoria); **ausentes em FKs centrais mais
  antigas** (`Proposta.corretor_id`, `Corretor.grupo_id`,
  `Pendencia.responsavel_id`) — confirmado por leitura de `models.py`,
  consistente com `AUDITORIA_SISTEMA.md`.
- **Volume atual**: 2.252 propostas, 3.324 corretores, 5.121 vínculos
  corretor-esteira, 755 blacklist, 38 regras — volume ainda modesto; nenhum
  destes é hoje motivo de lentidão perceptível, mas o crescimento sem os
  índices citados vai degradar consultas por corretor/pendência.
- **Processo backend**: `docker-compose.yml` roda `uvicorn --reload` sem
  `--workers` — processo único com overhead de auto-reload ligado mesmo no
  que o compose chama de ambiente de produção. Isso limita throughput
  concorrente real.
- **Frontend "de produção"**: `frontend/Dockerfile` executa `npm run dev`
  (servidor de desenvolvimento do Vite), não `vite build` + servidor
  estático — isso não é só uma questão de performance, é o servidor errado
  para produção (recompila em memória a cada request de origem, sem cache
  de assets, sem minificação).

---

## 10. Análise de produção — 50/100 usuários simultâneos, operação diária

- **50 usuários simultâneos**: plausível para o backend (FastAPI/Uvicorn
  aguenta essa carga mesmo num único processo para operações CRUD simples),
  mas o frontend rodando `vite dev` é um ponto de estrangulamento real sob
  concorrência — o dev server do Vite não foi desenhado para servir
  múltiplos usuários simultâneos como um servidor de produção.
- **100 usuários simultâneos**: mesmo risco, agravado. Sem `--workers` no
  Uvicorn e sem o build estático do frontend, não há garantia de
  estabilidade nessa carga — não testado (não há suíte de carga no
  repositório).
- **Operação diária completa**: sim para o fluxo "importar → motor →
  aprovar/bloquear → auditoria" com volume atual. Não para relatórios
  gerenciais (só JSON) nem para o controle de limite por esteira (inerte).

---

## 11. Gaps que impedem a substituição (só o que bloqueia de fato)

### 🔴 CRÍTICO

1. **Frontend "de produção" roda o servidor de desenvolvimento do Vite**
   (`frontend/Dockerfile: CMD ["npm", "run", "dev", ...]`). Isso reproduz em
   produção o bug já documentado de 12 das 16 rotas autenticadas colidindo
   com os prefixos do proxy do Vite (`vite.config.ts`) — navegação direta
   por URL ou F5 em `/propostas`, `/storm`, `/blacklist`, `/regras`,
   `/usuarios`, `/corretores`, `/grupos`, `/importacoes`, `/pendencias`,
   `/logs`, `/relatorios`, `/retornos-banco` (confirmado por comparação
   direta entre `App.tsx` e `vite.config.ts`) quebra a navegação do usuário
   final em produção real, não só em dev.
2. **Limite de esteira por corretor nunca dispara em produção real** — é a
   função central que o dado do WebDeck (CSV) modela, e ela está 100% em
   modo observacional, sem confirmação de negócio para sair do shadow
   (`ANALISE_REGRAS_WEBDECK.md`, seção 12, decisão pendente).
3. **`POST /propostas/{id}/enviar-banco` sem controle de perfil** — qualquer
   usuário autenticado, incluindo operador, pode criar uma operação
   financeira real no banco Hope. Achado novo, confirmado nesta avaliação
   (`propostas.py:341-360`, sem `_exige_perfil`).
4. **Zero testes automatizados** em todo o repositório — qualquer mudança
   futura no motor antifraude ou nos adapters de banco não tem rede de
   segurança nenhuma, e este é justamente o sistema que decide
   aprovação/bloqueio de crédito.

### 🟠 ALTO

5. `POST /storm/antifraude/{contrato_id}/reanalisar` sem autenticação
   nenhuma (`storm.py:141-142`, confirmado).
6. Sem Alembic real — schema evolui por scripts `.sql` soltos sem tracking
   de quais já rodaram em qual ambiente (risco de drift entre dev/produção).
7. `PropostasPage.tsx` sem forma de navegar além das 50 propostas mais
   recentes — analistas não conseguem consultar histórico completo pela
   tela principal de propostas.
8. Storm nunca sincronizou uma proposta real para o banco em produção —
   função crítica (é o hub multibanco) sem validação operacional real.
9. FKs centrais sem índice (`Proposta.corretor_id`, `Corretor.grupo_id`,
   `Pendencia.responsavel_id`) — degradação progressiva com volume.
10. Sem Celery Beat no `docker-compose.yml` — a varredura que resgata
    propostas travadas em `EM_ANALISE` (`celery_app.py`) nunca dispara no
    deploy atual.
11. CORS com `allow_origins=["*"]` — aceito em dev, não recomendado em
    produção financeira.

### 🟡 MÉDIO

12. Relatórios sem exportação (só JSON) fora da blacklist.
13. Auditoria ausente em ~8 routers mutantes (corretores, grupos, layouts,
    averbações, retornos de banco, pendências).
14. Banco Facta (relevante no CSV do WebDeck) sem qualquer integração.
15. `SCORE_RISCO` ignora parte dos parâmetros configuráveis pela tela
    (documentado em `AUDITORIA_PRODUCAO.md`, não re-verificado nesta
    avaliação).

### 🟢 BAIXO

16. Sem refresh token — sessão expira em 8h sem renovação.
17. Sem notificação em tempo real (polling de 10s).
18. Duas telas paralelas para "listar propostas" (`PropostasPage` e Mesa de
    Crédito) sem consolidação.

---

## 12. Recomendação

**Substituição parcial**, por fases, não substituição imediata nem
inviável. O núcleo de decisão antifraude (motor de regras, blacklist,
aprovação/bloqueio manual, auditoria de proposta, busca global) está maduro
o suficiente para carregar 100% do volume Hope hoje, desde que os 4 gaps
CRÍTICOS acima sejam resolvidos primeiro — nenhum deles é grande em esforço
de código (são configuração de deploy, um `Depends` faltando, e uma decisão
de negócio já mapeada), mas todos são bloqueadores reais.

A função de esteira/limite por corretor — que é literalmente o que o dado do
WebDeck usado nesta análise modela — **não deve ser anunciada como pronta**
enquanto estiver em shadow mode. Rodar em paralelo com o WebDeck nesse
quesito específico até a decisão de negócio (bloquear vs. só avisar) ser
tomada e validada com volume real.

---

## 13. Plano de migração

**Fase 1 — Fechar os bloqueadores críticos (1-2 semanas)**
- Trocar `frontend/Dockerfile` para `vite build` + servidor estático
  (nginx ou `vite preview` supervisionado), eliminando a colisão de rotas
  em produção.
- Adicionar `_exige_perfil` em `enviar-banco` e `Depends(verificar_token)`
  em `reanalisar` do Storm.
- Adicionar paginação real (com navegação) em `PropostasPage.tsx`.
- Rodar `/storm/sync` de verdade contra produção pelo menos uma vez e
  validar volume antes de contar com essa integração.

**Fase 2 — Piloto controlado (2-4 semanas)**
- Migrar só o fluxo Hope/Titan (100% do volume validado hoje) para o
  Antifraude Unica, mantendo WebDeck rodando em paralelo só para
  monitoramento/comparação (não para decisão).
- Confirmar decisão de negócio sobre `LIMITE_CORRETOR` (bloquear ou avisar)
  e, se aprovado, promover a regra de shadow para real — só depois de
  volume suficiente de avaliações shadow revisadas manualmente.
- Introduzir testes automatizados no mínimo para `antifraude.py`,
  `hope_adapter.py`, `storm_adapter.py` antes de qualquer corte real.

**Fase 3 — Corte gradual (dependente de Fase 2 sem incidentes)**
- Migrar fluxo Storm depois de confirmado o volume real em produção.
- Desligar WebDeck para os bancos já cobertos (Hope, bancos Storm ativos).
- Manter contingência manual documentada para Facta (ou negociar
  integração/RPA antes do corte, se ainda houver volume relevante nesse
  banco).
- Só desligar WebDeck por completo depois que os itens ALTO (Alembic,
  índices, Celery Beat, auditoria completa) também estiverem resolvidos —
  não são bloqueadores de Fase 1/2, mas são risco operacional acumulado
  para uma operação 100% dependente do sistema novo.

---

## 14. Go/No-Go

**⚠️ NO-GO para corte total e imediato do WebDeck hoje.**

**GO condicional** para operar o fluxo Hope em paralelo com o WebDeck assim
que os 4 gaps CRÍTICOS da seção 11 forem corrigidos — esse fluxo específico
já tem volume real, motor corrigido e validado, e controle de perfil correto
nas ações mais sensíveis (exceto o próprio `enviar-banco`, que é parte dos
críticos a corrigir).

**NO-GO para a função de esteira/limite por corretor** até decisão de
negócio explícita e validação com volume real — hoje ela daria uma falsa
sensação de cobertura se anunciada como pronta.
