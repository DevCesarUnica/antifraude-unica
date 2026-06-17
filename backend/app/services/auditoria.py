"""
Auditoria append-only — registros imutáveis de todos os eventos.

Regra de ouro: NUNCA atualizar ou deletar registros de auditoria.
Toda alteração de estado gera um novo registro.
"""

from datetime import datetime
from sqlalchemy.orm import Session
from app.models import AuditoriaLog, TipoEvento
from app.core.logging import log


class AuditoriaService:
    def __init__(self, db: Session):
        self._db = db

    def registrar(
        self,
        proposta_id: str,
        evento: TipoEvento,
        dados: dict | None = None,
        usuario: str | None = None,
        ip_origem: str | None = None,
    ) -> AuditoriaLog:
        entrada = AuditoriaLog(
            proposta_id=proposta_id,
            evento=evento,
            dados=dados or {},
            usuario=usuario,
            ip_origem=ip_origem,
            timestamp=datetime.utcnow(),
        )
        self._db.add(entrada)
        self._db.flush()
        log.info(
            "auditoria.registrado",
            proposta_id=proposta_id,
            evento=evento,
        )
        return entrada

    def historico(self, proposta_id: str) -> list[AuditoriaLog]:
        return (
            self._db.query(AuditoriaLog)
            .filter(AuditoriaLog.proposta_id == proposta_id)
            .order_by(AuditoriaLog.timestamp.asc())
            .all()
        )
