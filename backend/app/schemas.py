from datetime import datetime
from typing import Optional

from pydantic import BaseModel


# ---------------------------------------------------------------------------
# Grupo
# ---------------------------------------------------------------------------

class GrupoBase(BaseModel):
    nome: str
    limite: float


class GrupoCreate(GrupoBase):
    pass


class GrupoResponse(GrupoBase):
    id: int

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Corretor
# ---------------------------------------------------------------------------

class CorretorBase(BaseModel):
    nome: str
    cpf: str
    grupo_id: Optional[int] = None


class CorretorCreate(CorretorBase):
    pass


class CorretorResponse(CorretorBase):
    id: int
    grupo: Optional[GrupoResponse] = None

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Convenio
# ---------------------------------------------------------------------------

class ConvenioBase(BaseModel):
    nome: str
    banco: str
    ativo: bool = True


class ConvenioCreate(ConvenioBase):
    pass


class ConvenioResponse(ConvenioBase):
    id: int

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Blacklist
# ---------------------------------------------------------------------------

class BlacklistBase(BaseModel):
    cpf: str
    motivo: str


class BlacklistCreate(BlacklistBase):
    pass


class BlacklistResponse(BlacklistBase):
    id: int
    criado_em: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# RegraGrupo
# ---------------------------------------------------------------------------

class RegraGrupoBase(BaseModel):
    grupo_id: int
    descricao: str


class RegraGrupoCreate(RegraGrupoBase):
    pass


class RegraGrupoResponse(RegraGrupoBase):
    id: int

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Proposta
# ---------------------------------------------------------------------------

class PropostaBase(BaseModel):
    cpf_cliente: str
    banco: str
    valor: float
    corretor_id: Optional[int] = None
    convenio: Optional[str] = None
    observacao: Optional[str] = None


class PropostaCreate(PropostaBase):
    pass


class PropostaResponse(PropostaBase):
    id: int
    status: str
    data: datetime
    corretor: Optional[CorretorResponse] = None

    model_config = {"from_attributes": True}


class PropostaStatusUpdate(BaseModel):
    status: str
    observacao: Optional[str] = None


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    username: str
    nome: str
    cargo: str
    role: str


class UserResponse(BaseModel):
    id: int
    username: str
    email: Optional[str] = None
    nome: str
    cargo: str
    role: str
    ativo: bool

    model_config = {"from_attributes": True}


class UserCreate(BaseModel):
    username: str
    email: Optional[str] = None
    password: str
    nome: str
    role: str = "OPERADOR"


class UserUpdate(BaseModel):
    nome: Optional[str] = None
    email: Optional[str] = None
    cargo: Optional[str] = None
    role: Optional[str] = None
    password: Optional[str] = None


# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

class StatusCount(BaseModel):
    status: str
    quantidade: int
    valor_total: float
