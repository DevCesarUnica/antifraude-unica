-- ============================================================
--  MIGRAÇÃO: Regras geradas automaticamente a partir de Esteiras
--  Comerciais (LIMITE_CORRETOR_SHADOW)
--  Sistema Antifraude Unica Promotora
--
--  regras_antifraude ganha esteira_id (FK opcional para
--  grupos_corretores) — marca que uma regra foi gerada
--  automaticamente a partir de uma Esteira Comercial (WebDeck), em vez
--  de criada manualmente pela tela /regras. Único por esteira: no
--  máximo 1 regra por esteira, permitindo backfill idempotente
--  (upsert por esteira_id) — ver
--  app/services/gerar_regras_esteiras.py.
--
--  RODAR APENAS UMA VEZ no banco de produção/desenvolvimento.
--  FAÇA BACKUP antes de executar.
--
--  Compatível com PostgreSQL 12+
-- ============================================================

ALTER TABLE regras_antifraude
    ADD COLUMN IF NOT EXISTS esteira_id VARCHAR(36) REFERENCES grupos_corretores(id);

CREATE INDEX IF NOT EXISTS ix_regras_antifraude_esteira_id
    ON regras_antifraude (esteira_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_regras_antifraude_esteira_id
    ON regras_antifraude (esteira_id)
    WHERE esteira_id IS NOT NULL;
