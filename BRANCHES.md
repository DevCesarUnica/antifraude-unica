# Estrutura de Branches — Sistema Antifraude | Unica Promotora

Seguimos o modelo **GitFlow adaptado**. Todas as branches de funcionalidade
partem de `develop` e são integradas via Pull Request com revisão obrigatória.

---

## Branches Principais

| Branch    | Propósito |
|-----------|-----------|
| `main`    | Código em produção. Nunca recebe commit direto. |
| `develop` | Integração contínua do desenvolvimento. Base para todas as features. |

---

## Branches de Funcionalidade (`feat/`)

Cada branch cobre um componente ou fase do sistema:

| Branch | Fase | O que implementa |
|--------|------|-----------------|
| `feat/autenticacao-e-acesso` | Fase 1 | Login, JWT, controle de acesso por perfil (RBAC) |
| `feat/cadastro-de-corretores` | Fase 1 | CRUD de corretores, limites operacionais por corretor/banco/UF |
| `feat/painel-operacional` | Fase 1 | Filas: análise manual, aprovadas, erros, pendências |
| `feat/motor-de-regras` | Fase 2 | Motor de decisão antifraude configurável via banco de dados |
| `feat/blacklist` | Fase 2 | Gerenciamento da blacklist própria + sincronização com Storm |
| `feat/auditoria` | Fase 2 | Log imutável de decisões, ações e execuções (append-only) |
| `feat/integracao-api-bancaria` | Fase 3 | Integração com bancos via API (circuit breaker + retry) |
| `feat/automacao-rpa` | Fase 4 | Scripts Playwright por banco sem API |
| `feat/monitoramento-e-alertas` | Fase 5 | Sentry, alertas de fila, UptimeRobot, logs estruturados |

---

## Branches de Release (`release/`)

| Branch | O que representa |
|--------|-----------------|
| `release/v0.1.0-mvp` | MVP: painel + motor de regras + 1 banco via API, sem RPA |
| `release/v0.2.0` | Blacklist própria + auditoria completa |
| `release/v1.0.0` | Sistema completo com RPA e monitoramento em produção |

---

## Branches de Correção Urgente (`hotfix/`)

Criadas a partir de `main` para corrigir falhas críticas em produção.  
Formato: `hotfix/descricao-curta-do-problema`

---

## Fluxo de Trabalho

```
main
 └── develop
      ├── feat/autenticacao-e-acesso
      ├── feat/cadastro-de-corretores
      ├── feat/painel-operacional
      ├── feat/motor-de-regras
      ├── feat/blacklist
      ├── feat/auditoria
      ├── feat/integracao-api-bancaria
      ├── feat/automacao-rpa
      └── feat/monitoramento-e-alertas
```

1. Toda nova funcionalidade parte de `develop`
2. Pull Request de volta para `develop` com revisão
3. Quando `develop` está estável, abre-se uma `release/vX.Y.Z`
4. Após testes finais, a release é mergeada em `main` e tagueada
5. Hotfixes partem de `main` e são mergeados tanto em `main` quanto em `develop`
