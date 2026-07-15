"""
Resolve o corretor responsável por uma proposta a partir do payload de origem.

Ver ANALISE_VINCULO_CORRETOR_PROPOSTA.md para o levantamento completo dos
campos disponíveis em cada origem (Hope/Titan vs. Storm).

Regra de ouro: só vincula automaticamente (preenche Proposta.corretor_id)
quando a confiança é ALTA. MEDIA e BAIXA apenas registram a tentativa, para
auditoria/debug — nunca inventam um corretor sem confiança.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.models import Corretor


@dataclass
class ResolucaoCorretor:
    confianca: str  # ALTA | MEDIA | BAIXA
    origem: str  # hope | storm | manual
    metodo: str  # descrição curta do método usado
    corretor_id: str | None = None
    identificador_origem: str | None = None
    nome_origem: str | None = None
    criado: bool = False
    detalhes: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "confianca": self.confianca,
            "origem": self.origem,
            "metodo": self.metodo,
            "corretor_id": self.corretor_id,
            "identificador_origem": self.identificador_origem,
            "nome_origem": self.nome_origem,
            "criado": self.criado,
            "detalhes": self.detalhes,
            "resolvido_em": datetime.now(timezone.utc).isoformat(),
        }


# ── Storm — corretor.id é um campo de primeira classe no payload ─────────────

def _upsert_corretor_storm(db: Session, cor: dict) -> tuple[Corretor, bool]:
    codigo = str(cor.get("id"))
    nome = (cor.get("nome") or "").strip() or f"Corretor Storm {codigo}"
    email = (cor.get("email") or "").strip() or None

    existente = db.query(Corretor).filter(Corretor.codigo_externo == codigo).first()
    if existente:
        if nome and existente.nome != nome:
            existente.nome = nome
        if email and not existente.email:
            existente.email = email
        return existente, False

    novo = Corretor(nome=nome, codigo_externo=codigo, email=email, cpf=None)
    db.add(novo)
    db.flush()
    return novo, True


def _resolver_storm(db: Session, payload: dict) -> ResolucaoCorretor:
    cor = payload.get("corretor") or {}
    cid = cor.get("id")
    if not cid:
        return ResolucaoCorretor(
            confianca="BAIXA",
            origem="storm",
            metodo="storm_corretor_ausente",
            detalhes={"motivo": "payload não trouxe objeto 'corretor' com id"},
        )

    corretor, criado = _upsert_corretor_storm(db, cor)
    return ResolucaoCorretor(
        confianca="ALTA",
        origem="storm",
        metodo="storm_payload_corretor_id",
        corretor_id=corretor.id,
        identificador_origem=str(cid),
        nome_origem=cor.get("nome"),
        criado=criado,
        detalhes={"usuario": cor.get("usuario"), "email": cor.get("email")},
    )


# ── Hope/Titan — sem campo confiável hoje (ver análise seção 2.1) ────────────

def _resolver_hope(db: Session, payload: dict) -> ResolucaoCorretor:
    """
    createdByID é o usuário da plataforma Titan (ex: analista do banco Hope),
    não o corretor/parceiro da Unica — nunca bateu com nenhum código do
    cadastro WebDeck nas 2.252 propostas reais auditadas para a análise desta
    fase. Ainda assim comparamos contra o cadastro atual (poderia mudar no
    futuro), mas o resultado esperado é sempre BAIXA.
    """
    created_by = payload.get("createdByID")
    identificador = str(created_by) if created_by is not None else None

    if identificador:
        candidato = db.query(Corretor).filter(
            Corretor.codigo_externo == identificador
        ).first()
        if candidato:
            return ResolucaoCorretor(
                confianca="MEDIA",
                origem="hope",
                metodo="titan_createdByID_coincidencia_cadastro",
                identificador_origem=identificador,
                nome_origem=candidato.nome,
                detalhes={
                    "aviso": (
                        "createdByID é usuário da plataforma Titan, não corretor "
                        "confirmado — coincidência com o cadastro requer validação "
                        "manual antes de vincular"
                    ),
                },
            )

    return ResolucaoCorretor(
        confianca="BAIXA",
        origem="hope",
        metodo="titan_sem_campo_corretor",
        identificador_origem=identificador,
        detalhes={
            "motivo": (
                "payload Titan não tem campo de corretor — createdByID é usuário "
                "da plataforma, brokerageCompany/supplierCompany sempre null"
            ),
        },
    )


# ── Ponto de entrada único ────────────────────────────────────────────────────

def resolver_corretor(db: Session, origem: str, payload: dict | None) -> ResolucaoCorretor:
    """
    origem vem de propostas_dashboard.determinar_origem()
    ("hope" | "storm" | "manual").
    """
    payload = payload or {}
    if origem == "storm":
        return _resolver_storm(db, payload)
    if origem == "hope":
        return _resolver_hope(db, payload)
    return ResolucaoCorretor(
        confianca="BAIXA",
        origem=origem,
        metodo="origem_sem_resolvedor",
        detalhes={"motivo": f"origem '{origem}' não tem resolvedor implementado"},
    )
