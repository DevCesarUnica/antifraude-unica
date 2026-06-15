"""
Script de seed para popular o banco com dados mock realistas.
Idempotente: verifica existencia antes de inserir.

Uso: python seed.py  (a partir da pasta backend/)
"""

from __future__ import annotations

import hashlib
import os
import sqlite3
import sys
from datetime import datetime, timedelta
import random

# Resolve imports do pacote app a partir da pasta backend/
sys.path.insert(0, os.path.dirname(__file__))

# Migração: adiciona colunas email e role se não existirem
_db_path = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "antifraude.db"))
if os.path.exists(_db_path):
    _conn = sqlite3.connect(_db_path)
    _cur = _conn.cursor()
    _cols = [r[1] for r in _cur.execute("PRAGMA table_info(users)").fetchall()]
    if "email" not in _cols:
        _cur.execute("ALTER TABLE users ADD COLUMN email TEXT")
        _cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email ON users(email)")
    if "role" not in _cols:
        _cur.execute("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'OPERADOR'")
    _conn.commit()
    _conn.close()

from app.database import SessionLocal, engine
from app import models
from app.services.regras import processar_proposta

# Cria as tabelas caso nao existam
models.Base.metadata.create_all(bind=engine)

db = SessionLocal()

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_or_create_grupo(nome: str, limite: float) -> models.Grupo:
    obj = db.query(models.Grupo).filter(models.Grupo.nome == nome).first()
    if not obj:
        obj = models.Grupo(nome=nome, limite=limite)
        db.add(obj)
        db.flush()
    return obj


def get_or_create_corretor(nome: str, cpf: str, grupo_id: int) -> models.Corretor:
    obj = db.query(models.Corretor).filter(models.Corretor.cpf == cpf).first()
    if not obj:
        obj = models.Corretor(nome=nome, cpf=cpf, grupo_id=grupo_id)
        db.add(obj)
        db.flush()
    return obj


def get_or_create_convenio(nome: str, banco: str) -> models.Convenio:
    obj = db.query(models.Convenio).filter(models.Convenio.nome == nome).first()
    if not obj:
        obj = models.Convenio(nome=nome, banco=banco, ativo=True)
        db.add(obj)
        db.flush()
    return obj


def get_or_create_blacklist(cpf: str, motivo: str) -> models.Blacklist:
    obj = db.query(models.Blacklist).filter(models.Blacklist.cpf == cpf).first()
    if not obj:
        obj = models.Blacklist(cpf=cpf, motivo=motivo)
        db.add(obj)
        db.flush()
    return obj


def proposta_existe(cpf_cliente: str, valor: float, banco: str) -> bool:
    return (
        db.query(models.Proposta)
        .filter(
            models.Proposta.cpf_cliente == cpf_cliente,
            models.Proposta.valor == valor,
            models.Proposta.banco == banco,
        )
        .first()
        is not None
    )


def criar_proposta(
    cpf_cliente: str,
    banco: str,
    valor: float,
    corretor_id: int | None,
    convenio: str | None,
    data_offset_days: int = 0,
    status_override: str | None = None,
    observacao: str | None = None,
) -> models.Proposta:
    if proposta_existe(cpf_cliente, valor, banco):
        return None

    p = models.Proposta(
        cpf_cliente=cpf_cliente,
        banco=banco,
        valor=valor,
        corretor_id=corretor_id,
        convenio=convenio,
        data=datetime.utcnow() - timedelta(days=data_offset_days),
        observacao=observacao,
    )
    db.add(p)
    db.flush()

    if status_override:
        p.status = status_override
    else:
        p.status = processar_proposta(p, db)

    return p


def get_or_create_user(username: str, password: str, nome: str, cargo: str, role: str, email: str = None) -> models.User:
    obj = db.query(models.User).filter(models.User.username == username).first()
    if not obj:
        obj = models.User(
            username=username,
            email=email,
            password_hash=hashlib.sha256(password.encode("utf-8")).hexdigest(),
            nome=nome,
            cargo=cargo,
            role=role,
        )
        db.add(obj)
        db.flush()
    else:
        obj.role = role
        obj.cargo = cargo
        if email and not obj.email:
            obj.email = email
    return obj


# ---------------------------------------------------------------------------
# Usuários
# ---------------------------------------------------------------------------
print("Inserindo usuários...")
get_or_create_user("admin",  "admin123",  "Administrador",  "Administrador", "ADMIN",     "admin@unicapromotora.com.br")
get_or_create_user("cesar",  "cesar123",  "César Barros",   "Gestor",        "GESTOR",    "cesar@unicapromotora.com.br")
get_or_create_user("leo",    "leo123",    "Leonardo Silva", "Analista",      "ANALISTA",  "leo@unicapromotora.com.br")
get_or_create_user("julia",  "julia123",  "Julia Santos",   "Analista",      "ANALISTA",  "julia@unicapromotora.com.br")
get_or_create_user("sergio", "sergio123", "Sergio Oliveira","Operador",      "OPERADOR",  "sergio@unicapromotora.com.br")
db.commit()

# ---------------------------------------------------------------------------
# Grupos
# ---------------------------------------------------------------------------
print("Inserindo grupos...")
grupo_a = get_or_create_grupo("Grupo A", 5000.0)
grupo_b = get_or_create_grupo("Grupo B", 10000.0)
grupo_c = get_or_create_grupo("Grupo C", 20000.0)
grupo_d = get_or_create_grupo("Grupo D", 80000.0)
db.commit()

# ---------------------------------------------------------------------------
# Corretores
# ---------------------------------------------------------------------------
print("Inserindo corretores...")
c_cesar    = get_or_create_corretor("Cesar Barros",    "111.111.111-11", grupo_c.id)
c_leo      = get_or_create_corretor("Leonardo Silva",  "222.222.222-22", grupo_b.id)
c_julia    = get_or_create_corretor("Julia Santos",    "333.333.333-33", grupo_d.id)
c_sergio   = get_or_create_corretor("Sergio Oliveira", "444.444.444-44", grupo_a.id)
c_marcos   = get_or_create_corretor("Marcos Pereira",  "555.555.555-55", grupo_b.id)
c_fernanda = get_or_create_corretor("Fernanda Costa",  "666.666.666-66", grupo_c.id)
db.commit()

# ---------------------------------------------------------------------------
# Convenios
# ---------------------------------------------------------------------------
print("Inserindo convenios...")
get_or_create_convenio("INSS",    "BMG")
get_or_create_convenio("FGTS",    "Caixa")
get_or_create_convenio("SIAPE",   "Bradesco")
get_or_create_convenio("Privado", "Itau")
get_or_create_convenio("Marinha", "BV")
get_or_create_convenio("Exercito","BMG")
db.commit()

# ---------------------------------------------------------------------------
# Blacklist
# ---------------------------------------------------------------------------
print("Inserindo blacklist...")
get_or_create_blacklist("999.999.999-99", "Fraude confirmada")
get_or_create_blacklist("888.888.888-88", "Documentos falsos")
get_or_create_blacklist("777.777.777-77", "CPF suspeito")
db.commit()

# ---------------------------------------------------------------------------
# Propostas
# ---------------------------------------------------------------------------
print("Inserindo propostas...")

bancos = ["BMG", "Bradesco", "Itau", "Caixa Economica", "BV Financeira"]

# 4 com CPF na blacklist -> PENDENTE (regra automatica)
criar_proposta("999.999.999-99", "BMG",           8500.0,  c_cesar.id,    "INSS",       30)
criar_proposta("888.888.888-88", "Bradesco",       3200.0,  c_leo.id,      "SIAPE",      28)
criar_proposta("777.777.777-77", "Caixa Economica",15000.0, c_julia.id,    "FGTS",       25)
criar_proposta("999.999.999-99", "BV Financeira",  22000.0, c_fernanda.id, "Marinha",    20)

# 3 com convenio desconhecido -> NAO_MAPEADA (regra automatica)
criar_proposta("100.200.300-40", "BMG",            4500.0,  c_sergio.id,   "Desconhecido", 18)
criar_proposta("101.202.303-40", "Bradesco",        9800.0,  c_marcos.id,   "Desconhecido", 15)
criar_proposta("102.203.304-40", "Itau",           18000.0,  c_cesar.id,    "Desconhecido", 12)

# 6 com valor <= limite do grupo -> APROVADA (regra automatica)
# Grupo A limite=5000  (sergio)
criar_proposta("200.300.400-50", "BMG",            2500.0,  c_sergio.id,   "INSS",       14)
criar_proposta("201.301.401-50", "Caixa Economica",4800.0,  c_sergio.id,   "FGTS",       13)
# Grupo B limite=10000 (leo/marcos)
criar_proposta("202.302.402-50", "Bradesco",        7500.0,  c_leo.id,      "SIAPE",      12)
criar_proposta("203.303.403-50", "Itau",            9999.0,  c_marcos.id,   "Privado",    11)
# Grupo C limite=20000 (cesar/fernanda)
criar_proposta("204.304.404-50", "BV Financeira",  18000.0,  c_cesar.id,    "Marinha",    10)
criar_proposta("205.305.405-50", "BMG",            19500.0,  c_fernanda.id, "Exercito",    9)

# 8 com valor > limite do grupo -> ANALISAR (regra automatica)
criar_proposta("300.400.500-60", "BMG",             6000.0,  c_sergio.id,   "INSS",        8)
criar_proposta("301.401.501-60", "Bradesco",        11000.0,  c_leo.id,      "SIAPE",       7)
criar_proposta("302.402.502-60", "Itau",            12000.0,  c_marcos.id,   "Privado",     7)
criar_proposta("303.403.503-60", "Caixa Economica", 25000.0,  c_cesar.id,    "FGTS",        6)
criar_proposta("304.404.504-60", "BV Financeira",   30000.0,  c_fernanda.id, "Marinha",     6)
criar_proposta("305.405.505-60", "BMG",             35000.0,  c_julia.id,    "Exercito",    5)
criar_proposta("306.406.506-60", "Bradesco",        42000.0,  c_leo.id,      "INSS",        5)
criar_proposta("307.407.507-60", "Itau",            55000.0,  c_marcos.id,   "SIAPE",       4)

# 3 status ANALISAR_DOCUMENTO (override manual)
criar_proposta("400.500.600-70", "BMG",            13000.0,  c_cesar.id,    "INSS",        4,
               status_override="ANALISAR_DOCUMENTO",
               observacao="Aguardando RG e comprovante de renda")
criar_proposta("401.501.601-70", "Bradesco",        28000.0,  c_julia.id,    "SIAPE",       3,
               status_override="ANALISAR_DOCUMENTO",
               observacao="Foto do documento ilegivel")
criar_proposta("402.502.602-70", "Caixa Economica", 6500.0,  c_sergio.id,   "FGTS",        3,
               status_override="ANALISAR_DOCUMENTO",
               observacao="Comprovante de endereco desatualizado")

# 2 status APROVAR (override manual)
criar_proposta("500.600.700-80", "BV Financeira",  17000.0,  c_fernanda.id, "Marinha",     2,
               status_override="APROVAR",
               observacao="Aprovado pelo gestor apos analise")
criar_proposta("501.601.701-80", "BMG",            45000.0,  c_julia.id,    "Exercito",    2,
               status_override="APROVAR",
               observacao="Cliente VIP - aprovacao direta")

# 2 status AGENDADA (override manual)
criar_proposta("600.700.800-90", "Bradesco",        8200.0,  c_leo.id,      "INSS",        1,
               status_override="AGENDADA",
               observacao="Assinatura agendada para 14/06/2026")
criar_proposta("601.701.801-90", "Itau",           21000.0,  c_cesar.id,    "Privado",     1,
               status_override="AGENDADA",
               observacao="Assinatura agendada para 15/06/2026")

# 1 status PENDENCIA_REGULARIZADA (override manual)
criar_proposta("700.800.900-01", "Caixa Economica",11500.0,  c_marcos.id,   "FGTS",        1,
               status_override="PENDENCIA_REGULARIZADA",
               observacao="Pendencia de documento resolvida pelo cliente")

# 1 status AGUARDANDO_BANCO (override manual)
criar_proposta("800.900.000-02", "BV Financeira",  38000.0,  c_julia.id,    "Marinha",     0,
               status_override="AGUARDANDO_BANCO",
               observacao="Enviada ao banco, aguardando retorno")

db.commit()
print("Seed concluido com sucesso!")

# Resumo
from sqlalchemy import func

resumo = (
    db.query(models.Proposta.status, func.count(models.Proposta.id))
    .group_by(models.Proposta.status)
    .all()
)
print("\nResumo por status:")
for status, qtd in sorted(resumo):
    print(f"  {status:<30} {qtd} proposta(s)")

db.close()
