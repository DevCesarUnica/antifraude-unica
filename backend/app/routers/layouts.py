"""
Router de layouts de importação e mapeamentos de dados.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.database import get_db
from app.models import LayoutImportacao, MapeamentoDados
from app.schemas import LayoutCreate, LayoutUpdate, LayoutOut, MapeamentoCreate, MapeamentoOut, Mensagem

router = APIRouter(prefix="/layouts", tags=["layouts"])


# ── Layouts ───────────────────────────────────────────────────────────────────

@router.get("/", response_model=list[LayoutOut])
def listar_layouts(tipo: str | None = None, db: Session = Depends(get_db)):
    q = db.query(LayoutImportacao).filter(LayoutImportacao.ativo == True)
    if tipo:
        q = q.filter(LayoutImportacao.tipo == tipo.upper())
    return q.order_by(LayoutImportacao.nome.asc()).all()


@router.post("/", response_model=LayoutOut, status_code=status.HTTP_201_CREATED)
def criar_layout(body: LayoutCreate, db: Session = Depends(get_db)):
    layout = LayoutImportacao(**body.model_dump())
    db.add(layout)
    db.commit()
    db.refresh(layout)
    return layout


@router.get("/{layout_id}", response_model=LayoutOut)
def obter_layout(layout_id: str, db: Session = Depends(get_db)):
    return _get_ou_404(db, layout_id)


@router.patch("/{layout_id}", response_model=LayoutOut)
def atualizar_layout(layout_id: str, body: LayoutUpdate, db: Session = Depends(get_db)):
    layout = _get_ou_404(db, layout_id)
    for campo, valor in body.model_dump(exclude_none=True).items():
        setattr(layout, campo, valor)
    db.commit()
    db.refresh(layout)
    return layout


@router.delete("/{layout_id}", response_model=Mensagem)
def desativar_layout(layout_id: str, db: Session = Depends(get_db)):
    layout = _get_ou_404(db, layout_id)
    layout.ativo = False
    db.commit()
    return Mensagem(mensagem="Layout desativado")


# ── Mapeamentos ───────────────────────────────────────────────────────────────

@router.get("/{layout_id}/mapeamentos", response_model=list[MapeamentoOut])
def listar_mapeamentos(layout_id: str, db: Session = Depends(get_db)):
    _get_ou_404(db, layout_id)
    return db.query(MapeamentoDados).filter(
        MapeamentoDados.layout_id == layout_id
    ).order_by(MapeamentoDados.ordem.asc()).all()


@router.post("/{layout_id}/mapeamentos", response_model=MapeamentoOut, status_code=status.HTTP_201_CREATED)
def criar_mapeamento(layout_id: str, body: MapeamentoCreate, db: Session = Depends(get_db)):
    _get_ou_404(db, layout_id)
    mapeamento = MapeamentoDados(layout_id=layout_id, **body.model_dump())
    db.add(mapeamento)
    db.commit()
    db.refresh(mapeamento)
    return mapeamento


@router.delete("/{layout_id}/mapeamentos/{mapeamento_id}", response_model=Mensagem)
def remover_mapeamento(layout_id: str, mapeamento_id: str, db: Session = Depends(get_db)):
    m = db.query(MapeamentoDados).filter(
        MapeamentoDados.id == mapeamento_id,
        MapeamentoDados.layout_id == layout_id,
    ).first()
    if not m:
        raise HTTPException(status_code=404, detail="Mapeamento não encontrado")
    db.delete(m)
    db.commit()
    return Mensagem(mensagem="Mapeamento removido")


# ── Helper ────────────────────────────────────────────────────────────────────

def _get_ou_404(db: Session, layout_id: str) -> LayoutImportacao:
    l = db.query(LayoutImportacao).filter(LayoutImportacao.id == layout_id).first()
    if not l:
        raise HTTPException(status_code=404, detail="Layout não encontrado")
    return l
