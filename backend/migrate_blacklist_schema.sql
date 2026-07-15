-- ============================================================
--  MIGRAÇÃO: Corrige drift de schema da tabela blacklist
--  Sistema Antifraude Unica Promotora
--
--  A tabela blacklist no Postgres nunca foi migrada para o schema atual
--  de models.py (tipo/valor/fonte/ativo, genérico para CPF/CNPJ/TELEFONE/
--  EMAIL) — ainda tinha o schema antigo (só coluna "cpf"). Isso fazia
--  qualquer query com Blacklist.tipo/Blacklist.valor falhar com
--  "column blacklist.tipo does not exist", incluindo a regra BLACKLIST
--  do motor antifraude (nunca disparava) e o próprio POST /blacklist/.
--
--  Tabela confirmada vazia (0 linhas) antes de rodar esta migração —
--  sem risco de perda de dado. Ainda assim, FAÇA BACKUP antes de
--  executar em qualquer ambiente com dados reais.
--
--  RODAR APENAS UMA VEZ.
--  Compatível com PostgreSQL 12+
-- ============================================================

BEGIN;

DO $$ BEGIN
    CREATE TYPE tipo_blacklist AS ENUM ('CPF', 'CNPJ', 'TELEFONE', 'EMAIL');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE blacklist ADD COLUMN IF NOT EXISTS tipo tipo_blacklist;
UPDATE blacklist SET tipo = 'CPF' WHERE tipo IS NULL;
ALTER TABLE blacklist ALTER COLUMN tipo SET NOT NULL;

ALTER TABLE blacklist ADD COLUMN IF NOT EXISTS valor VARCHAR(200);
UPDATE blacklist SET valor = cpf WHERE valor IS NULL AND cpf IS NOT NULL;
ALTER TABLE blacklist ALTER COLUMN valor SET NOT NULL;
ALTER TABLE blacklist DROP COLUMN IF EXISTS cpf;

ALTER TABLE blacklist ADD COLUMN IF NOT EXISTS fonte VARCHAR(200);
ALTER TABLE blacklist ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE blacklist
    ADD CONSTRAINT uq_blacklist_tipo_valor UNIQUE (tipo, valor);

CREATE INDEX IF NOT EXISTS ix_blacklist_valor ON blacklist (valor);
CREATE INDEX IF NOT EXISTS ix_blacklist_tipo  ON blacklist (tipo);
CREATE INDEX IF NOT EXISTS ix_blacklist_ativo ON blacklist (ativo);

COMMIT;
