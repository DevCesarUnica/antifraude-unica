"""
Módulo RPA para o banco exemplo — template base para novos bancos.

Para implementar um novo banco:
1. Crie bancos/<nome_banco>.py copiando este template
2. Implemente a função `enviar(proposta: dict) -> dict`
3. O nome do arquivo deve ser o nome do banco em snake_case
   (ex: banco do brasil → banco_do_brasil.py)
"""

from playwright.async_api import async_playwright


PORTAL_URL = "https://portal.exemplobanco.com.br"


async def enviar(proposta: dict) -> dict:
    """
    Automatiza o envio de uma proposta ao portal do banco.

    Retorna:
      {"sucesso": True/False, "id_operacao": "...", "mensagem": "..."}
    """
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        page = await browser.new_page()

        try:
            # 1. Login no portal
            await page.goto(f"{PORTAL_URL}/login")
            await page.fill("#usuario", "LOGIN_DO_BANCO")
            await page.fill("#senha", "SENHA_DO_BANCO")
            await page.click("button[type=submit]")
            await page.wait_for_url(f"{PORTAL_URL}/dashboard")

            # 2. Navega para nova proposta
            await page.click("#nova-proposta")

            # 3. Preenche formulário
            await page.fill("#cpf-cliente", proposta["cpf_cliente"])
            await page.fill("#valor", str(proposta["valor"]))
            await page.select_option("#convenio", proposta.get("convenio", ""))

            # 4. Submete
            await page.click("#enviar-proposta")
            await page.wait_for_selector("#confirmacao")

            # 5. Captura ID da operação
            id_operacao = await page.inner_text("#id-operacao")

            return {
                "sucesso": True,
                "id_operacao": id_operacao,
                "mensagem": "Proposta enviada com sucesso",
            }

        except Exception as exc:
            return {
                "sucesso": False,
                "id_operacao": None,
                "mensagem": str(exc),
            }

        finally:
            await browser.close()
