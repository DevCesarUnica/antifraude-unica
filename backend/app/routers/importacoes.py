"""
Router de importação de propostas via CSV com mapeamento de layout.
"""

import csv, io
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    ImportacaoProposta, LayoutImportacao, MapeamentoDados, Proposta, StatusProposta
)
from app.schemas import ImportacaoOut, Mensagem

router = APIRouter(prefix="/importacoes", tags=["importacoes"])

# Campos válidos para destino no mapeamento de propostas
CAMPOS_PROPOSTA = {
    "proposta_id_externo", "cpf_cliente", "nome_cliente", "uf_cliente",
    "banco", "convenio", "produto", "valor", "corretor_id",
}


@router.post("/propostas", response_model=ImportacaoOut, status_code=status.HTTP_201_CREATED)
async def importar_propostas(
    request: Request,
    arquivo: UploadFile = File(...),
    layout_id: str | None = None,
    db: Session = Depends(get_db),
):
    """
    Importa propostas via CSV.
    Se layout_id fornecido: usa mapeamento configurado.
    Sem layout_id: espera CSV com cabeçalho igual aos campos da proposta.
    """
    conteudo = await arquivo.read()
    try:
        texto = conteudo.decode("utf-8-sig")
    except UnicodeDecodeError:
        texto = conteudo.decode("latin-1")

    # Monta mapeamento
    mapeamento: dict[str, str] = {}
    separador = ","

    if layout_id:
        layout = db.query(LayoutImportacao).filter(LayoutImportacao.id == layout_id).first()
        if not layout:
            raise HTTPException(status_code=404, detail="Layout não encontrado")
        separador = layout.separador
        for m in db.query(MapeamentoDados).filter(MapeamentoDados.layout_id == layout_id).all():
            mapeamento[m.coluna_origem] = m.campo_destino

    importacao = ImportacaoProposta(
        layout_id=layout_id,
        arquivo_nome=arquivo.filename,
        status="PROCESSANDO",
        criado_por=request.headers.get("x-usuario"),
    )
    db.add(importacao)
    db.flush()

    leitor = csv.DictReader(io.StringIO(texto), delimiter=separador)
    erros, sucesso, total = [], 0, 0

    for i, linha in enumerate(leitor, start=2):
        total += 1
        try:
            dados: dict = {}
            if mapeamento:
                for col_origem, campo_destino in mapeamento.items():
                    if campo_destino in CAMPOS_PROPOSTA:
                        dados[campo_destino] = linha.get(col_origem, "").strip() or None
            else:
                for campo in CAMPOS_PROPOSTA:
                    if campo in linha:
                        dados[campo] = linha[campo].strip() or None

            # Validações mínimas
            if not dados.get("proposta_id_externo"):
                dados["proposta_id_externo"] = f"IMP-{importacao.id[:8]}-L{i}"
            if not dados.get("cpf_cliente"):
                raise ValueError("cpf_cliente obrigatório")
            if not dados.get("banco"):
                raise ValueError("banco obrigatório")
            if not dados.get("valor"):
                raise ValueError("valor obrigatório")

            dados["valor"] = float(str(dados["valor"]).replace(",", ".").replace("R$", "").strip())
            dados["cpf_cliente"] = str(dados["cpf_cliente"]).replace(".", "").replace("-", "").strip()

            existente = db.query(Proposta).filter(
                Proposta.proposta_id_externo == dados["proposta_id_externo"]
            ).first()
            if not existente:
                p = Proposta(**dados, status=StatusProposta.ENFILEIRADA)
                db.add(p)
            sucesso += 1
        except Exception as exc:
            erros.append({"linha": i, "erro": str(exc)})

    importacao.total_linhas = total
    importacao.processadas = total
    importacao.sucesso = sucesso
    importacao.erro = len(erros)
    importacao.log_erros = erros if erros else None
    importacao.status = "CONCLUIDO" if sucesso > 0 else "ERRO"
    importacao.concluido_em = datetime.utcnow()
    db.commit()
    db.refresh(importacao)

    # Dispara processamento assíncrono das novas propostas
    from app.routers.propostas import processar_proposta
    propostas_novas = db.query(Proposta).filter(
        Proposta.status == StatusProposta.ENFILEIRADA
    ).all()
    for p in propostas_novas:
        processar_proposta.apply_async(args=[p.id], queue="propostas")

    return importacao


@router.get("/propostas", response_model=list[ImportacaoOut])
def listar_importacoes(skip: int = 0, limit: int = 50, db: Session = Depends(get_db)):
    return db.query(ImportacaoProposta).order_by(
        ImportacaoProposta.criado_em.desc()
    ).offset(skip).limit(limit).all()


@router.get("/propostas/{importacao_id}", response_model=ImportacaoOut)
def detalhe_importacao(importacao_id: str, db: Session = Depends(get_db)):
    imp = db.query(ImportacaoProposta).filter(ImportacaoProposta.id == importacao_id).first()
    if not imp:
        raise HTTPException(status_code=404, detail="Importação não encontrada")
    return imp
