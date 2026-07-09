"""
Router Blacklist — CRUD de CPF, CNPJ, telefone e e-mail bloqueados.
"""

import csv
import io
import re
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Blacklist, Usuario
from app.routers.auth import verificar_token

router = APIRouter(prefix="/blacklist", tags=["blacklist"])


# ── Dependência de DB ─────────────────────────────────────────────────────────

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _normalizar(valor: str, tipo: str) -> str:
    v = valor.strip()
    if tipo in ("CPF", "CNPJ", "TELEFONE"):
        v = re.sub(r"\D", "", v)
    return v


def _to_dict(e: Blacklist) -> dict[str, Any]:
    return {
        "id": e.id,
        "tipo": e.tipo,
        "valor": e.valor,
        "motivo": e.motivo,
        "fonte": e.fonte,
        "adicionado_por": e.adicionado_por,
        "ativo": e.ativo,
        "criado_em": e.criado_em.isoformat() if e.criado_em else None,
    }


# ── Schemas ───────────────────────────────────────────────────────────────────

class EntradaBody(BaseModel):
    tipo: str
    valor: str
    motivo: str
    fonte: str | None = None
    adicionado_por: str | None = None


class CheckBody(BaseModel):
    tipo: str
    valor: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/")
def listar(
    pagina: int = Query(1, ge=1),
    limite: int = Query(20, ge=1, le=200),
    tipo: str | None = None,
    busca: str | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(Blacklist).filter(Blacklist.ativo == True)  # noqa: E712
    if tipo:
        q = q.filter(Blacklist.tipo == tipo.upper())
    if busca:
        q = q.filter(Blacklist.valor.ilike(f"%{busca}%"))
    total = q.count()
    items = q.order_by(Blacklist.criado_em.desc()).offset((pagina - 1) * limite).limit(limite).all()
    return {"total": total, "pagina": pagina, "items": [_to_dict(i) for i in items]}


@router.post("/check")
def verificar(body: CheckBody, db: Session = Depends(get_db)):
    valor = _normalizar(body.valor, body.tipo.upper())
    entry = db.query(Blacklist).filter(
        Blacklist.tipo == body.tipo.upper(),
        Blacklist.valor == valor,
        Blacklist.ativo == True,  # noqa: E712
    ).first()
    return {"bloqueado": entry is not None, "motivo": entry.motivo if entry else None}


@router.post("/", status_code=201)
def criar(body: EntradaBody, db: Session = Depends(get_db)):
    tipo = body.tipo.upper()
    valor = _normalizar(body.valor, tipo)
    if not valor:
        raise HTTPException(status_code=422, detail="Valor não pode ser vazio.")
    existing = db.query(Blacklist).filter(Blacklist.tipo == tipo, Blacklist.valor == valor).first()
    if existing:
        if not existing.ativo:
            existing.ativo = True
            existing.motivo = body.motivo
            existing.fonte = body.fonte
            db.commit()
            db.refresh(existing)
            return _to_dict(existing)
        raise HTTPException(status_code=409, detail=f"{tipo} já está na blacklist.")
    entry = Blacklist(
        tipo=tipo,
        valor=valor,
        motivo=body.motivo,
        fonte=body.fonte,
        adicionado_por=body.adicionado_por,
        ativo=True,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return _to_dict(entry)


@router.delete("/{entry_id}")
def remover(
    entry_id: str,
    db: Session = Depends(get_db),
    _: Usuario = Depends(verificar_token),
):
    entry = db.query(Blacklist).filter(Blacklist.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entrada não encontrada.")
    db.delete(entry)
    db.commit()
    return {"mensagem": "Removido com sucesso."}


@router.post("/import")
async def importar(arquivo: UploadFile = File(...), db: Session = Depends(get_db)):
    if not arquivo.filename:
        raise HTTPException(status_code=422, detail="Arquivo inválido.")
    conteudo = await arquivo.read()
    inseridos = 0
    pulados = 0
    try:
        texto = conteudo.decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(texto))
        for row in reader:
            tipo_raw = (row.get("tipo") or "CPF").strip().upper()
            if tipo_raw not in ("CPF", "CNPJ", "TELEFONE", "EMAIL"):
                tipo_raw = "CPF"
            valor_raw = (
                row.get("valor") or row.get("cpf") or row.get("cnpj") or
                row.get("telefone") or row.get("email") or ""
            ).strip()
            motivo = (row.get("motivo") or "Importação em lote").strip()
            fonte = (row.get("fonte") or "importação").strip()
            if not valor_raw:
                pulados += 1
                continue
            valor = _normalizar(valor_raw, tipo_raw)
            existing = db.query(Blacklist).filter(
                Blacklist.tipo == tipo_raw, Blacklist.valor == valor
            ).first()
            if existing:
                pulados += 1
                continue
            db.add(Blacklist(tipo=tipo_raw, valor=valor, motivo=motivo, fonte=fonte, ativo=True))
            inseridos += 1
        db.commit()
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Erro ao processar arquivo: {exc}") from exc
    return {"inseridos": inseridos, "pulados": pulados}
