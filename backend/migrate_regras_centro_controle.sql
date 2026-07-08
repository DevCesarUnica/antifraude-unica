-- ============================================================
--  MIGRAÇÃO: Centro de Controle do Antifraude (Regras)
--  Sistema Antifraude Unica Promotora
--
--  1. regras_antifraude ganha shadow_mode (observação sem bloquear),
--     criado_por/atualizado_por (denormalizado para a tela — o histórico
--     completo continua em logs_auditoria).
--  2. tipo_regra ganha o valor LIMITE_CORRETOR_SHADOW — placeholder para
--     uso futuro (depende da Fase 2 de vínculo corretor×esteira). Sem
--     avaliador em antifraude.py ainda.
--
--  Não cria tabelas novas — reaproveita regras_antifraude e logs_auditoria,
--  conforme decisão de arquitetura desta fase.
--
--  RODAR APENAS UMA VEZ no banco de produção/desenvolvimento.
--  FAÇA BACKUP antes de executar.
--
--  Compatível com PostgreSQL 12+
-- ============================================================

ALTER TABLE regras_antifraude
    ADD COLUMN IF NOT EXISTS shadow_mode BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE regras_antifraude
    ADD COLUMN IF NOT EXISTS criado_por VARCHAR(100);

ALTER TABLE regras_antifraude
    ADD COLUMN IF NOT EXISTS atualizado_por VARCHAR(100);

ALTER TYPE tipo_regra ADD VALUE IF NOT EXISTS 'LIMITE_CORRETOR_SHADOW';
