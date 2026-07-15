# Problemas Identificados

## Problema 1 - Cadastro manual de convênios

### Situação atual

Quando uma proposta chega com um convênio não cadastrado, o sistema não consegue concluir o processamento.

O operador precisa:

1. Cadastrar o convênio manualmente.
2. Realizar o mapeamento.
3. Reprocessar as propostas.

### Impactos

* Atraso nas aprovações.
* Dependência de ação humana.
* Acúmulo de propostas pendentes.

---

## Problema 2 - Complexidade na configuração das regras

Atualmente é necessário:

1. Criar grupo de corretores.
2. Criar regra.
3. Associar grupo à regra.

### Impactos

* Configuração duplicada.
* Maior risco de erro operacional.
* Manutenção mais complexa.

---

## Problema 3 - Dependência de sincronização da blacklist

A blacklist é mantida em outro sistema.

A atualização ocorre periodicamente.

### Impactos

* Dependência externa.
* Possibilidade de atraso na atualização.
* Complexidade de integração.

---

## Problema 4 - Falhas operacionais dos robôs

Os robôs podem falhar por diversos motivos:

* Senha expirada.
* Usuário bloqueado.
* Mudanças no sistema do banco.
* Problemas de conexão.

### Impactos

* Aprovações interrompidas.
* Necessidade de intervenção manual.
* Aumento do tempo operacional.

---

## Problema 5 - Falta de monitoramento centralizado

Embora exista alguma visibilidade operacional, ainda existe dificuldade para identificar rapidamente:

* Falhas de importação.
* Falhas de aprovação.
* Bancos com problemas.
* Robôs inativos.

### Impactos

* Diagnóstico lento.
* Maior tempo para correção.

---

## Problema 6 - Relatórios limitados

Necessidade identificada durante a reunião:

* Exportação completa de parceiros.
* Consulta de esteiras.
* Histórico de movimentação.

### Impactos

* Baixa rastreabilidade.
* Dependência de consultas manuais.

---

## Oportunidades de Melhoria

### Automação de convênios

Avaliar criação automática de convênios quando identificados pela primeira vez.

### Centralização da blacklist

Criar cadastro próprio integrado ao sistema.

### Dashboard operacional

Criar monitoramento em tempo real das integrações e robôs.

### Histórico de alterações

Registrar todas as alterações de esteira realizadas nos parceiros.

### Relatórios gerenciais

Disponibilizar relatórios exportáveis para gestão operacional.
