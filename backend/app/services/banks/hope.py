"""
Adapter para o banco Hope — plataforma Titan/Ceoslab.

Fornece dados de referência (bancos, convênios, profissões, produtos Daycoval)
via API REST. Envio de propostas ainda não tem endpoint dedicado; usar RPA.
"""
import time

from app.services.banks.base import BankAdapter, ResultadoEnvio, StatusIntegracao
from app.services.titan import TitanService, TitanAPIError


class HopeAdapter(BankAdapter):
    slug = "hope"
    nome = "Hope (Titan / Ceoslab)"
    tipo = "api"

    async def health_check(self) -> StatusIntegracao:
        t0 = time.monotonic()
        try:
            async with TitanService() as titan:
                bancos = await titan.get_banks(force_refresh=True)
            return {
                "ok": True,
                "latencia_ms": round((time.monotonic() - t0) * 1000, 1),
                "detalhe": f"API Titan respondendo — {len(bancos)} bancos carregados",
            }
        except TitanAPIError as exc:
            return {
                "ok": False,
                "latencia_ms": round((time.monotonic() - t0) * 1000, 1),
                "detalhe": str(exc),
            }
        except Exception as exc:
            return {
                "ok": False,
                "latencia_ms": round((time.monotonic() - t0) * 1000, 1),
                "detalhe": f"Erro inesperado: {exc}",
            }

    async def get_produtos(self) -> list[dict]:
        async with TitanService() as titan:
            return await titan.get_daycoval_products()

    async def enviar_proposta(self, proposta: dict) -> ResultadoEnvio:
        # Hope ainda não tem endpoint de submissão de proposta —
        # apenas dados de referência. Usar RPA para envio.
        return {
            "sucesso": False,
            "id_operacao": None,
            "mensagem": "Hope API não possui endpoint de envio de proposta. Use o módulo RPA.",
        }

    async def get_referencia(self) -> dict:
        """Retorna todos os dados de referência Titan em paralelo."""
        async with TitanService() as titan:
            return await titan.get_all()
