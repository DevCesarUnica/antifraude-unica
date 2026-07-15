-- ============================================================
--  MIGRAÇÃO: Índices em FKs centrais sem índice
--  Sistema Antifraude Unica Promotora
--
--  AUDITORIA_PRODUCAO.md, achado A5: Proposta.corretor_id,
--  Corretor.grupo_id e Pendencia.responsavel_id são usadas em
--  filter/join em produção, mas nenhuma tinha índice — só o
--  model.py foi atualizado (index=True), que só afeta tabelas
--  novas via create_all(). Este script aplica o mesmo índice nas
--  tabelas já existentes.
--
--  RODAR APENAS UMA VEZ no banco de produção/desenvolvimento.
--  Migration aditiva (CREATE INDEX), sem downtime relevante.
--
--  Compatível com PostgreSQL 12+
-- ============================================================

CREATE INDEX IF NOT EXISTS ix_propostas_corretor_id
    ON propostas (corretor_id);

CREATE INDEX IF NOT EXISTS ix_corretores_grupo_id
    ON corretores (grupo_id);

CREATE INDEX IF NOT EXISTS ix_pendencias_responsavel_id
    ON pendencias (responsavel_id);
