"""
Interface base para adapters de banco.

Para adicionar um novo banco:
1. Crie um arquivo em services/banks/<slug>.py
2. Implemente a classe herdando de BankAdapter
3. Registre a classe em registry.py

Envio de proposta aprovada NÃO faz parte deste contrato — cada banco tem um
fluxo próprio e específico demais para generalizar aqui (ex: Hope/Titan usa
services/titan_envio.py, com payload, idempotência e mapeamento de IDs
próprios da API Titan). Implemente o envio no módulo do banco e chame-o
diretamente do router, como já é feito em routers/propostas.py::enviar_banco.
"""
from abc import ABC, abstractmethod
from typing import TypedDict


class StatusIntegracao(TypedDict):
    ok: bool
    latencia_ms: float
    detalhe: str


class BankAdapter(ABC):
    """
    Contrato comum para todas as integrações bancárias.
    Cada banco implementa via API direta ou RPA/Playwright.
    """

    @property
    @abstractmethod
    def slug(self) -> str:
        """Identificador único (ex: 'hope', 'daycoval', 'bmg')."""
        ...

    @property
    @abstractmethod
    def nome(self) -> str:
        """Nome legível (ex: 'Hope (Titan/Ceoslab)')."""
        ...

    @property
    def tipo(self) -> str:
        """'api' ou 'rpa' — informa o frontend como a integração funciona."""
        return "api"

    @abstractmethod
    async def health_check(self) -> StatusIntegracao:
        """Verifica se a integração está operacional."""
        ...

    @abstractmethod
    async def get_produtos(self) -> list[dict]:
        """Lista produtos disponíveis neste banco."""
        ...

    async def consultar_operacao(self, id_operacao: str) -> dict:
        """Consulta status de operação já enviada. Override quando disponível."""
        return {"implementado": False, "id_operacao": id_operacao}

    async def get_referencia(self) -> dict:
        """
        Dados de referência auxiliares (bancos, convênios, profissões, etc.).
        Override em bancos que fornecem esses dados via API.
        """
        return {}
