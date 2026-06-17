"""
Modelos de banco de dados — PostgreSQL com JSONB para dados dinâmicos.
Todos usam UUID como PK para evitar colisões em ambiente distribuído.
"""

import uuid
from datetime import datetime
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
    return datetime.utcnow()


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


# ── Corretor ─────────────────────────────────────────────────────────────────

class Corretor(Base):
    __tablename__ = "corretores"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    nome: Mapped[str] = mapped_column(String(200), nullable=False)
    cpf: Mapped[str] = mapped_column(String(14), unique=True, nullable=False, index=True)
    codigo_externo: Mapped[str | None] = mapped_column(String(50), unique=True, nullable=True)
    limite_valor_diario: Mapped[float] = mapped_column(Float, default=0.0)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True)
    metadados: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime, default=_now)
    atualizado_em: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)

    propostas = relationship("Proposta", back_populates="corretor")


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
    criado_em: Mapped[datetime] = mapped_column(DateTime, default=_now, index=True)
    atualizado_em: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)

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
    criado_em: Mapped[datetime] = mapped_column(DateTime, default=_now)
    atualizado_em: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)


# ── Blacklist ─────────────────────────────────────────────────────────────────

class Blacklist(Base):
    __tablename__ = "blacklist"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    cpf: Mapped[str] = mapped_column(String(14), unique=True, nullable=False, index=True)
    motivo: Mapped[str] = mapped_column(Text, nullable=False)
    adicionado_por: Mapped[str | None] = mapped_column(String(100), nullable=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime, default=_now)


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
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=_now, nullable=False)

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
    criado_em: Mapped[datetime] = mapped_column(DateTime, default=_now)
    atualizado_em: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)


# ── Cache Titan (TTL controlado pela app) ────────────────────────────────────

class TitanCache(Base):
    __tablename__ = "titan_cache"

    endpoint: Mapped[str] = mapped_column(String(200), primary_key=True)
    dados: Mapped[dict] = mapped_column(JSONB, nullable=False)
    cached_em: Mapped[datetime] = mapped_column(DateTime, default=_now)
    expira_em: Mapped[datetime] = mapped_column(DateTime, nullable=False)
