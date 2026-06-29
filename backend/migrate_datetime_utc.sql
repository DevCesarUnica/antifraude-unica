-- ============================================================
--  MIGRAÇÃO: TIMESTAMP → TIMESTAMP WITH TIME ZONE
--  Sistema Antifraude Unica Promotora
--  Todos os dados existentes são tratados como UTC.
--
--  RODAR APENAS UMA VEZ no banco de produção/desenvolvimento.
--  FAÇA BACKUP antes de executar.
--
--  Compatível com PostgreSQL 12+
-- ============================================================

BEGIN;

-- grupos_corretores
ALTER TABLE grupos_corretores
    ALTER COLUMN criado_em     TYPE TIMESTAMP WITH TIME ZONE USING criado_em     AT TIME ZONE 'UTC',
    ALTER COLUMN atualizado_em TYPE TIMESTAMP WITH TIME ZONE USING atualizado_em AT TIME ZONE 'UTC';

-- corretores
ALTER TABLE corretores
    ALTER COLUMN criado_em     TYPE TIMESTAMP WITH TIME ZONE USING criado_em     AT TIME ZONE 'UTC',
    ALTER COLUMN atualizado_em TYPE TIMESTAMP WITH TIME ZONE USING atualizado_em AT TIME ZONE 'UTC';

-- contatos_corretores
ALTER TABLE contatos_corretores
    ALTER COLUMN criado_em TYPE TIMESTAMP WITH TIME ZONE USING criado_em AT TIME ZONE 'UTC';

-- propostas
ALTER TABLE propostas
    ALTER COLUMN criado_em     TYPE TIMESTAMP WITH TIME ZONE USING criado_em     AT TIME ZONE 'UTC',
    ALTER COLUMN atualizado_em TYPE TIMESTAMP WITH TIME ZONE USING atualizado_em AT TIME ZONE 'UTC';

-- regras_antifraude
ALTER TABLE regras_antifraude
    ALTER COLUMN criado_em     TYPE TIMESTAMP WITH TIME ZONE USING criado_em     AT TIME ZONE 'UTC',
    ALTER COLUMN atualizado_em TYPE TIMESTAMP WITH TIME ZONE USING atualizado_em AT TIME ZONE 'UTC';

-- blacklist
ALTER TABLE blacklist
    ALTER COLUMN criado_em TYPE TIMESTAMP WITH TIME ZONE USING criado_em AT TIME ZONE 'UTC';

-- auditoria_logs
ALTER TABLE auditoria_logs
    ALTER COLUMN timestamp TYPE TIMESTAMP WITH TIME ZONE USING timestamp AT TIME ZONE 'UTC';

-- usuarios
ALTER TABLE usuarios
    ALTER COLUMN criado_em     TYPE TIMESTAMP WITH TIME ZONE USING criado_em     AT TIME ZONE 'UTC',
    ALTER COLUMN atualizado_em TYPE TIMESTAMP WITH TIME ZONE USING atualizado_em AT TIME ZONE 'UTC';

-- layouts_importacao
ALTER TABLE layouts_importacao
    ALTER COLUMN criado_em     TYPE TIMESTAMP WITH TIME ZONE USING criado_em     AT TIME ZONE 'UTC',
    ALTER COLUMN atualizado_em TYPE TIMESTAMP WITH TIME ZONE USING atualizado_em AT TIME ZONE 'UTC';

-- importacoes_propostas
ALTER TABLE importacoes_propostas
    ALTER COLUMN criado_em    TYPE TIMESTAMP WITH TIME ZONE USING criado_em    AT TIME ZONE 'UTC',
    ALTER COLUMN concluido_em TYPE TIMESTAMP WITH TIME ZONE USING concluido_em AT TIME ZONE 'UTC';

-- importacoes_corretores
ALTER TABLE importacoes_corretores
    ALTER COLUMN criado_em    TYPE TIMESTAMP WITH TIME ZONE USING criado_em    AT TIME ZONE 'UTC',
    ALTER COLUMN concluido_em TYPE TIMESTAMP WITH TIME ZONE USING concluido_em AT TIME ZONE 'UTC';

-- averbacoes
ALTER TABLE averbacoes
    ALTER COLUMN data_averbacao TYPE TIMESTAMP WITH TIME ZONE USING data_averbacao AT TIME ZONE 'UTC',
    ALTER COLUMN criado_em      TYPE TIMESTAMP WITH TIME ZONE USING criado_em      AT TIME ZONE 'UTC',
    ALTER COLUMN atualizado_em  TYPE TIMESTAMP WITH TIME ZONE USING atualizado_em  AT TIME ZONE 'UTC';

-- retornos_banco
ALTER TABLE retornos_banco
    ALTER COLUMN criado_em    TYPE TIMESTAMP WITH TIME ZONE USING criado_em    AT TIME ZONE 'UTC',
    ALTER COLUMN processado_em TYPE TIMESTAMP WITH TIME ZONE USING processado_em AT TIME ZONE 'UTC';

-- pendencias
ALTER TABLE pendencias
    ALTER COLUMN prazo       TYPE TIMESTAMP WITH TIME ZONE USING prazo       AT TIME ZONE 'UTC',
    ALTER COLUMN criado_em   TYPE TIMESTAMP WITH TIME ZONE USING criado_em   AT TIME ZONE 'UTC',
    ALTER COLUMN resolvida_em TYPE TIMESTAMP WITH TIME ZONE USING resolvida_em AT TIME ZONE 'UTC';

-- logs_acesso
ALTER TABLE logs_acesso
    ALTER COLUMN timestamp TYPE TIMESTAMP WITH TIME ZONE USING timestamp AT TIME ZONE 'UTC';

-- logs_auditoria
ALTER TABLE logs_auditoria
    ALTER COLUMN criado_em TYPE TIMESTAMP WITH TIME ZONE USING criado_em AT TIME ZONE 'UTC';

-- convenios
ALTER TABLE convenios
    ALTER COLUMN criado_em TYPE TIMESTAMP WITH TIME ZONE USING criado_em AT TIME ZONE 'UTC';

-- titan_cache
ALTER TABLE titan_cache
    ALTER COLUMN cached_em TYPE TIMESTAMP WITH TIME ZONE USING cached_em AT TIME ZONE 'UTC',
    ALTER COLUMN expira_em TYPE TIMESTAMP WITH TIME ZONE USING expira_em AT TIME ZONE 'UTC';

COMMIT;

-- ============================================================
--  Verificação pós-migração (execute após o COMMIT):
--
--  SELECT NOW() AT TIME ZONE 'America/Sao_Paulo' AS agora_brt,
--         criado_em,
--         criado_em AT TIME ZONE 'America/Sao_Paulo' AS criado_brt
--  FROM logs_auditoria
--  ORDER BY criado_em DESC LIMIT 5;
-- ============================================================
