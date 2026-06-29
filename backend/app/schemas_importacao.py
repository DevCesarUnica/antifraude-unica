"""
Data Contract de Importação — PropostaImportacao.

Template universal que TODAS as origens (Storm, Hope, CSV, futuro) devem produzir.
A regra é: adapte a API ao template, nunca o contrário.

Campos obrigatórios têm default "Não informado" para garantir que o sistema
nunca receba None em posições críticas.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, field_validator, model_validator


# ── Sub-modelos ───────────────────────────────────────────────────────────────

class PropostaDados(BaseModel):
    ade: str = "Não informado"
    status: str = "Não informado"
    valor: float = 0.0
    produto: str = "Não informado"

    @field_validator("valor")
    @classmethod
    def valor_nao_negativo(cls, v: float) -> float:
        return max(v, 0.0)

    @field_validator("ade", "status", "produto", mode="before")
    @classmethod
    def nunca_vazio(cls, v: Any) -> str:
        s = str(v).strip() if v is not None else ""
        return s or "Não informado"


class ClienteDados(BaseModel):
    nome: str = "Não informado"
    cpf: str = "Não informado"
    data_nascimento: str | None = None
    telefone: str | None = None

    @field_validator("nome", mode="before")
    @classmethod
    def nome_fallback(cls, v: Any) -> str:
        s = str(v).strip() if v is not None else ""
        return s or "Não informado"

    @field_validator("cpf", mode="before")
    @classmethod
    def normalizar_cpf(cls, v: Any) -> str:
        if v is None:
            return "Não informado"
        digits = re.sub(r"\D", "", str(v))
        if len(digits) in (11, 14):
            return digits
        raw = str(v).strip()
        return raw or "Não informado"


class CorretorDados(BaseModel):
    codigo: str | None = None
    nome: str | None = None

    @model_validator(mode="before")
    @classmethod
    def limpar_vazios(cls, data: Any) -> Any:
        if isinstance(data, dict):
            return {
                k: (v.strip() if isinstance(v, str) and v.strip() else None) if isinstance(v, str) else v
                for k, v in data.items()
            }
        return data


class BancoDados(BaseModel):
    nome: str = "Não informado"
    codigo: str | None = None

    @field_validator("nome", mode="before")
    @classmethod
    def nome_fallback(cls, v: Any) -> str:
        s = str(v).strip() if v is not None else ""
        return s or "Não informado"


class ConvenioDados(BaseModel):
    nome: str = "Não informado"
    codigo: str | None = None

    @field_validator("nome", mode="before")
    @classmethod
    def nome_fallback(cls, v: Any) -> str:
        s = str(v).strip() if v is not None else ""
        return s or "Não informado"


class DatasImportacao(BaseModel):
    data_importacao: str
    data_atualizacao: str | None = None
    data_agendamento: str | None = None

    @field_validator("data_importacao", mode="before")
    @classmethod
    def garantir_data(cls, v: Any) -> str:
        if not v:
            return datetime.now(timezone.utc).isoformat()
        return str(v)


class MetadataImportacao(BaseModel):
    raw: dict[str, Any]
    origem_sistema: str

    @field_validator("origem_sistema", mode="before")
    @classmethod
    def nao_vazio(cls, v: Any) -> str:
        s = str(v).strip() if v is not None else ""
        return s or "desconhecido"


# ── Modelo principal ──────────────────────────────────────────────────────────

class PropostaImportacao(BaseModel):
    """
    Data Contract universal de importação.

    Toda integração externa (Storm, Hope, CSV) DEVE produzir este formato.
    O sistema interno NUNCA deve ler campos raw de APIs diretamente —
    sempre passa por um adapter que produz PropostaImportacao.
    """
    origem: Literal["storm", "hope", "csv", "outro"]
    id_externo: str

    proposta: PropostaDados
    cliente: ClienteDados
    corretor: CorretorDados
    banco: BancoDados
    convenio: ConvenioDados
    datas: DatasImportacao
    observacoes: str | None = None
    metadata: MetadataImportacao

    @field_validator("id_externo", mode="before")
    @classmethod
    def id_nao_vazio(cls, v: Any) -> str:
        s = str(v).strip() if v is not None else ""
        if not s:
            raise ValueError("id_externo é obrigatório")
        return s

    def para_proposta_create(self) -> dict:
        """Converte para o formato PropostaCreate (inserção no banco)."""
        return {
            "proposta_id_externo": self.id_externo,
            "cpf_cliente": self.cliente.cpf,
            "nome_cliente": self.cliente.nome if self.cliente.nome != "Não informado" else None,
            "banco": self.banco.nome,
            "convenio": self.convenio.nome if self.convenio.nome != "Não informado" else None,
            "produto": self.proposta.produto if self.proposta.produto != "Não informado" else None,
            "valor": self.proposta.valor,
            "payload_original": self.metadata.raw,
        }

    def resumo(self) -> dict:
        """Resumo para logs e UI."""
        return {
            "origem": self.origem,
            "id_externo": self.id_externo,
            "cliente": self.cliente.nome,
            "cpf": self.cliente.cpf[:3] + "***" + self.cliente.cpf[-2:] if len(self.cliente.cpf) >= 5 else "***",
            "banco": self.banco.nome,
            "valor": self.proposta.valor,
            "status": self.proposta.status,
        }
