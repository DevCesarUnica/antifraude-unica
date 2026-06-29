"""
Auditoria append-only — registros imutáveis de todos os eventos.

Regra de ouro: NUNCA atualizar ou deletar registros de auditoria.
Toda alteração de estado gera um novo registro.
"""

from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models import AuditoriaLog, TipoEvento
from app.core.logging import log


# ── Auditoria de ações de usuários ────────────────────────────────────────────

def log_auditoria(
    db: Session,
    acao: str,
    usuario=None,
    request=None,
    tipo_entidade: str | None = None,
    entidade_id: str | None = None,
    antes: dict | None = None,
    depois: dict | None = None,
    risco: str = "BAIXO",
    sucesso: bool = True,
    erro: str | None = None,
) -> None:
    """
    Registra ação de usuário na trilha de auditoria. Nunca propaga exceções.

    Usa SAVEPOINT (begin_nested) para garantir que uma falha no registro de
    auditoria NÃO corrompa a transação principal da requisição.
    """
    try:
        from app.models import LogAuditoria
        ip = request.client.host if (request and request.client) else None
        user_agent = request.headers.get("user-agent") if request else None
        perfil_val = getattr(usuario, "perfil", None)
        entrada = LogAuditoria(
            usuario_id=getattr(usuario, "id", None),
            username=getattr(usuario, "username", None),
            nome=getattr(usuario, "nome", None),
            perfil=str(perfil_val) if perfil_val else None,
            acao=acao,
            tipo_entidade=tipo_entidade,
            entidade_id=entidade_id,
            antes=antes,
            depois=depois,
            risco=risco,
            ip=ip,
            user_agent=user_agent,
            origem="web",
            sucesso=sucesso,
            erro=erro,
        )
        # SAVEPOINT: se o INSERT de auditoria falhar, só o savepoint é revertido.
        # A transação externa (login, aprovação, etc.) continua intacta.
        sp = db.begin_nested()
        db.add(entrada)
        sp.commit()
    except Exception as exc:
        log.warning("auditoria.log_erro", erro=str(exc))


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
            timestamp=datetime.now(timezone.utc),
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
