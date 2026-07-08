"""
Avaliação informativa de LIMITE_CORRETOR — Fase 2, modo shadow.

Compara proposta.valor contra o limite_valor da esteira comercial
(GrupoCorretor) do corretor vinculado. Nunca bloqueia, nunca soma score e
nunca é lido pelo MotorAntifraude — só é gravado em
Proposta.limite_corretor_shadow para visualização/auditoria.

Ver ANALISE_REGRAS_WEBDECK.md e ANALISE_VINCULO_CORRETOR_PROPOSTA.md.
"""
from __future__ import annotations

from sqlalchemy.orm import Session, joinedload

from app.models import Corretor, Proposta


def avaliar_shadow(db: Session, proposta: Proposta) -> dict | None:
    """Retorna None quando não há corretor vinculado ou a esteira não tem limite configurado."""
    if not proposta.corretor_id:
        return None

    corretor = (
        db.query(Corretor)
        .options(joinedload(Corretor.grupo))
        .filter(Corretor.id == proposta.corretor_id)
        .first()
    )
    if not corretor or not corretor.grupo or not corretor.grupo.limite_valor:
        return None

    esteira = corretor.grupo
    status = "ACIMA_LIMITE" if proposta.valor > esteira.limite_valor else "DENTRO_LIMITE"

    return {
        "regra": "LIMITE_CORRETOR",
        "esteira": esteira.nome,
        "esteira_id": esteira.id,
        "limite": esteira.limite_valor,
        "valor_proposta": proposta.valor,
        "status": status,
        "efeito": "SHADOW",
    }
