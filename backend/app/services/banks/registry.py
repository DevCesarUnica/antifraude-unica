"""
Registro central de adapters de banco.

Para adicionar um novo banco:
  1. Crie services/banks/<slug>.py com classe herdando BankAdapter
  2. Importe e adicione a classe em _ADAPTER_CLASSES abaixo
  3. Pronto — o router /bancos detecta automaticamente
"""
from app.services.banks.base import BankAdapter


# ── Adicione novos adapters aqui ──────────────────────────────────────────────
def _build_registry() -> dict[str, BankAdapter]:
    from app.services.banks.hope import HopeAdapter

    adapter_classes = [
        HopeAdapter,
        # DaycovalAdapter,  # exemplo futuro
        # BmgAdapter,
        # PanAdapter,
    ]

    return {cls.slug: cls() for cls in adapter_classes}


_registry: dict[str, BankAdapter] | None = None


def _get_registry() -> dict[str, BankAdapter]:
    global _registry
    if _registry is None:
        _registry = _build_registry()
    return _registry


def get_adapter(slug: str) -> BankAdapter:
    registry = _get_registry()
    if slug not in registry:
        disponiveis = list(registry)
        raise KeyError(f"Banco '{slug}' não configurado. Disponíveis: {disponiveis}")
    return registry[slug]


def list_adapters() -> list[BankAdapter]:
    return list(_get_registry().values())
