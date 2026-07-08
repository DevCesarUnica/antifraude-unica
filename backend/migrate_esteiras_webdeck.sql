-- ============================================================
--  MIGRAÇÃO: Módulo de Esteiras Comerciais (WebDeck)
--  Sistema Antifraude Unica Promotora
--
--  1. corretores.cpf passa a ser opcional — corretores importados do
--     relatorio_regras.csv (WebDeck) só têm código interno + nome, sem CPF.
--  2. grupos_corretores ganha coluna metadados (JSONB) para guardar
--     banco/convênio/produto de referência extraídos do nome da esteira.
--  3. A tabela nova corretor_esteiras (vínculo N:N corretor × esteira) é
--     criada automaticamente pelo Base.metadata.create_all no próximo
--     start do backend — não precisa de ALTER TABLE aqui.
--
--  Ver ANALISE_REGRAS_WEBDECK.md para o contexto completo.
--
--  RODAR APENAS UMA VEZ no banco de produção/desenvolvimento.
--  FAÇA BACKUP antes de executar.
--
--  Compatível com PostgreSQL 12+
-- ============================================================

BEGIN;

ALTER TABLE corretores
    ALTER COLUMN cpf DROP NOT NULL;

ALTER TABLE grupos_corretores
    ADD COLUMN IF NOT EXISTS metadados JSONB;

COMMIT;
