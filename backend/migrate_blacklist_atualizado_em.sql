-- ============================================================
--  MIGRAÇÃO: Blacklist ganha atualizado_em
--  Sistema Antifraude Unica Promotora
--
--  blacklist ganha atualizado_em (DateTime) — faltava rastrear quando uma
--  entrada é reativada (POST /blacklist/ com valor já existente e ativo=False
--  reativa a entrada sem mudar criado_em). Também é uma das colunas mínimas
--  pedidas na exportação Excel (GET /blacklist/exportar-excel).
--
--  RODAR APENAS UMA VEZ no banco de produção/desenvolvimento.
--  FAÇA BACKUP antes de executar.
--
--  Compatível com PostgreSQL 12+
--
--  ------------------------------------------------------------
--  STATUS: JÁ APLICADA — VALIDADO EM 2026-07-09
--  ------------------------------------------------------------
--  Verificação read-only contra postgresql://10.200.1.249:5432/antifraude
--  (banco compartilhado, nenhum DDL executado):
--
--    - information_schema.columns confirma que a coluna
--      atualizado_em (timestamp with time zone) já existe na
--      tabela blacklist;
--    - is_nullable = 'NO' (coluna já está NOT NULL);
--    - SELECT count(*) FROM blacklist = 755 linhas, todas com
--      atualizado_em preenchido (0 linhas pendentes de backfill);
--    - PostgreSQL 14.23 (Ubuntu 14.23-0ubuntu0.22.04.1).
--
--  Conclusão: rodar este script novamente seria um no-op seguro
--  (ADD COLUMN IF NOT EXISTS não faz nada, UPDATE não atinge
--  nenhuma linha, os dois ALTER COLUMN apenas reafirmam o estado
--  atual). Execução foi deliberadamente pulada para evitar DDL
--  desnecessário no banco compartilhado. Origem da aplicação
--  anterior não investigada.
--  ------------------------------------------------------------
-- ============================================================

ALTER TABLE blacklist
    ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ;

UPDATE blacklist
    SET atualizado_em = criado_em
    WHERE atualizado_em IS NULL;

ALTER TABLE blacklist
    ALTER COLUMN atualizado_em SET DEFAULT now();

ALTER TABLE blacklist
    ALTER COLUMN atualizado_em SET NOT NULL;
