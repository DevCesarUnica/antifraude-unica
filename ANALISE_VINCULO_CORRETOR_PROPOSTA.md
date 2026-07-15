# Análise — Vínculo Corretor × Proposta (Fase 2)

Documento de investigação, produzido antes de qualquer código desta fase, conforme
exigido. Base: leitura completa de `hope_adapter.py`, `storm_adapter.py`,
`titan_sync.py`, `storm_sync.py`, `titan.py`, `storm.py`, `models.py`, e consulta
directa (read-only) a:

- **2.252 propostas reais** já importadas do Hope/Titan no Postgres local
  (100% da tabela `propostas` hoje — não há nenhuma proposta Storm importada
  ainda, `storm-%` = 0 linhas).
- **206 contratos reais** buscados ao vivo na API Storm (`/contratos`,
  5 status diferentes), para suprir a ausência de dado Storm local. Os dados
  não foram persistidos em disco (continham CPF/telefone/endereço de clientes
  reais) — só usados em memória para contar campos e depois descartados.

---

## 1. Resumo executivo

**Storm tem o vínculo pronto, explícito, no próprio payload.** Todo contrato
Storm vem com um objeto `corretor` completo (`id`, `usuario`, `nome`, `email`,
`cpf`, hierarquia `parent_id`/`gerente_id`/`loja_sala`). Não é preciso inferir
nada — é dado estruturado, com nome de campo idêntico ao conceito do nosso
schema (`Corretor`). 206/206 contratos amostrados tinham o objeto presente;
202/206 (98%) tinham `id` preenchido.

**Hope/Titan não tem esse campo, e não é um caso de "procurar melhor" — foi
verificado exaustivamente e o dado não existe no payload.** As únicas
referências a "quem" em uma operação Titan são `createdByID`/`updatedByID`
(usuário da plataforma Titan, ex: analista de crédito do banco Hope) e
`company`/`originatingCompany` (a entidade pagadora — órgão/prefeitura/estado,
já mapeada corretamente como `convenio`). Nenhum dos 96 valores distintos de
`createdByID` observados nas 2.252 propostas reais bate com nenhum dos 3.325
códigos de corretor do CSV WebDeck. `company.brokerageCompany` e
`company.supplierCompany` — os únicos campos com nome sugestivo de
"corretor/intermediário" — são `null` em 100% das propostas.
**Conclusão: hoje não existe, em lugar nenhum do payload Hope, um identificador
de corretor. Vincular automaticamente proposta Hope → corretor exigiria uma
fonte de dado que a Titan/Ceoslab simplesmente não envia.**

---

## 2. Campo por campo

### 2.1 Hope / Titan (`hope_adapter.py`, `titan_sync.py`, `titan.py`)

| Campo do payload | O que é de fato | Serve para identificar corretor? |
|---|---|---|
| `createdByID` / `updatedByID` (raiz da operação) | ID de usuário da plataforma Titan que criou/alterou o registro — tipicamente um operador/analista do banco Hope, não um corretor da Unica | **Não.** 0/96 valores distintos batem com os 3.325 códigos do CSV WebDeck (comparação feita contra as 2.252 propostas reais já importadas) |
| `customer.person.createdByID` | Mesmo conceito, ao nível do cadastro da pessoa física | Não — mesma limitação |
| `company` / `originatingCompany` (+ `originatingCompanyID`) | Empresa/órgão pagador da folha (ex: "ESTADO DE SAO PAULO", "PREFEITURA DE GUARULHOS") — já mapeado como `convenio` no adapter atual, corretamente | Não é corretor; é convênio. Confirmado nome coincide com o texto usado hoje em `convenio` |
| `company.brokerageCompany` | Campo com nome sugestivo ("empresa corretora") | Existe no schema Titan mas está `null` em 100% das 2.252 propostas reais observadas — nunca populado nos dados que a Unica recebe |
| `company.supplierCompany` / `company.insuranceCompany` / `company.cessionaryCompany` | Outros papéis de empresa no modelo Titan | Também sempre `null` |
| Endpoints do `TitanService` (`/banks`, `/sexes`, `/civil-statueses`, `/professions`, `/{banco}/operations/products`) | Tabelas de referência consumidas hoje | Nenhum endpoint de corretor/vendedor/parceiro existe na integração Titan atual |

Não há, em nenhum nível verificado, um segundo identificador de "quem vendeu
a operação" distinto do órgão pagador. Isso é consistente com o modelo de
negócio: operações Hope via Ceoslab tendem a ser diretas com o órgão
consignante, sem a mesma camada de rede de corretores/parceiros que a Storm
expõe.

### 2.2 Storm (`storm_adapter.py`, `storm_sync.py`, `storm.py`)

Todo contrato retornado por `/contratos` (e por `/antifraude/listar_contratos`,
mesma estrutura) inclui um objeto `corretor` de primeira classe:

```json
"corretor": {
  "id": 644,
  "usuario": "4623",
  "cpf": null,
  "parent_id": 540,
  "gerente_id": 0,
  "nome": "CARLA COSTA DE JESUS SANTOS",
  "email": "solucaounica.07@gmail.com",
  "privilegio": { "id": 10, "descricao": "Corretor Externo" },
  "loja_sala": { "id": 116, "nome": "GC Fabricio Lanzani | RJ", ... }
}
```

| Campo | Confiabilidade | Observação |
|---|---|---|
| `corretor.id` | **Alta** — presente em 202/206 (98%) dos contratos amostrados | Identificador numérico único do corretor na Storm. Compatível em formato com `Corretor.codigo_externo` (que já guarda o "Codigo Corretor" do CSV WebDeck como string) |
| `corretor.nome` | Alta — sempre presente quando `corretor` existe | Usado para atualizar/criar cadastro |
| `corretor.usuario` | Presente, mas é um "login" numérico distinto de `id` — taxa de correspondência com o CSV WebDeck menor que `id` na amostra | Não usar como chave primária de match — `id` é mais confiável |
| `corretor.email` | Presente na maioria | Complementa cadastro, não usado para vínculo |
| `corretor.cpf` | **Sempre `null`** nos 206 contratos amostrados | Não pode ser usado para matching hoje |
| `corretor.parent_id` / `gerente_id` / `loja_sala` | Estrutura hierárquica (corretor → gerente → regional) | Fora do escopo desta fase — não vira `GrupoCorretor`, é hierarquia de indicação, não esteira comercial |

**Taxa de correspondência com o cadastro já importado do CSV WebDeck**
(campo `Corretor.codigo_externo`, populado pela importação de
`relatorio_regras.csv` na Fase 1):

- Comparando `corretor.id` (Storm) contra os 3.325 códigos únicos do CSV, em
  uma amostra viva de 50 contratos (`id_status=1`): **13/50 contratos (26%)**
  bateram diretamente por `id`; olhando por corretor distinto (34 corretores
  únicos nesses 50 contratos), **~38%** já existiam no cadastro WebDeck.
- Isso é **esperado, não é falha**: o CSV WebDeck é um retrato de um período
  específico (picos de matrícula até 08/01/2026); a Storm tem corretores mais
  recentes ou fora do escopo daquele relatório. Um corretor Storm sem
  correspondência no CSV simplesmente não tem esteira/limite configurado
  ainda — ele é cadastrado (upsert) sem `grupo_id`, exatamente como já
  acontece hoje quando alguém cria um corretor manualmente pela tela.

---

## 3. Cobertura estimada, por origem, se implementado como recomendado

| Origem | % de propostas com corretor identificável automaticamente | % que também já teria esteira/limite (match com CSV WebDeck) |
|---|---|---|
| Storm | ~98% (presença de `corretor.id` no payload) | ~26–38% no cadastro atual; tende a subir a cada nova importação/atualização do WebDeck |
| Hope/Titan | **0%** — nenhum campo confiável | N/A |

---

## 4. Riscos

1. **Confundir `createdByID` da Titan com corretor.** É a armadilha mais
   provável — o nome sugere "quem criou", mas é o operador da plataforma
   Titan, não o parceiro comercial da Unica. Vincular por esse campo geraria
   vínculos errados com confiança alta, contaminando qualquer regra futura de
   limite por corretor. **Por isso o resolver classifica Hope como BAIXA
   confiança e não vincula automaticamente.**
2. **`corretor.usuario` (Storm) parece um identificador de corretor mas tem
   correspondência pior que `corretor.id` com o cadastro WebDeck** — risco de
   escolher o campo errado como chave. Adotar `id` como principal.
3. **CPF do corretor Storm é sempre nulo na amostra** — não dá para usar CPF
   como estratégia de fallback/desambiguação hoje, mesmo que o modelo
   `Corretor.cpf` exista.
4. **Criar corretor automaticamente sem confiança.** Mitigado pelo desenho de
   `resolver_corretor()` com 3 níveis — só ALTA confiança upserta/vincula.
5. **Volume real de propostas Storm é zero hoje** — toda a validação de
   cobertura Storm nesta fase veio de uma chamada ao vivo à API, não do banco
   local. Os números de cobertura (98% presença de corretor, ~26–38% match
   com WebDeck) são amostrais (206 e 50 contratos respectivamente), não a
   população completa.

---

## 5. Recomendação final

1. **Storm → ALTA confiança, vínculo automático.** Extrair
   `corretor.{id,nome,email}` do payload no adapter, e no momento da
   sincronização (`storm_sync.py`) resolver/upsertar o `Corretor` por
   `codigo_externo == str(corretor.id)` e preencher `Proposta.corretor_id`.
   Esteira (`GrupoCorretor`) vem de graça pelo `Corretor.grupo_id` já populado
   na Fase 1, quando existir.
2. **Hope/Titan → BAIXA confiança, NÃO vincular automaticamente.** Registrar
   a tentativa (qual `createdByID` foi visto, e que não há correspondência
   confiável) para fins de auditoria e debug, mas manter `corretor_id = NULL`,
   exatamente como é hoje. Isso não é regressão — é tornar visível um limite
   que já existia silenciosamente.
3. Nenhuma regra que bloqueia é alterada nesta fase. O resultado da
   comparação valor × limite da esteira do corretor vira um registro
   informativo (`LIMITE_CORRETOR`, `efeito: "SHADOW"`), gravado por proposta,
   nunca usado para aprovar/reprovar/bloquear.
4. Próxima decisão de negócio (fora do escopo desta fase): se algum dia a
   Ceoslab/Titan expuser um identificador de corretor (endpoint de
   "correspondentes"/"parceiros" ainda não existe na integração), o mesmo
   `resolver_corretor()` ganha um novo caminho ALTA para Hope sem precisar
   redesenhar nada — a função já é despachada por origem.

---

## 6. Validação com dados reais (pós-implementação)

Executada com `resolver_corretor()` e `avaliar_shadow()` já implementados,
contra dado real, em transação com `rollback()` no final (nenhuma escrita
permanece no banco além do que já existia).

**Caso Hope** — proposta `titan-64305` já importada (R$ 932,13, convênio
"ESTADO DE SAO PAULO"): `resolver_corretor` retornou confiança **BAIXA**,
método `titan_sem_campo_corretor`, `corretor_id: null` — confirma em produção
o que a análise previu: sem campo de origem confiável, o sistema não vincula.

**Caso Storm** — contrato real buscado ao vivo (`FF-20/08/2021-841`, banco
AGIBANK, valor R$ 63.197,49), com `corretor.id = 767` no payload:

```
proposta (R$ 63.197,49, AGIBANK)
   ↓ resolver_corretor(origem="storm")
corretor: FERNANDO HUMBERTTO GOMES GERALDO ME (confiança ALTA, já cadastrado)
   ↓ Corretor.grupo_id (populado na Fase 1 pelo import do WebDeck)
esteira: DINAMICA 40 MIL
   ↓ avaliar_shadow()
{
  "regra": "LIMITE_CORRETOR",
  "esteira": "DINAMICA 40 MIL",
  "limite": 40000.0,
  "valor_proposta": 63197.49,
  "status": "ACIMA_LIMITE",
  "efeito": "SHADOW"
}
```

A cadeia completa **proposta → corretor → esteira → limite** funciona de
ponta a ponta com dado real — inclusive um caso em que o valor da proposta
excede o limite da esteira (R$ 63 mil numa esteira de R$ 40 mil), disparando
o status informativo `ACIMA_LIMITE` sem bloquear, reprovar ou alterar o
`status`/`resultado_motor` da proposta.
