-- ============================================================
--  MIGRAÇÃO: Vínculo Corretor × Proposta (Fase 2)
--  Sistema Antifraude Unica Promotora
--
--  1. propostas ganha corretor_resolucao (JSONB) — registra como o
--     corretor foi (ou não foi) identificado: confiança, origem,
--     método, identificador de origem. Usado pelo modo debug.
--  2. propostas ganha limite_corretor_shadow (JSONB) — resultado
--     informativo da regra LIMITE_CORRETOR em modo shadow (não
--     bloqueante). Nunca lido pelo MotorAntifraude.
--  3. tipo_evento ganha o valor VINCULO_CORRETOR, usado pela
--     auditoria (AuditoriaLog) sempre que uma proposta passa pela
--     resolução de corretor.
--
--  Ver ANALISE_VINCULO_CORRETOR_PROPOSTA.md para o contexto completo.
--
--  RODAR APENAS UMA VEZ no banco de produção/desenvolvimento.
--  FAÇA BACKUP antes de executar.
--
--  Compatível com PostgreSQL 12+
-- ============================================================

ALTER TABLE propostas
    ADD COLUMN IF NOT EXISTS corretor_resolucao JSONB;

ALTER TABLE propostas
    ADD COLUMN IF NOT EXISTS limite_corretor_shadow JSONB;

-- ALTER TYPE ... ADD VALUE não pode rodar dentro do mesmo bloco de
-- transação em que o valor novo é usado, mas pode coexistir com os
-- ALTER TABLE acima nesta mesma migração (não há uso do valor aqui).
ALTER TYPE tipo_evento ADD VALUE IF NOT EXISTS 'VINCULO_CORRETOR';
