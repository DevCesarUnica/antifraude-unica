"""
Router de grupos de corretores.
"""

import csv, io
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status, Request
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.database import get_db
from app.models import GrupoCorretor, Corretor
from app.schemas import GrupoCreate, GrupoUpdate, GrupoOut, Mensagem

router = APIRouter(prefix="/grupos", tags=["grupos"])


@router.get("/", response_model=list[GrupoOut])
def listar_grupos(ativo: bool | None = None, db: Session = Depends(get_db)):
    q = db.query(GrupoCorretor)
    if ativo is not None:
        q = q.filter(GrupoCorretor.ativo == ativo)
    return q.order_by(GrupoCorretor.nome.asc()).all()


@router.post("/", response_model=GrupoOut, status_code=status.HTTP_201_CREATED)
def criar_grupo(body: GrupoCreate, db: Session = Depends(get_db)):
    grupo = GrupoCorretor(**body.model_dump())
    db.add(grupo)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Já existe um grupo com este nome")
    db.refresh(grupo)
    return grupo


@router.get("/{grupo_id}", response_model=GrupoOut)
def obter_grupo(grupo_id: str, db: Session = Depends(get_db)):
    return _get_ou_404(db, grupo_id)


@router.patch("/{grupo_id}", response_model=GrupoOut)
def atualizar_grupo(grupo_id: str, body: GrupoUpdate, db: Session = Depends(get_db)):
    g = _get_ou_404(db, grupo_id)
    for campo, valor in body.model_dump(exclude_none=True).items():
        setattr(g, campo, valor)
    db.commit()
    db.refresh(g)
    return g


@router.delete("/{grupo_id}", response_model=Mensagem)
def desativar_grupo(grupo_id: str, db: Session = Depends(get_db)):
    g = _get_ou_404(db, grupo_id)
    g.ativo = False
    db.commit()
    return Mensagem(mensagem="Grupo desativado")


@router.post("/{grupo_id}/corretores/{corretor_id}", response_model=Mensagem)
def vincular_corretor(grupo_id: str, corretor_id: str, db: Session = Depends(get_db)):
    _get_ou_404(db, grupo_id)
    c = db.query(Corretor).filter(Corretor.id == corretor_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Corretor não encontrado")
    c.grupo_id = grupo_id
    db.commit()
    return Mensagem(mensagem="Corretor vinculado ao grupo")


@router.delete("/{grupo_id}/corretores/{corretor_id}", response_model=Mensagem)
def desvincular_corretor(grupo_id: str, corretor_id: str, db: Session = Depends(get_db)):
    c = db.query(Corretor).filter(
        Corretor.id == corretor_id, Corretor.grupo_id == grupo_id
    ).first()
    if not c:
        raise HTTPException(status_code=404, detail="Corretor não encontrado neste grupo")
    c.grupo_id = None
    db.commit()
    return Mensagem(mensagem="Corretor desvinculado do grupo")


@router.post("/importar", status_code=status.HTTP_201_CREATED)
async def importar_grupos(arquivo: UploadFile = File(...), db: Session = Depends(get_db)):
    """CSV com colunas: nome, descricao, limite_valor"""
    conteudo = await arquivo.read()
    try:
        texto = conteudo.decode("utf-8-sig")
    except UnicodeDecodeError:
        texto = conteudo.decode("latin-1")

    leitor = csv.DictReader(io.StringIO(texto))
    criados, atualizados, erros = 0, 0, []

    for i, linha in enumerate(leitor, start=2):
        try:
            nome = linha.get("nome", "").strip()
            if not nome:
                raise ValueError("Nome obrigatório")
            existente = db.query(GrupoCorretor).filter(GrupoCorretor.nome == nome).first()
            if existente:
                existente.descricao = linha.get("descricao", "").strip() or existente.descricao
                existente.limite_valor = float(linha.get("limite_valor", 0) or 0)
                atualizados += 1
            else:
                db.add(GrupoCorretor(
                    nome=nome,
                    descricao=linha.get("descricao", "").strip() or None,
                    limite_valor=float(linha.get("limite_valor", 0) or 0),
                ))
                criados += 1
        except Exception as exc:
            erros.append({"linha": i, "erro": str(exc)})

    db.commit()
    return {"criados": criados, "atualizados": atualizados, "erros": erros}


def _get_ou_404(db: Session, grupo_id: str) -> GrupoCorretor:
    g = db.query(GrupoCorretor).filter(GrupoCorretor.id == grupo_id).first()
    if not g:
        raise HTTPException(status_code=404, detail="Grupo não encontrado")
    return g
