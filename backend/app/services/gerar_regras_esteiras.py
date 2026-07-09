"""
Gera automaticamente regras LIMITE_CORRETOR_SHADOW a partir das Esteiras
Comerciais (GrupoCorretor) já cadastradas — uma regra por esteira com
limite_valor > 0.

Idempotente: pode ser rodado quantas vezes for preciso (ex.: depois de
reimportar o CSV WebDeck ou de ajustar o limite de uma esteira) sem duplicar
regras — casa por GrupoCorretor.id via RegraAntifraude.esteira_id (único no
banco). Nunca gera regra bloqueante: toda regra nova nasce com
shadow_mode=True, bloqueante=False, peso_score=0. Regras já existentes têm
nome/descrição/parâmetros ressincronizados com a esteira atual, mas
ativo/shadow_mode não são mexidos de novo — respeita desativação manual feita
depois da primeira geração.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import GrupoCorretor, RegraAntifraude, TipoRegra


def gerar_regras_de_esteiras(db: Session, usuario: str | None = None) -> dict:
    esteiras = (
        db.query(GrupoCorretor)
        .filter(GrupoCorretor.limite_valor > 0)
        .order_by(GrupoCorretor.nome.asc())
        .all()
    )

    criadas = 0
    atualizadas = 0

    for esteira in esteiras:
        regra = (
            db.query(RegraAntifraude)
            .filter(RegraAntifraude.esteira_id == esteira.id)
            .first()
        )
        parametros = {
            "esteira_id": esteira.id,
            "nome_esteira": esteira.nome,
            "limite": esteira.limite_valor,
        }

        if regra:
            regra.nome = esteira.nome
            regra.descricao = "Gerada automaticamente pela Esteira Comercial"
            regra.parametros = parametros
            regra.atualizado_por = usuario
            atualizadas += 1
        else:
            regra = RegraAntifraude(
                nome=esteira.nome,
                descricao="Gerada automaticamente pela Esteira Comercial",
                tipo=TipoRegra.LIMITE_CORRETOR_SHADOW,
                parametros=parametros,
                peso_score=0,
                bloqueante=False,
                shadow_mode=True,
                prioridade=200,
                ativo=True,
                esteira_id=esteira.id,
                criado_por=usuario,
                atualizado_por=usuario,
            )
            db.add(regra)
            criadas += 1

    return {
        "esteiras_elegiveis": len(esteiras),
        "regras_criadas": criadas,
        "regras_atualizadas": atualizadas,
    }
