from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, nullable=False)
    email = Column(String, unique=True, nullable=True, index=True)
    password_hash = Column(String, nullable=False)
    nome = Column(String, nullable=False)
    cargo = Column(String, default="Operador", nullable=False)
    role = Column(String, default="OPERADOR", nullable=False)
    token = Column(String, nullable=True, unique=True)
    ativo = Column(Boolean, default=True, nullable=False)


class Grupo(Base):
    __tablename__ = "grupos"

    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String, unique=True, nullable=False)
    limite = Column(Float, nullable=False)

    corretores = relationship("Corretor", back_populates="grupo")
    regras = relationship("RegraGrupo", back_populates="grupo")


class Corretor(Base):
    __tablename__ = "corretores"

    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String, nullable=False)
    cpf = Column(String, unique=True, nullable=False)
    grupo_id = Column(Integer, ForeignKey("grupos.id"), nullable=True)

    grupo = relationship("Grupo", back_populates="corretores")
    propostas = relationship("Proposta", back_populates="corretor")


class Convenio(Base):
    __tablename__ = "convenios"

    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String, unique=True, nullable=False)
    banco = Column(String, nullable=False)
    ativo = Column(Boolean, default=True, nullable=False)


class Blacklist(Base):
    __tablename__ = "blacklist"

    id = Column(Integer, primary_key=True, index=True)
    cpf = Column(String, unique=True, nullable=False)
    motivo = Column(String, nullable=False)
    criado_em = Column(DateTime, default=datetime.utcnow, nullable=False)


class RegraGrupo(Base):
    __tablename__ = "regras_grupo"

    id = Column(Integer, primary_key=True, index=True)
    grupo_id = Column(Integer, ForeignKey("grupos.id"), nullable=False)
    descricao = Column(String, nullable=False)

    grupo = relationship("Grupo", back_populates="regras")


class Proposta(Base):
    __tablename__ = "propostas"

    id = Column(Integer, primary_key=True, index=True)
    cpf_cliente = Column(String, nullable=False)
    banco = Column(String, nullable=False)
    valor = Column(Float, nullable=False)
    status = Column(String, default="ANALISAR", nullable=False)
    corretor_id = Column(Integer, ForeignKey("corretores.id"), nullable=True)
    convenio = Column(String, nullable=True)
    data = Column(DateTime, default=datetime.utcnow, nullable=False)
    observacao = Column(String, nullable=True)

    corretor = relationship("Corretor", back_populates="propostas")
