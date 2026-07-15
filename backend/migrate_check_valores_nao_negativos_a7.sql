-- ============================================================
--  MIGRAÇÃO: CHECK >= 0 em valores monetários
--  Sistema Antifraude Unica Promotora
--
--  AUDITORIA_PRODUCAO.md, achado A7: Proposta.valor,
--  GrupoCorretor.limite_valor e Corretor.limite_valor_diario são
--  Float sem nenhuma constraint impedindo valor negativo. Confirmado
--  antes de aplicar que não existe nenhuma linha violando a regra
--  (SELECT COUNT(*) ... WHERE valor < 0 = 0 nas 3 tabelas, checado em
--  2026-07-13).
--
--  RODAR APENAS UMA VEZ no banco de produção/desenvolvimento.
--  Migration aditiva, sem downtime relevante — mas vai FALHAR se
--  alguma linha já violar a regra; rode a checagem do parágrafo acima
--  antes em produção. `ALTER TABLE ... ADD CONSTRAINT` não aceita
--  IF NOT EXISTS no Postgres, por isso o bloco DO com EXCEPTION abaixo
--  (idempotente: rodar de novo não dá erro se já existir).
--
--  Compatível com PostgreSQL 12+
-- ============================================================

DO $$ BEGIN
    ALTER TABLE propostas
        ADD CONSTRAINT ck_propostas_valor_nao_negativo
        CHECK (valor >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE grupos_corretores
        ADD CONSTRAINT ck_grupos_corretores_limite_valor_nao_negativo
        CHECK (limite_valor >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE corretores
        ADD CONSTRAINT ck_corretores_limite_valor_diario_nao_negativo
        CHECK (limite_valor_diario >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
