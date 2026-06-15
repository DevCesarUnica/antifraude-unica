"""
Schemas Pydantic — validação de entrada e serialização de saída.
"""

from __future__ import annotations
from datetime import datetime
from typing import Any
from pydantic import BaseModel, field_validator


# ── Proposta ─────────────────────────────────────────────────────────────────

class PropostaCreate(BaseModel):
    proposta_id_externo: str
    corretor_id: str | None = None
    cpf_cliente: str
    nome_cliente: str | None = None
    uf_cliente: str | None = None
    banco: str
    convenio: str | None = None
    produto: str | None = None
    valor: float
    payload_original: dict[str, Any] | None = None

    @field_validator("valor")
    @classmethod
    def valor_positivo(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("Valor deve ser positivo")
        return v

    @field_validator("cpf_cliente")
    @classmethod
    def cpf_apenas_digitos(cls, v: str) -> str:
        digits = v.replace(".", "").replace("-", "").replace("/", "")
        if not digits.isdigit() or len(digits) not in (11, 14):
            raise ValueError("CPF/CNPJ inválido")
        return digits


class PropostaOut(BaseModel):
    id: str
    proposta_id_externo: str
    corretor_id: str | None
    cpf_cliente: str
    nome_cliente: str | None
    uf_cliente: str | None
    banco: str
    convenio: str | None
    produto: str | None
    valor: float
    status: str
    score_fraude: int | None
    resultado_motor: str | None
    decisao_detalhes: dict | None
    tentativas: int
    ultimo_erro: str | None
    criado_em: datetime
    atualizado_em: datetime

    model_config = {"from_attributes": True}


class PropostaSummary(BaseModel):
    total: int
    enfileiradas: int
    em_analise: int
    aprovadas: int
    reprovadas: int
    bloqueadas: int
    analise_manual: int
    enviadas_banco: int
    confirmadas_banco: int
    erro: int


# ── Regra Antifraude ─────────────────────────────────────────────────────────

class RegraCreate(BaseModel):
    nome: str
    descricao: str | None = None
    tipo: str
    parametros: dict[str, Any]
    peso_score: int = 0
    bloqueante: bool = False
    prioridade: int = 100
    ativo: bool = True


class RegraUpdate(BaseModel):
    nome: str | None = None
    descricao: str | None = None
    parametros: dict[str, Any] | None = None
    peso_score: int | None = None
    bloqueante: bool | None = None
    prioridade: int | None = None
    ativo: bool | None = None


class RegraOut(BaseModel):
    id: str
    nome: str
    descricao: str | None
    tipo: str
    parametros: dict
    peso_score: int
    bloqueante: bool
    prioridade: int
    ativo: bool
    versao: int
    criado_em: datetime
    atualizado_em: datetime

    model_config = {"from_attributes": True}


# ── Corretor ─────────────────────────────────────────────────────────────────

class CorretorCreate(BaseModel):
    nome: str
    cpf: str
    codigo_externo: str | None = None
    limite_valor_diario: float = 0.0


class CorretorOut(BaseModel):
    id: str
    nome: str
    cpf: str
    codigo_externo: str | None
    limite_valor_diario: float
    ativo: bool
    criado_em: datetime

    model_config = {"from_attributes": True}


# ── Blacklist ─────────────────────────────────────────────────────────────────

class BlacklistAdd(BaseModel):
    cpf: str
    motivo: str


class BlacklistOut(BaseModel):
    id: str
    cpf: str
    motivo: str
    adicionado_por: str | None
    criado_em: datetime

    model_config = {"from_attributes": True}


# ── Auditoria ─────────────────────────────────────────────────────────────────

class AuditoriaOut(BaseModel):
    id: str
    proposta_id: str
    evento: str
    dados: dict | None
    usuario: str | None
    ip_origem: str | None
    timestamp: datetime

    model_config = {"from_attributes": True}


# ── Auth / Usuário ────────────────────────────────────────────────────────────

class UsuarioCreate(BaseModel):
    email: str
    nome: str
    senha: str
    perfil: str = "operador"


class UsuarioOut(BaseModel):
    id: str
    email: str
    nome: str
    perfil: str
    ativo: bool

    model_config = {"from_attributes": True}


class LoginRequest(BaseModel):
    email: str
    senha: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    usuario: UsuarioOut


# ── Titan ─────────────────────────────────────────────────────────────────────

class TitanStatusOut(BaseModel):
    circuit_breaker: str
    estado: str


# ── Genérico ──────────────────────────────────────────────────────────────────

class Mensagem(BaseModel):
    mensagem: str
