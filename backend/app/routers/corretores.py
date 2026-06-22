"""
Router de corretores — CRUD completo + contatos + importação CSV.
"""

import csv
import io
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status, Request
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.database import get_db
from app.models import Corretor, ContatoCorretor, ImportacaoCorretor
from app.schemas import (
    CorretorCreate, CorretorUpdate, CorretorOut,
    ContatoCreate, ContatoOut, ImportacaoOut, Mensagem,
)

router = APIRouter(prefix="/corretores", tags=["corretores"])


# ── CRUD ──────────────────────────────────────────────────────────────────────

@router.get("/", response_model=list[CorretorOut])
def listar_corretores(
    nome: str | None = None,
    cpf: str | None = None,
    grupo_id: str | None = None,
    ativo: bool | None = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    q = db.query(Corretor)
    if nome:
        q = q.filter(Corretor.nome.ilike(f"%{nome}%"))
    if cpf:
        q = q.filter(Corretor.cpf == cpf.replace(".", "").replace("-", ""))
    if grupo_id:
        q = q.filter(Corretor.grupo_id == grupo_id)
    if ativo is not None:
        q = q.filter(Corretor.ativo == ativo)
    return q.order_by(Corretor.nome.asc()).offset(skip).limit(limit).all()


@router.post("/", response_model=CorretorOut, status_code=status.HTTP_201_CREATED)
def criar_corretor(body: CorretorCreate, db: Session = Depends(get_db)):
    corretor = Corretor(**body.model_dump())
    db.add(corretor)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="CPF ou código externo já cadastrado")
    db.refresh(corretor)
    return corretor


@router.get("/{corretor_id}", response_model=CorretorOut)
def obter_corretor(corretor_id: str, db: Session = Depends(get_db)):
    return _get_ou_404(db, corretor_id)


@router.patch("/{corretor_id}", response_model=CorretorOut)
def atualizar_corretor(corretor_id: str, body: CorretorUpdate, db: Session = Depends(get_db)):
    c = _get_ou_404(db, corretor_id)
    for campo, valor in body.model_dump(exclude_none=True).items():
        setattr(c, campo, valor)
    db.commit()
    db.refresh(c)
    return c


@router.delete("/{corretor_id}", response_model=Mensagem)
def desativar_corretor(corretor_id: str, db: Session = Depends(get_db)):
    c = _get_ou_404(db, corretor_id)
    c.ativo = False
    db.commit()
    return Mensagem(mensagem="Corretor desativado com sucesso")


# ── Contatos ──────────────────────────────────────────────────────────────────

@router.get("/{corretor_id}/contatos", response_model=list[ContatoOut])
def listar_contatos(corretor_id: str, db: Session = Depends(get_db)):
    _get_ou_404(db, corretor_id)
    return db.query(ContatoCorretor).filter(
        ContatoCorretor.corretor_id == corretor_id,
        ContatoCorretor.ativo == True,
    ).all()


@router.post("/{corretor_id}/contatos", response_model=ContatoOut, status_code=status.HTTP_201_CREATED)
def adicionar_contato(corretor_id: str, body: ContatoCreate, db: Session = Depends(get_db)):
    _get_ou_404(db, corretor_id)
    if body.principal:
        # Remove flag principal dos outros do mesmo tipo
        db.query(ContatoCorretor).filter(
            ContatoCorretor.corretor_id == corretor_id,
            ContatoCorretor.tipo == body.tipo,
        ).update({"principal": False})
    contato = ContatoCorretor(corretor_id=corretor_id, **body.model_dump())
    db.add(contato)
    db.commit()
    db.refresh(contato)
    return contato


@router.delete("/{corretor_id}/contatos/{contato_id}", response_model=Mensagem)
def remover_contato(corretor_id: str, contato_id: str, db: Session = Depends(get_db)):
    contato = db.query(ContatoCorretor).filter(
        ContatoCorretor.id == contato_id,
        ContatoCorretor.corretor_id == corretor_id,
    ).first()
    if not contato:
        raise HTTPException(status_code=404, detail="Contato não encontrado")
    contato.ativo = False
    db.commit()
    return Mensagem(mensagem="Contato removido")


# ── Importação CSV ────────────────────────────────────────────────────────────

@router.post("/importar", response_model=ImportacaoOut, status_code=status.HTTP_201_CREATED)
async def importar_corretores(
    request: Request,
    arquivo: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """
    Importa corretores via CSV.
    Colunas esperadas: nome, cpf, email, telefone, codigo_externo, grupo_id
    """
    conteudo = await arquivo.read()
    try:
        texto = conteudo.decode("utf-8-sig")
    except UnicodeDecodeError:
        texto = conteudo.decode("latin-1")

    importacao = ImportacaoCorretor(
        arquivo_nome=arquivo.filename,
        status="PROCESSANDO",
        criado_por=request.headers.get("x-usuario"),
    )
    db.add(importacao)
    db.flush()

    leitor = csv.DictReader(io.StringIO(texto))
    erros = []
    sucesso = 0
    total = 0

    for i, linha in enumerate(leitor, start=2):
        total += 1
        try:
            cpf = linha.get("cpf", "").replace(".", "").replace("-", "").strip()
            if not cpf:
                raise ValueError("CPF obrigatório")
            nome = linha.get("nome", "").strip()
            if not nome:
                raise ValueError("Nome obrigatório")

            existente = db.query(Corretor).filter(Corretor.cpf == cpf).first()
            if existente:
                existente.nome = nome
                existente.email = linha.get("email", "").strip() or existente.email
                existente.telefone = linha.get("telefone", "").strip() or existente.telefone
            else:
                c = Corretor(
                    nome=nome,
                    cpf=cpf,
                    email=linha.get("email", "").strip() or None,
                    telefone=linha.get("telefone", "").strip() or None,
                    codigo_externo=linha.get("codigo_externo", "").strip() or None,
                    grupo_id=linha.get("grupo_id", "").strip() or None,
                )
                db.add(c)
            sucesso += 1
        except Exception as exc:
            erros.append({"linha": i, "erro": str(exc), "dados": dict(linha)})

    importacao.total_linhas = total
    importacao.sucesso = sucesso
    importacao.erro = len(erros)
    importacao.log_erros = erros if erros else None
    importacao.status = "CONCLUIDO" if not erros or sucesso > 0 else "ERRO"

    from datetime import datetime
    importacao.concluido_em = datetime.utcnow()
    db.commit()
    db.refresh(importacao)
    return importacao


@router.get("/importacoes/historico", response_model=list[ImportacaoOut])
def historico_importacoes(skip: int = 0, limit: int = 50, db: Session = Depends(get_db)):
    return db.query(ImportacaoCorretor).order_by(
        ImportacaoCorretor.criado_em.desc()
    ).offset(skip).limit(limit).all()


# ── Helper ────────────────────────────────────────────────────────────────────

def _get_ou_404(db: Session, corretor_id: str) -> Corretor:
    c = db.query(Corretor).filter(Corretor.id == corretor_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Corretor não encontrado")
    return c
