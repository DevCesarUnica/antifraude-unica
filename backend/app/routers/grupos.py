"""
Router de grupos de corretores (= "esteiras comerciais" nos dados do WebDeck).
"""

import csv, io, re
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status, Request
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.exc import IntegrityError

from app.database import get_db
from app.models import GrupoCorretor, Corretor, CorretorEsteira, Usuario
from app.schemas import (
    GrupoCreate, GrupoUpdate, GrupoOut, Mensagem,
    EsteiraResumoOut, EsteiraVinculoOut, ImportEsteirasResultado,
)
from app.routers.auth import verificar_token
from app.services.auditoria import log_auditoria

router = APIRouter(prefix="/grupos", tags=["grupos"])


def _exige_admin_ou_gestor(atual: Usuario = Depends(verificar_token)) -> Usuario:
    if atual.perfil not in ("admin", "gestor"):
        raise HTTPException(status_code=403, detail="Permissão insuficiente")
    return atual


@router.get("/", response_model=list[GrupoOut])
def listar_grupos(ativo: bool | None = None, db: Session = Depends(get_db)):
    q = db.query(GrupoCorretor)
    if ativo is not None:
        q = q.filter(GrupoCorretor.ativo == ativo)
    return q.order_by(GrupoCorretor.nome.asc()).all()


# ── Esteiras Comerciais (rotas estáticas — precisam vir antes de /{grupo_id}) ──

@router.get("/esteiras", response_model=list[EsteiraResumoOut])
def listar_esteiras(ativo: bool | None = None, db: Session = Depends(get_db)):
    """
    Visão de "esteira comercial": mesmo dado de GrupoCorretor, mas com a
    contagem de corretores vinculados (via CorretorEsteira) para a tela.
    """
    contagem_sq = (
        db.query(
            CorretorEsteira.grupo_id.label("grupo_id"),
            func.count(CorretorEsteira.id).label("total"),
        )
        .group_by(CorretorEsteira.grupo_id)
        .subquery()
    )
    q = (
        db.query(GrupoCorretor, contagem_sq.c.total)
        .outerjoin(contagem_sq, contagem_sq.c.grupo_id == GrupoCorretor.id)
    )
    if ativo is not None:
        q = q.filter(GrupoCorretor.ativo == ativo)

    resultado = []
    for grupo, total in q.order_by(GrupoCorretor.nome.asc()).all():
        item = EsteiraResumoOut.model_validate(grupo)
        item.total_corretores = total or 0
        resultado.append(item)
    return resultado


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


@router.get("/{grupo_id}/vinculos", response_model=list[EsteiraVinculoOut])
def listar_vinculos_esteira(grupo_id: str, db: Session = Depends(get_db)):
    """
    Todos os corretores vinculados a esta esteira via CorretorEsteira —
    inclui vínculos históricos/secundários, não só o grupo_id "principal"
    do corretor. Ver CorretorEsteira em models.py.
    """
    _get_ou_404(db, grupo_id)
    vinculos = (
        db.query(CorretorEsteira)
        .options(joinedload(CorretorEsteira.corretor))
        .filter(CorretorEsteira.grupo_id == grupo_id)
        .all()
    )
    itens = [
        EsteiraVinculoOut(
            corretor_id=v.corretor_id,
            corretor_nome=v.corretor.nome,
            codigo_externo=v.corretor.codigo_externo,
            corretor_ativo=v.corretor.ativo,
            banco_grupo=v.banco_grupo,
            data_entrada=v.data_entrada,
        )
        for v in vinculos
    ]
    return sorted(itens, key=lambda i: i.corretor_nome or "")


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


# ── Importação do relatório WebDeck (esteiras comerciais) ─────────────────────

_VALOR_MIL_RE = re.compile(r"(\d+)\s*MIL", re.IGNORECASE)


def _extrair_limite(nome_regra: str) -> float:
    """Ex: 'DINAMICA 25 MIL' -> 25000.0. Retorna 0.0 se não houver valor no nome."""
    m = _VALOR_MIL_RE.search(nome_regra)
    return float(m.group(1)) * 1000 if m else 0.0


def _parse_data_webdeck(bruta: str) -> datetime | None:
    bruta = (bruta or "").strip()
    if not bruta:
        return None
    try:
        return datetime.strptime(bruta, "%d/%m/%Y %H:%M:%S").replace(tzinfo=timezone.utc)
    except ValueError:
        return None


@router.post("/importar-webdeck", response_model=ImportEsteirasResultado, status_code=status.HTTP_201_CREATED)
async def importar_esteiras_webdeck(
    request: Request,
    arquivo: UploadFile = File(...),
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(_exige_admin_ou_gestor),
):
    """
    Importa o relatório de esteiras comerciais do WebDeck (relatorio_regras.csv).

    Colunas esperadas (separador ';'): "Nome Regra", "Nome Grupo",
    "Codigo Corretor", "Nome Corretor", "Data de entrada".

    Cada "Nome Regra" única vira uma esteira comercial (GrupoCorretor), com
    limite_valor extraído do padrão "N MIL" quando presente. Corretores são
    upsertados por codigo_externo e vinculados à(s) esteira(s) via
    CorretorEsteira — um corretor pode estar em mais de uma esteira ao mesmo
    tempo (ver ANALISE_REGRAS_WEBDECK.md). Corretor.grupo_id é atualizado
    para a esteira de "Data de entrada" mais recente (esteira principal,
    candidata a alimentar uma futura regra LIMITE_CORRETOR em modo shadow).

    NÃO cria regras antifraude, NÃO altera o motor, NÃO bloqueia nada — é
    cadastro operacional puro.
    """
    conteudo = await arquivo.read()
    try:
        texto = conteudo.decode("utf-8-sig")
    except UnicodeDecodeError:
        texto = conteudo.decode("latin-1")

    leitor = csv.DictReader(io.StringIO(texto), delimiter=";")
    erros: list[dict] = []
    esteiras_criadas = esteiras_atualizadas = 0
    corretores_criados = corretores_atualizados = 0
    vinculos_criados = vinculos_atualizados = 0

    # Guarda só IDs (str) e datas, nunca objetos ORM — objetos criados numa
    # linha que falha são desfeitos pelo ROLLBACK TO SAVEPOINT daquela linha,
    # então cachear o objeto Python causaria reuso de uma instância "fantasma".
    melhor_por_corretor: dict[str, tuple[datetime, str]] = {}
    sentinela = datetime.min.replace(tzinfo=timezone.utc)

    for i, linha_bruta in enumerate(leitor, start=2):
        try:
            with db.begin_nested():  # SAVEPOINT — isola falha desta linha sem perder as anteriores
                # Normaliza chaves: a coluna "Nome Regra" no arquivo original tem
                # um espaço antes da aspa de abertura, o que impede o parser CSV
                # de reconhecer o campo como citado (vira ' "Nome Regra"' literal).
                linha = {(k or "").strip().strip('"'): v for k, v in linha_bruta.items()}

                nome_regra = (linha.get("Nome Regra") or "").strip()
                nome_grupo = (linha.get("Nome Grupo") or "").strip()
                codigo = (linha.get("Codigo Corretor") or "").strip()
                nome_corretor = (linha.get("Nome Corretor") or "").strip()
                data_bruta = linha.get("Data de entrada") or ""

                if not nome_regra:
                    raise ValueError("Nome Regra vazio")
                if not codigo or codigo == "0":
                    raise ValueError("Codigo Corretor ausente ou inválido")
                if not nome_corretor:
                    raise ValueError("Nome Corretor vazio")

                # ── Esteira (GrupoCorretor) ──────────────────────────────────
                esteira = db.query(GrupoCorretor).filter(GrupoCorretor.nome == nome_regra).first()
                if esteira is None:
                    esteira = GrupoCorretor(nome=nome_regra)
                    db.add(esteira)
                    db.flush()
                    esteiras_criadas += 1
                else:
                    esteiras_atualizadas += 1

                limite = _extrair_limite(nome_regra)
                if limite > 0:
                    esteira.limite_valor = limite
                grupo_webdeck = nome_grupo if nome_grupo and nome_grupo != "-" else None
                meta = dict(esteira.metadados or {})
                meta["origem"] = "relatorio_regras.csv (WebDeck)"
                if grupo_webdeck and grupo_webdeck != nome_regra:
                    tags = set(meta.get("grupos_webdeck", []))
                    tags.add(grupo_webdeck)
                    meta["grupos_webdeck"] = sorted(tags)
                esteira.metadados = meta
                if not esteira.descricao:
                    esteira.descricao = f"Esteira comercial importada do relatório WebDeck ({nome_regra})."

                # ── Corretor ──────────────────────────────────────────────────
                corretor = db.query(Corretor).filter(Corretor.codigo_externo == codigo).first()
                if corretor is None:
                    corretor = Corretor(nome=nome_corretor, codigo_externo=codigo, cpf=None)
                    db.add(corretor)
                    db.flush()
                    corretores_criados += 1
                else:
                    if nome_corretor and corretor.nome != nome_corretor:
                        corretor.nome = nome_corretor
                    corretores_atualizados += 1

                # ── Vínculo corretor × esteira ───────────────────────────────
                data_entrada = _parse_data_webdeck(data_bruta)
                vinculo = db.query(CorretorEsteira).filter(
                    CorretorEsteira.corretor_id == corretor.id,
                    CorretorEsteira.grupo_id == esteira.id,
                ).first()
                if vinculo is None:
                    vinculo = CorretorEsteira(
                        corretor_id=corretor.id, grupo_id=esteira.id,
                        banco_grupo=grupo_webdeck, data_entrada=data_entrada,
                    )
                    db.add(vinculo)
                    vinculos_criados += 1
                else:
                    if data_entrada and (not vinculo.data_entrada or data_entrada > vinculo.data_entrada):
                        vinculo.data_entrada = data_entrada
                        vinculo.banco_grupo = grupo_webdeck
                    vinculos_atualizados += 1

                # rastreia a esteira mais recente por corretor -> vira grupo_id principal
                chave_data = data_entrada or sentinela
                atual = melhor_por_corretor.get(corretor.id)
                if atual is None or chave_data > atual[0]:
                    melhor_por_corretor[corretor.id] = (chave_data, esteira.id)

        except Exception as exc:
            erros.append({"linha": i, "erro": str(exc)})

    for corretor_id, (_, grupo_id) in melhor_por_corretor.items():
        try:
            with db.begin_nested():
                db.query(Corretor).filter(Corretor.id == corretor_id).update({"grupo_id": grupo_id})
        except Exception as exc:
            erros.append({"linha": 0, "erro": f"Falha ao definir esteira principal do corretor {corretor_id}: {exc}"})

    db.commit()

    resultado = {
        "esteiras_criadas": esteiras_criadas,
        "esteiras_atualizadas": esteiras_atualizadas,
        "corretores_criados": corretores_criados,
        "corretores_atualizados": corretores_atualizados,
        "vinculos_criados": vinculos_criados,
        "vinculos_atualizados": vinculos_atualizados,
        "total_erros": len(erros),
        "erros": erros[:200],
    }

    log_auditoria(
        db,
        acao=f"Importou esteiras comerciais do WebDeck ({arquivo.filename})",
        usuario=usuario,
        request=request,
        tipo_entidade="esteira_comercial",
        entidade_id=None,
        depois=resultado,
        risco="MEDIO",
    )
    db.commit()
    return resultado


def _get_ou_404(db: Session, grupo_id: str) -> GrupoCorretor:
    g = db.query(GrupoCorretor).filter(GrupoCorretor.id == grupo_id).first()
    if not g:
        raise HTTPException(status_code=404, detail="Grupo não encontrado")
    return g
