"""
Motor Antifraude — avalia propostas contra regras configuráveis.

Design:
  - Regras carregadas do banco (sem deploy para alterar)
  - Versionadas e auditáveis
  - Avaliação em cascata ordenada por prioridade
  - Resultado: APROVADO / MANUAL / BLOQUEADO + score 0-100

Tipos de regra:
  BLACKLIST      → CPF do cliente na lista negra
  VALOR_MAXIMO   → Valor da proposta excede limite do corretor/convênio
  BANCO_CONVENIO → Combinação banco+convênio bloqueada
  UF_BLOQUEADA   → UF do cliente na lista de restrição
  SCORE_RISCO    → Score acumulado ultrapassa limiar
  LIMITE_DIARIO  → Corretor ultrapassou volume diário permitido
"""

from dataclasses import dataclass, field
from datetime import date
from typing import Any

from sqlalchemy.orm import Session

from app.models import (
    Proposta, RegraAntifraude, Blacklist, Convenio, TipoRegra, ResultadoMotor
)
from app.core.logging import log


@dataclass
class ResultadoRegra:
    disparou: bool
    motivo: str = ""
    score_contribuicao: int = 0
    bloqueante: bool = False
    detalhes: dict = field(default_factory=dict)


@dataclass
class Decisao:
    resultado: ResultadoMotor
    score: int
    motivo_principal: str
    flags: list[str] = field(default_factory=list)
    regras_disparadas: list[dict] = field(default_factory=list)
    versao_regras: int = 1


class MotorAntifraude:
    # Thresholds de decisão
    SCORE_MANUAL   = 40   # score >= 40 → análise manual
    SCORE_BLOQUEIO = 80   # score >= 80 → bloqueio automático

    def __init__(self, db: Session):
        self._db = db

    # ── Ponto de entrada público ──────────────────────────────────────────────

    def avaliar(self, proposta: Proposta) -> Decisao:
        self._auto_mapear_convenio(proposta)
        regras = self._carregar_regras()
        log.info(
            "motor.inicio",
            proposta_id=proposta.id,
            total_regras=len(regras),
        )

        score_acumulado = 0
        flags: list[str] = []
        regras_disparadas: list[dict] = []

        for regra in regras:
            resultado = self._avaliar_regra(proposta, regra)

            if resultado.disparou:
                flags.append(regra.nome)
                regras_disparadas.append({
                    "regra_id": regra.id,
                    "nome": regra.nome,
                    "tipo": regra.tipo,
                    "score_contribuicao": resultado.score_contribuicao,
                    "bloqueante": resultado.bloqueante,
                    "motivo": resultado.motivo,
                    "detalhes": resultado.detalhes,
                })

                if resultado.bloqueante:
                    log.warning(
                        "motor.bloqueio",
                        proposta_id=proposta.id,
                        regra=regra.nome,
                        motivo=resultado.motivo,
                    )
                    return Decisao(
                        resultado=ResultadoMotor.BLOQUEADO,
                        score=100,
                        motivo_principal=resultado.motivo,
                        flags=flags,
                        regras_disparadas=regras_disparadas,
                    )

                score_acumulado = min(score_acumulado + resultado.score_contribuicao, 100)

        # Decisão por score acumulado
        if score_acumulado >= self.SCORE_BLOQUEIO:
            resultado_final = ResultadoMotor.BLOQUEADO
            motivo = f"Score de risco {score_acumulado}/100 acima do limiar de bloqueio"
        elif score_acumulado >= self.SCORE_MANUAL:
            resultado_final = ResultadoMotor.MANUAL
            motivo = f"Score de risco {score_acumulado}/100 requer análise manual"
        else:
            resultado_final = ResultadoMotor.APROVADO
            motivo = f"Proposta aprovada automaticamente (score {score_acumulado}/100)"

        log.info(
            "motor.decisao",
            proposta_id=proposta.id,
            resultado=resultado_final,
            score=score_acumulado,
        )

        return Decisao(
            resultado=resultado_final,
            score=score_acumulado,
            motivo_principal=motivo,
            flags=flags,
            regras_disparadas=regras_disparadas,
        )

    # ── Auto-mapeamento de convênio ───────────────────────────────────────────

    def _auto_mapear_convenio(self, proposta: Proposta) -> None:
        if not proposta.convenio:
            return
        existente = self._db.query(Convenio).filter(
            Convenio.nome == proposta.convenio
        ).first()
        if not existente:
            novo = Convenio(
                nome=proposta.convenio,
                banco=proposta.banco,
                ativo=True,
                auto_registrado=True,
            )
            self._db.add(novo)
            self._db.flush()

    # ── Avaliação individual por tipo ─────────────────────────────────────────

    def _avaliar_regra(self, proposta: Proposta, regra: RegraAntifraude) -> ResultadoRegra:
        try:
            avaliadores = {
                TipoRegra.BLACKLIST:      self._blacklist,
                TipoRegra.VALOR_MAXIMO:   self._valor_maximo,
                TipoRegra.BANCO_CONVENIO: self._banco_convenio,
                TipoRegra.UF_BLOQUEADA:   self._uf_bloqueada,
                TipoRegra.SCORE_RISCO:    self._score_risco,
                TipoRegra.LIMITE_DIARIO:  self._limite_diario,
            }
            avaliador = avaliadores.get(regra.tipo)
            if not avaliador:
                return ResultadoRegra(disparou=False)
            return avaliador(proposta, regra.parametros, regra.peso_score, regra.bloqueante)
        except Exception as exc:
            log.error("motor.regra_erro", regra_id=regra.id, error=str(exc))
            return ResultadoRegra(disparou=False)

    def _blacklist(self, proposta: Proposta, params: dict, peso: int, bloqueante: bool) -> ResultadoRegra:
        """CPF do cliente consta na blacklist."""
        entry = self._db.query(Blacklist).filter(
            Blacklist.cpf == proposta.cpf_cliente
        ).first()
        if entry:
            return ResultadoRegra(
                disparou=True,
                motivo=f"CPF {proposta.cpf_cliente} na blacklist: {entry.motivo}",
                score_contribuicao=peso,
                bloqueante=bloqueante,
                detalhes={"cpf": proposta.cpf_cliente, "motivo_blacklist": entry.motivo},
            )
        return ResultadoRegra(disparou=False)

    def _valor_maximo(self, proposta: Proposta, params: dict, peso: int, bloqueante: bool) -> ResultadoRegra:
        """Valor da proposta excede o limite configurado."""
        limite = params.get("valor_maximo", 0)
        if proposta.valor > limite:
            return ResultadoRegra(
                disparou=True,
                motivo=f"Valor R$ {proposta.valor:,.2f} excede limite de R$ {limite:,.2f}",
                score_contribuicao=peso,
                bloqueante=bloqueante,
                detalhes={"valor": proposta.valor, "limite": limite},
            )
        return ResultadoRegra(disparou=False)

    def _banco_convenio(self, proposta: Proposta, params: dict, peso: int, bloqueante: bool) -> ResultadoRegra:
        """Combinação banco + convênio está na lista de restrição."""
        combinacoes_bloqueadas: list[dict] = params.get("combinacoes", [])
        for combo in combinacoes_bloqueadas:
            banco_match = combo.get("banco", "*") in ("*", proposta.banco)
            convenio_match = combo.get("convenio", "*") in ("*", proposta.convenio)
            if banco_match and convenio_match:
                return ResultadoRegra(
                    disparou=True,
                    motivo=f"Combinação {proposta.banco}+{proposta.convenio} restrita",
                    score_contribuicao=peso,
                    bloqueante=bloqueante,
                    detalhes={"banco": proposta.banco, "convenio": proposta.convenio},
                )
        return ResultadoRegra(disparou=False)

    def _uf_bloqueada(self, proposta: Proposta, params: dict, peso: int, bloqueante: bool) -> ResultadoRegra:
        """UF do cliente na lista de estados bloqueados."""
        ufs_bloqueadas: list[str] = params.get("ufs", [])
        if proposta.uf_cliente and proposta.uf_cliente.upper() in [u.upper() for u in ufs_bloqueadas]:
            return ResultadoRegra(
                disparou=True,
                motivo=f"UF {proposta.uf_cliente} bloqueada para operações",
                score_contribuicao=peso,
                bloqueante=bloqueante,
                detalhes={"uf": proposta.uf_cliente},
            )
        return ResultadoRegra(disparou=False)

    def _score_risco(self, proposta: Proposta, params: dict, peso: int, bloqueante: bool) -> ResultadoRegra:
        """Regra genérica baseada em score — avalia múltiplos fatores."""
        score_local = 0
        detalhes = {}

        # Fator: valor alto relativo ao histórico
        valor_medio = params.get("valor_medio_referencia", 10000)
        if proposta.valor > valor_medio * 3:
            score_local += 20
            detalhes["valor_alto"] = True

        if score_local > 0:
            return ResultadoRegra(
                disparou=True,
                motivo=f"Score de risco acumulado: {score_local} pontos",
                score_contribuicao=min(score_local, peso),
                bloqueante=bloqueante and score_local >= peso,
                detalhes=detalhes,
            )
        return ResultadoRegra(disparou=False)

    def _limite_diario(self, proposta: Proposta, params: dict, peso: int, bloqueante: bool) -> ResultadoRegra:
        """Verifica se o corretor ultrapassou o volume diário permitido."""
        if not proposta.corretor_id:
            return ResultadoRegra(disparou=False)

        from app.models import Proposta as P, StatusProposta
        from sqlalchemy import func

        limite = params.get("limite_valor_diario", 0)
        hoje = date.today()

        total_hoje = self._db.query(func.sum(P.valor)).filter(
            P.corretor_id == proposta.corretor_id,
            P.status.in_([StatusProposta.APROVADA, StatusProposta.ENVIADA_BANCO, StatusProposta.CONFIRMADA_BANCO]),
            func.date(P.criado_em) == hoje,
        ).scalar() or 0.0

        if total_hoje + proposta.valor > limite:
            return ResultadoRegra(
                disparou=True,
                motivo=f"Corretor ultrapassaria limite diário: R$ {total_hoje:,.2f} + R$ {proposta.valor:,.2f} > R$ {limite:,.2f}",
                score_contribuicao=peso,
                bloqueante=bloqueante,
                detalhes={"total_hoje": total_hoje, "valor_proposta": proposta.valor, "limite": limite},
            )
        return ResultadoRegra(disparou=False)

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _carregar_regras(self) -> list[RegraAntifraude]:
        return (
            self._db.query(RegraAntifraude)
            .filter(RegraAntifraude.ativo == True)
            .order_by(RegraAntifraude.prioridade.asc())
            .all()
        )
