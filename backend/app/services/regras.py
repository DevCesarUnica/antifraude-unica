from abc import ABC, abstractmethod
from typing import List

from sqlalchemy.orm import Session

from app import models


def processar_proposta(proposta: models.Proposta, db: Session) -> str:
    """
    Engine de regras de negocio.

    Avalia uma proposta recem criada e devolve o status calculado.

    Ordem de avaliacao:
        1. CPF na blacklist                 -> PENDENTE
        2. Convenio nao cadastrado          -> NAO_MAPEADA
        3. Corretor sem grupo               -> ANALISAR
        4. valor <= grupo.limite            -> APROVADA
        5. valor >  grupo.limite            -> ANALISAR
    """

    # Regra 1: CPF na blacklist
    na_blacklist = (
        db.query(models.Blacklist)
        .filter(models.Blacklist.cpf == proposta.cpf_cliente)
        .first()
    )
    if na_blacklist:
        return "PENDENTE"

    # Regra 2: Convenio nao mapeado
    if proposta.convenio:
        convenio_obj = (
            db.query(models.Convenio)
            .filter(models.Convenio.nome == proposta.convenio)
            .first()
        )
        if convenio_obj is None:
            return "NAO_MAPEADA"

    # Regra 3/4/5: Baseado no grupo do corretor
    if proposta.corretor_id is None:
        return "ANALISAR"

    corretor = (
        db.query(models.Corretor)
        .filter(models.Corretor.id == proposta.corretor_id)
        .first()
    )

    if corretor is None or corretor.grupo_id is None:
        return "ANALISAR"

    grupo = (
        db.query(models.Grupo)
        .filter(models.Grupo.id == corretor.grupo_id)
        .first()
    )

    if grupo is None:
        return "ANALISAR"

    if proposta.valor <= grupo.limite:
        return "APROVADA"

    return "ANALISAR"


# ---------------------------------------------------------------------------
# Interface futura para integracao bancaria
# ---------------------------------------------------------------------------

class BancoIntegration(ABC):
    """Contrato para integracoes com sistemas bancarios externos."""

    @abstractmethod
    def importar_propostas(self) -> List[dict]:
        """
        Busca propostas pendentes no banco parceiro e retorna uma lista
        de dicionarios prontos para criar instancias de Proposta.
        """

    @abstractmethod
    def aprovar_proposta(self, proposta: models.Proposta) -> bool:
        """
        Envia aprovacao de uma proposta ao banco parceiro.
        Retorna True em caso de sucesso, False caso contrario.
        """
