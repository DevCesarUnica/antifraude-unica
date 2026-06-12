# Processo Atual (AS IS)

## Visão Geral

O processo atual é executado através do sistema WebDeck, responsável por receber propostas dos bancos, aplicar regras de negócio e executar aprovações automáticas através de robôs.

## Fluxo Atual

1. Banco disponibiliza proposta.
2. WebDeck importa a proposta.
3. Sistema identifica o corretor/parceiro responsável.
4. Sistema identifica a esteira associada ao parceiro.
5. Sistema verifica blacklist.
6. Sistema valida convênio.
7. Sistema aplica regras de aprovação.
8. Sistema define o destino da proposta.

### Possíveis destinos

#### Aprovação automática

A proposta está dentro dos limites da esteira do parceiro e não apresenta restrições.

#### Análise manual

A proposta viola alguma regra de aprovação automática.

Exemplo:

* Parceiro possui limite de R$ 20.000
* Proposta possui valor de R$ 27.800

Resultado:

A proposta é enviada para análise manual.

#### Bloqueio por fraude

O cliente está presente em blacklist ou possui outra restrição antifraude.

#### Não mapeada

O convênio da proposta ainda não foi cadastrado no sistema.

#### Aguardando banco

A proposta foi aprovada pelo sistema mas ainda aguarda atualização ou retorno do banco.

## Estrutura de Esteiras

Os parceiros são agrupados em esteiras de aprovação.

Exemplos:

* Esteira 5 mil
* Esteira 10 mil
* Esteira 15 mil
* Esteira 20 mil
* Esteira 80 mil

Cada esteira define o valor máximo para aprovação automática.

## Administração de Parceiros

O operador pode:

* Consultar parceiro
* Alterar esteira
* Remover parceiro de uma esteira
* Inserir parceiro em nova esteira

## Integrações

Atualmente existem integrações com diversos bancos.

Cada banco pode utilizar:

* API
* RPA (Robotic Process Automation)

Em alguns casos existe:

* Usuário de importação
* Usuário de aprovação

Em outros casos ambos utilizam a mesma credencial.

## Blacklist

Existe integração com o sistema Storm.

O WebDeck realiza sincronização periódica para importar registros de blacklist utilizados no processo antifraude.
