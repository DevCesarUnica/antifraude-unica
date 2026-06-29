"""
Modelos de banco de dados — PostgreSQL com JSONB para dados dinâmicos.
Todos usam UUID como PK para evitar colisões em ambiente distribuído.
"""

import uuid
from datetime import datetime, timezone
from enum import Enum as PyEnum

from sqlalchemy import (
    Boolean, DateTime, Float, ForeignKey,
    Integer, String, Text, Enum, UniqueConstraint,
    Index,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship, mapped_column, Mapped

from app.database import Base


def _uuid():
    return str(uuid.uuid4())


def _now():
    return datetime.now(timezone.utc)


# ── Enums ────────────────────────────────────────────────────────────────────

class StatusProposta(str, PyEnum):
    ENFILEIRADA           = "ENFILEIRADA"
    EM_ANALISE            = "EM_ANALISE"
    APROVADA              = "APROVADA"
    REPROVADA             = "REPROVADA"
    BLOQUEADA             = "BLOQUEADA"
    ANALISE_MANUAL        = "ANALISE_MANUAL"
    ENVIADA_BANCO         = "ENVIADA_BANCO"
    CONFIRMADA_BANCO      = "CONFIRMADA_BANCO"
    ERRO                  = "ERRO"


class ResultadoMotor(str, PyEnum):
    APROVADO = "APROVADO"
    MANUAL   = "MANUAL"
    BLOQUEADO = "BLOQUEADO"


class TipoRegra(str, PyEnum):
    BLACKLIST      = "BLACKLIST"
    VALOR_MAXIMO   = "VALOR_MAXIMO"
    BANCO_CONVENIO = "BANCO_CONVENIO"
    UF_BLOQUEADA   = "UF_BLOQUEADA"
    SCORE_RISCO    = "SCORE_RISCO"
    LIMITE_DIARIO  = "LIMITE_DIARIO"


class TipoEvento(str, PyEnum):
    CRIACAO        = "CRIACAO"
    ENFILEIRAMENTO = "ENFILEIRAMENTO"
    INICIO_ANALISE = "INICIO_ANALISE"
    DECISAO_MOTOR  = "DECISAO_MOTOR"
    ENVIO_BANCO    = "ENVIO_BANCO"
    RETORNO_BANCO  = "RETORNO_BANCO"
    ERRO           = "ERRO"
    REPROCESSAMENTO= "REPROCESSAMENTO"
    ALTERACAO_MANUAL = "ALTERACAO_MANUAL"


# ── Grupo de Corretores ───────────────────────────────────────────────────────

class GrupoCorretor(Base):
    __tablename__ = "grupos_corretores"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    nome: Mapped[str] = mapped_column(String(200), unique=True, nullable=False, index=True)
    descricao: Mapped[str | None] = mapped_column(Text, nullable=True)
    limite_valor: Mapped[float] = mapped_column(Float, default=0.0)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    atualizado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    corretores = relationship("Corretor", back_populates="grupo")


# ── Corretor ─────────────────────────────────────────────────────────────────

class Corretor(Base):
    __tablename__ = "corretores"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    nome: Mapped[str] = mapped_column(String(200), nullable=False)
    cpf: Mapped[str] = mapped_column(String(14), unique=True, nullable=False, index=True)
    email: Mapped[str | None] = mapped_column(String(200), nullable=True, index=True)
    telefone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    codigo_externo: Mapped[str | None] = mapped_column(String(50), unique=True, nullable=True)
    grupo_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("grupos_corretores.id"), nullable=True)
    limite_valor_diario: Mapped[float] = mapped_column(Float, default=0.0)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True)
    metadados: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    atualizado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    grupo = relationship("GrupoCorretor", back_populates="corretores")
    propostas = relationship("Proposta", back_populates="corretor")
    contatos = relationship("ContatoCorretor", back_populates="corretor", cascade="all, delete-orphan")


# ── Contato de Corretor ───────────────────────────────────────────────────────

class TipoContato(str, PyEnum):
    EMAIL    = "EMAIL"
    TELEFONE = "TELEFONE"


class ContatoCorretor(Base):
    __tablename__ = "contatos_corretores"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    corretor_id: Mapped[str] = mapped_column(String(36), ForeignKey("corretores.id"), nullable=False, index=True)
    tipo: Mapped[str] = mapped_column(Enum(TipoContato, name="tipo_contato"), nullable=False)
    valor: Mapped[str] = mapped_column(String(200), nullable=False)
    principal: Mapped[bool] = mapped_column(Boolean, default=False)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    corretor = relationship("Corretor", back_populates="contatos")


# ── Proposta ─────────────────────────────────────────────────────────────────

class Proposta(Base):
    __tablename__ = "propostas"
    __table_args__ = (
        UniqueConstraint("proposta_id_externo", name="uq_proposta_id_externo"),
        Index("ix_propostas_status", "status"),
        Index("ix_propostas_cpf_cliente", "cpf_cliente"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)

    # Chave de idempotência — nunca duplicar envio ao banco
    proposta_id_externo: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)

    corretor_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("corretores.id"), nullable=True)
    cpf_cliente: Mapped[str] = mapped_column(String(14), nullable=False)
    nome_cliente: Mapped[str | None] = mapped_column(String(200), nullable=True)
    uf_cliente: Mapped[str | None] = mapped_column(String(2), nullable=True)
    banco: Mapped[str] = mapped_column(String(100), nullable=False)
    convenio: Mapped[str | None] = mapped_column(String(100), nullable=True)
    produto: Mapped[str | None] = mapped_column(String(100), nullable=True)
    valor: Mapped[float] = mapped_column(Float, nullable=False)

    status: Mapped[str] = mapped_column(
        Enum(StatusProposta, name="status_proposta"),
        default=StatusProposta.ENFILEIRADA,
        nullable=False,
    )

    # Motor antifraude
    score_fraude: Mapped[int | None] = mapped_column(Integer, nullable=True)
    resultado_motor: Mapped[str | None] = mapped_column(String(20), nullable=True)
    decisao_detalhes: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Dados brutos da proposta (flexível)
    payload_original: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Resposta do banco
    resposta_banco: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    id_operacao_banco: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Controle
    tentativas: Mapped[int] = mapped_column(Integer, default=0)
    ultimo_erro: Mapped[str | None] = mapped_column(Text, nullable=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
    atualizado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    corretor = relationship("Corretor", back_populates="propostas")
    auditoria = relationship("AuditoriaLog", back_populates="proposta", order_by="AuditoriaLog.timestamp")


# ── Regra Antifraude ─────────────────────────────────────────────────────────

class RegraAntifraude(Base):
    __tablename__ = "regras_antifraude"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    nome: Mapped[str] = mapped_column(String(200), nullable=False)
    descricao: Mapped[str | None] = mapped_column(Text, nullable=True)
    tipo: Mapped[str] = mapped_column(
        Enum(TipoRegra, name="tipo_regra"),
        nullable=False,
    )
    # Parâmetros da regra em JSON — ex: {"valor_maximo": 50000, "convenios": ["INSS"]}
    parametros: Mapped[dict] = mapped_column(JSONB, nullable=False)
    # Score adicionado ao score de risco quando a regra dispara
    peso_score: Mapped[int] = mapped_column(Integer, default=0)
    # Se True, bloqueia imediatamente (resultado=BLOQUEADO)
    bloqueante: Mapped[bool] = mapped_column(Boolean, default=False)
    prioridade: Mapped[int] = mapped_column(Integer, default=100)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True)
    versao: Mapped[int] = mapped_column(Integer, default=1)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    atualizado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


# ── Blacklist ─────────────────────────────────────────────────────────────────

class TipoBlacklist(str, PyEnum):
    CPF      = "CPF"
    CNPJ     = "CNPJ"
    TELEFONE = "TELEFONE"
    EMAIL    = "EMAIL"


class Blacklist(Base):
    __tablename__ = "blacklist"
    __table_args__ = (
        UniqueConstraint("tipo", "valor", name="uq_blacklist_tipo_valor"),
        Index("ix_blacklist_valor", "valor"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    tipo: Mapped[str] = mapped_column(
        Enum(TipoBlacklist, name="tipo_blacklist"), nullable=False, index=True
    )
    valor: Mapped[str] = mapped_column(String(200), nullable=False)
    motivo: Mapped[str] = mapped_column(Text, nullable=False)
    fonte: Mapped[str | None] = mapped_column(String(200), nullable=True)
    adicionado_por: Mapped[str | None] = mapped_column(String(100), nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


# ── Auditoria (append-only, NUNCA alterar registros) ─────────────────────────

class AuditoriaLog(Base):
    __tablename__ = "auditoria_logs"
    __table_args__ = (
        Index("ix_auditoria_proposta_id", "proposta_id"),
        Index("ix_auditoria_timestamp", "timestamp"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    proposta_id: Mapped[str] = mapped_column(String(36), ForeignKey("propostas.id"), nullable=False)
    evento: Mapped[str] = mapped_column(
        Enum(TipoEvento, name="tipo_evento"),
        nullable=False,
    )
    dados: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    usuario: Mapped[str | None] = mapped_column(String(100), nullable=True)
    ip_origem: Mapped[str | None] = mapped_column(String(45), nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)

    proposta = relationship("Proposta", back_populates="auditoria")


# ── Usuário ──────────────────────────────────────────────────────────────────

class PerfilUsuario(str, PyEnum):
    ADMIN    = "admin"
    GESTOR   = "gestor"
    ANALISTA = "analista"
    OPERADOR = "operador"


class Usuario(Base):
    __tablename__ = "usuarios"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(200), unique=True, nullable=False, index=True)
    username: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    nome: Mapped[str] = mapped_column(String(200), nullable=False)
    cargo: Mapped[str | None] = mapped_column(String(100), nullable=True)
    perfil: Mapped[str] = mapped_column(
        Enum(PerfilUsuario, name="perfil_usuario"),
        default=PerfilUsuario.OPERADOR,
        nullable=False,
    )
    senha_hash: Mapped[str] = mapped_column(String(200), nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    atualizado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


# ── Layout de Importação ─────────────────────────────────────────────────────

class TipoLayout(str, PyEnum):
    PROPOSTA  = "PROPOSTA"
    CORRETOR  = "CORRETOR"


class LayoutImportacao(Base):
    __tablename__ = "layouts_importacao"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    nome: Mapped[str] = mapped_column(String(200), nullable=False)
    descricao: Mapped[str | None] = mapped_column(Text, nullable=True)
    tipo: Mapped[str] = mapped_column(Enum(TipoLayout, name="tipo_layout"), nullable=False)
    separador: Mapped[str] = mapped_column(String(5), default=",")
    encoding: Mapped[str] = mapped_column(String(20), default="utf-8")
    tem_cabecalho: Mapped[bool] = mapped_column(Boolean, default=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    atualizado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    mapeamentos = relationship("MapeamentoDados", back_populates="layout", cascade="all, delete-orphan")
    importacoes = relationship("ImportacaoProposta", back_populates="layout")


class MapeamentoDados(Base):
    __tablename__ = "mapeamentos_dados"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    layout_id: Mapped[str] = mapped_column(String(36), ForeignKey("layouts_importacao.id"), nullable=False, index=True)
    coluna_origem: Mapped[str] = mapped_column(String(100), nullable=False)
    campo_destino: Mapped[str] = mapped_column(String(100), nullable=False)
    transformacao: Mapped[str | None] = mapped_column(String(50), nullable=True)
    obrigatorio: Mapped[bool] = mapped_column(Boolean, default=False)
    valor_padrao: Mapped[str | None] = mapped_column(String(200), nullable=True)
    ordem: Mapped[int] = mapped_column(Integer, default=0)

    layout = relationship("LayoutImportacao", back_populates="mapeamentos")


# ── Importações ───────────────────────────────────────────────────────────────

class StatusImportacao(str, PyEnum):
    PENDENTE    = "PENDENTE"
    PROCESSANDO = "PROCESSANDO"
    CONCLUIDO   = "CONCLUIDO"
    ERRO        = "ERRO"


class ImportacaoProposta(Base):
    __tablename__ = "importacoes_propostas"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    layout_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("layouts_importacao.id"), nullable=True)
    arquivo_nome: Mapped[str] = mapped_column(String(300), nullable=False)
    total_linhas: Mapped[int] = mapped_column(Integer, default=0)
    processadas: Mapped[int] = mapped_column(Integer, default=0)
    sucesso: Mapped[int] = mapped_column(Integer, default=0)
    erro: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(Enum(StatusImportacao, name="status_importacao"), default=StatusImportacao.PENDENTE)
    log_erros: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    criado_por: Mapped[str | None] = mapped_column(String(100), nullable=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
    concluido_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    layout = relationship("LayoutImportacao", back_populates="importacoes")


class ImportacaoCorretor(Base):
    __tablename__ = "importacoes_corretores"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    arquivo_nome: Mapped[str] = mapped_column(String(300), nullable=False)
    total_linhas: Mapped[int] = mapped_column(Integer, default=0)
    sucesso: Mapped[int] = mapped_column(Integer, default=0)
    erro: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="PENDENTE")
    log_erros: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    criado_por: Mapped[str | None] = mapped_column(String(100), nullable=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    concluido_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


# ── Averbação ─────────────────────────────────────────────────────────────────

class StatusAverbacao(str, PyEnum):
    PENDENTE   = "PENDENTE"
    AVERBADO   = "AVERBADO"
    ERRO       = "ERRO"
    CANCELADO  = "CANCELADO"


class Averbacao(Base):
    __tablename__ = "averbacoes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    proposta_id: Mapped[str] = mapped_column(String(36), ForeignKey("propostas.id"), nullable=False, index=True)
    banco: Mapped[str] = mapped_column(String(100), nullable=False)
    numero_operacao: Mapped[str | None] = mapped_column(String(100), nullable=True)
    status: Mapped[str] = mapped_column(Enum(StatusAverbacao, name="status_averbacao"), default=StatusAverbacao.PENDENTE)
    data_averbacao: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resposta_banco: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    observacao: Mapped[str | None] = mapped_column(Text, nullable=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    atualizado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    proposta = relationship("Proposta")


# ── Retorno de Banco ──────────────────────────────────────────────────────────

class TipoRetorno(str, PyEnum):
    APROVACAO   = "APROVACAO"
    REPROVACAO  = "REPROVACAO"
    PENDENCIA   = "PENDENCIA"
    CANCELAMENTO= "CANCELAMENTO"
    INFORMATIVO = "INFORMATIVO"


class RetornoBanco(Base):
    __tablename__ = "retornos_banco"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    proposta_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("propostas.id"), nullable=True, index=True)
    banco: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    tipo_retorno: Mapped[str] = mapped_column(Enum(TipoRetorno, name="tipo_retorno"), nullable=False)
    dados: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    processado: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    observacao: Mapped[str | None] = mapped_column(Text, nullable=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
    processado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    proposta = relationship("Proposta")


# ── Pendência ─────────────────────────────────────────────────────────────────

class TipoPendencia(str, PyEnum):
    DOCUMENTO  = "DOCUMENTO"
    ASSINATURA = "ASSINATURA"
    BANCO      = "BANCO"
    DADOS      = "DADOS"
    OUTROS     = "OUTROS"


class Pendencia(Base):
    __tablename__ = "pendencias"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    proposta_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("propostas.id"), nullable=True, index=True)
    tipo: Mapped[str] = mapped_column(Enum(TipoPendencia, name="tipo_pendencia"), nullable=False)
    descricao: Mapped[str] = mapped_column(Text, nullable=False)
    responsavel_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("usuarios.id"), nullable=True)
    prazo: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolvida: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    resolucao: Mapped[str | None] = mapped_column(Text, nullable=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
    resolvida_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    proposta = relationship("Proposta")
    responsavel = relationship("Usuario")


# ── Log de Acesso ─────────────────────────────────────────────────────────────

class LogAcesso(Base):
    __tablename__ = "logs_acesso"
    __table_args__ = (
        Index("ix_logs_acesso_timestamp", "timestamp"),
        Index("ix_logs_acesso_usuario_id", "usuario_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    usuario_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    username: Mapped[str | None] = mapped_column(String(100), nullable=True)
    metodo: Mapped[str] = mapped_column(String(10), nullable=False)
    endpoint: Mapped[str] = mapped_column(String(300), nullable=False)
    ip: Mapped[str | None] = mapped_column(String(45), nullable=True)
    status_code: Mapped[int] = mapped_column(Integer, nullable=False)
    duracao_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)


# ── Auditoria de Ações de Usuários ───────────────────────────────────────────

class NivelRisco(str, PyEnum):
    BAIXO = "BAIXO"
    MEDIO = "MEDIO"
    ALTO  = "ALTO"


class LogAuditoria(Base):
    """
    Trilha de auditoria completa de ações de usuários.
    Append-only — NUNCA alterar ou excluir registros.
    """
    __tablename__ = "logs_auditoria"
    __table_args__ = (
        Index("ix_logs_auditoria_criado_em",   "criado_em"),
        Index("ix_logs_auditoria_usuario_id",  "usuario_id"),
        Index("ix_logs_auditoria_risco",       "risco"),
        Index("ix_logs_auditoria_tipo_entidade", "tipo_entidade"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)

    # Quem fez — desnormalizado para preservar histórico mesmo se o usuário for excluído
    usuario_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("usuarios.id"), nullable=True)
    username:   Mapped[str | None] = mapped_column(String(100), nullable=True)
    nome:       Mapped[str | None] = mapped_column(String(200), nullable=True)
    perfil:     Mapped[str | None] = mapped_column(String(50),  nullable=True)

    # O que foi feito
    acao:          Mapped[str]      = mapped_column(String(300), nullable=False)
    tipo_entidade: Mapped[str | None] = mapped_column(String(50),  nullable=True)
    entidade_id:   Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Estado antes/depois da ação
    antes:  Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    depois: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Classificação
    risco: Mapped[str] = mapped_column(
        Enum(NivelRisco, name="nivel_risco"),
        nullable=False,
        default=NivelRisco.BAIXO,
    )

    # Origem
    ip:         Mapped[str | None] = mapped_column(String(45),  nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(500), nullable=True)
    origem:     Mapped[str]        = mapped_column(String(50),  nullable=False, default="web")

    # Resultado
    sucesso: Mapped[bool]      = mapped_column(Boolean, nullable=False, default=True)
    erro:    Mapped[str | None] = mapped_column(Text,   nullable=True)

    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)


# ── Convênio (catálogo de convênios reconhecidos) ────────────────────────────

class Convenio(Base):
    __tablename__ = "convenios"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    nome: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    banco: Mapped[str | None] = mapped_column(String(100), nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True)
    # True quando foi registrado automaticamente pelo motor (não pela equipe)
    auto_registrado: Mapped[bool] = mapped_column(Boolean, default=False)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


# ── Cache Titan (TTL controlado pela app) ────────────────────────────────────

class TitanCache(Base):
    __tablename__ = "titan_cache"

    endpoint: Mapped[str] = mapped_column(String(200), primary_key=True)
    dados: Mapped[dict] = mapped_column(JSONB, nullable=False)
    cached_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    expira_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
