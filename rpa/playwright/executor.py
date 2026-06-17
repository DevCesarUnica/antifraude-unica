"""
RPA Executor — automatiza o envio de propostas aprovadas ao portal do banco.

Estrutura intencional:
  - Cada banco tem seu próprio módulo em /bancos/
  - O executor recebe uma proposta aprovada e chama o módulo correto
  - Resultado é postado de volta na API antifraude

Uso:
  python executor.py --proposta-id <uuid>
"""

import argparse
import asyncio
import os
import importlib
import httpx
from dotenv import load_dotenv

load_dotenv()

API_URL = os.getenv("ANTIFRAUDE_API_URL", "http://localhost:8000")
API_TOKEN = os.getenv("ANTIFRAUDE_API_TOKEN", "")


async def executar(proposta_id: str):
    # 1. Busca proposta na API
    async with httpx.AsyncClient(
        base_url=API_URL,
        headers={"Authorization": f"Bearer {API_TOKEN}"},
    ) as client:
        resp = await client.get(f"/propostas/{proposta_id}")
        resp.raise_for_status()
        proposta = resp.json()

    banco = proposta["banco"].lower().replace(" ", "_")

    # 2. Importa módulo do banco dinamicamente
    try:
        modulo = importlib.import_module(f"bancos.{banco}")
    except ModuleNotFoundError:
        print(f"[RPA] Banco '{banco}' não tem módulo RPA implementado.")
        return

    # 3. Executa automação
    resultado = await modulo.enviar(proposta)

    # 4. Retorna resultado para a API
    async with httpx.AsyncClient(
        base_url=API_URL,
        headers={"Authorization": f"Bearer {API_TOKEN}"},
    ) as client:
        await client.post(
            f"/propostas/{proposta_id}/retorno_rpa",
            json=resultado,
        )

    print(f"[RPA] Proposta {proposta_id} processada: {resultado}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--proposta-id", required=True)
    args = parser.parse_args()
    asyncio.run(executar(args.proposta_id))
