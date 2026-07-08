"""
Router de regras antifraude — CRUD + auditoria + simulador.

Toda atualização incrementa o campo `versao` da regra.
Regras deletadas são desativadas (ativo=False), nunca removidas do banco.

Este é o motor de regras (regras_antifraude) — NÃO confundir com Esteiras
Comerciais (grupos_corretores/corretor_esteiras/CSV WebDeck, ver
ANALISE_REGRAS_WEBDECK.md). São módulos independentes; este router não lê
nem escreve nenhuma tabela daquele módulo.
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import RegraAntifraude, LogAuditoria, Usuario, Proposta
from app.schemas import (
    RegraCreate, RegraUpdate, RegraOut, Mensagem,
    SimulacaoRequest, SimulacaoResponse, LogAuditoriaOut,
)
from app.routers.auth import verificar_token
from app.services.auditoria import log_auditoria
from app.services.antifraude import MotorAntifraude

router = APIRouter(prefix="/regras", tags=["regras"])


def _exige_admin_ou_gestor(atual: Usuario = Depends(verificar_token)) -> Usuario:
    if atual.perfil not in ("admin", "gestor"):
        raise HTTPException(status_code=403, detail="Permissão insuficiente")
    return atual


def _snapshot(regra: RegraAntifraude) -> dict:
    """Estado da regra para antes/depois na auditoria."""
    return {
        "nome": regra.nome,
        "descricao": regra.descricao,
        "tipo": str(regra.tipo),
        "parametros": regra.parametros,
        "peso_score": regra.peso_score,
        "bloqueante": regra.bloqueante,
        "shadow_mode": regra.shadow_mode,
        "prioridade": regra.prioridade,
        "ativo": regra.ativo,
        "versao": regra.versao,
    }


# ── CRUD ──────────────────────────────────────────────────────────────────────

@router.get("/", response_model=list[RegraOut])
def listar_regras(ativo: bool | None = None, db: Session = Depends(get_db)):
    q = db.query(RegraAntifraude)
    if ativo is not None:
        q = q.filter(RegraAntifraude.ativo == ativo)
    return q.order_by(RegraAntifraude.prioridade.asc()).all()


@router.post("/", response_model=RegraOut, status_code=201)
def criar_regra(
    body: RegraCreate,
    request: Request,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(_exige_admin_ou_gestor),
):
    regra = RegraAntifraude(
        **body.model_dump(),
        criado_por=usuario.username,
        atualizado_por=usuario.username,
    )
    db.add(regra)
    db.flush()

    log_auditoria(
        db,
        acao=f"Criou regra antifraude '{regra.nome}' ({regra.tipo})",
        usuario=usuario,
        request=request,
        tipo_entidade="regra_antifraude",
        entidade_id=regra.id,
        depois=_snapshot(regra),
        risco="ALTO",
    )
    db.commit()
    db.refresh(regra)
    return regra


@router.get("/{regra_id}", response_model=RegraOut)
def obter_regra(regra_id: str, db: Session = Depends(get_db)):
    return _get_ou_404(db, regra_id)


@router.get("/{regra_id}/auditoria", response_model=list[LogAuditoriaOut])
def auditoria_regra(
    regra_id: str,
    db: Session = Depends(get_db),
    _: Usuario = Depends(verificar_token),
):
    """Histórico completo de alterações desta regra: quem, quando, o que mudou."""
    _get_ou_404(db, regra_id)
    return (
        db.query(LogAuditoria)
        .filter(
            LogAuditoria.tipo_entidade == "regra_antifraude",
            LogAuditoria.entidade_id == regra_id,
        )
        .order_by(LogAuditoria.criado_em.desc())
        .all()
    )


@router.patch("/{regra_id}", response_model=RegraOut)
def atualizar_regra(
    regra_id: str,
    body: RegraUpdate,
    request: Request,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(_exige_admin_ou_gestor),
):
    regra = _get_ou_404(db, regra_id)
    antes = _snapshot(regra)

    for campo, valor in body.model_dump(exclude_unset=True).items():
        setattr(regra, campo, valor)
    regra.versao = (regra.versao or 1) + 1
    regra.atualizado_por = usuario.username

    log_auditoria(
        db,
        acao=f"Atualizou regra antifraude '{regra.nome}'",
        usuario=usuario,
        request=request,
        tipo_entidade="regra_antifraude",
        entidade_id=regra.id,
        antes=antes,
        depois=_snapshot(regra),
        risco="ALTO",
    )
    db.commit()
    db.refresh(regra)
    return regra


@router.delete("/{regra_id}", response_model=Mensagem)
def desativar_regra(
    regra_id: str,
    request: Request,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(_exige_admin_ou_gestor),
):
    """Desativa a regra (soft-delete) sem remover do histórico."""
    regra = _get_ou_404(db, regra_id)
    antes = _snapshot(regra)

    regra.ativo = False
    regra.versao = (regra.versao or 1) + 1
    regra.atualizado_por = usuario.username

    log_auditoria(
        db,
        acao=f"Desativou regra antifraude '{regra.nome}'",
        usuario=usuario,
        request=request,
        tipo_entidade="regra_antifraude",
        entidade_id=regra.id,
        antes=antes,
        depois=_snapshot(regra),
        risco="ALTO",
    )
    db.commit()
    return Mensagem(mensagem=f"Regra '{regra.nome}' desativada")


# ── Simulador ─────────────────────────────────────────────────────────────────

@router.post("/simular", response_model=SimulacaoResponse)
def simular_regra(
    body: SimulacaoRequest,
    db: Session = Depends(get_db),
    _: Usuario = Depends(verificar_token),
):
    """
    Executa o motor antifraude (mesma lógica de produção, `antifraude.avaliar`)
    contra uma proposta transitória — nunca persistida, nenhum commit
    acontece nesta rota. Serve para testar o efeito de regras (inclusive
    shadow) sem afetar propostas reais.
    """
    proposta = Proposta(
        proposta_id_externo=f"simulacao-{body.cpf_cliente}",
        cpf_cliente=body.cpf_cliente,
        banco=body.banco,
        convenio=body.convenio,
        uf_cliente=body.uf_cliente,
        produto=body.produto,
        valor=body.valor,
    )
    decisao = MotorAntifraude(db).avaliar(proposta)
    db.rollback()  # descarta qualquer side-effect (ex: auto-registro de convênio)

    return SimulacaoResponse(
        resultado=decisao.resultado,
        score=decisao.score,
        motivo_principal=decisao.motivo_principal,
        flags=decisao.flags,
        regras_disparadas=decisao.regras_disparadas,
    )


def _get_ou_404(db: Session, regra_id: str) -> RegraAntifraude:
    r = db.query(RegraAntifraude).filter(RegraAntifraude.id == regra_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Regra não encontrada")
    return r
