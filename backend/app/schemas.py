"""
Schemas Pydantic — validação de entrada e serialização de saída.
"""

from __future__ import annotations
from datetime import datetime
from typing import Any
from pydantic import BaseModel, field_validator


# ── Proposta ─────────────────────────────────────────────────────────────────

class PropostaCreate(BaseModel):
    proposta_id_externo: str
    corretor_id: str | None = None
    cpf_cliente: str
    nome_cliente: str | None = None
    uf_cliente: str | None = None
    banco: str
    convenio: str | None = None
    produto: str | None = None
    valor: float
    payload_original: dict[str, Any] | None = None

    @field_validator("valor")
    @classmethod
    def valor_positivo(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("Valor deve ser positivo")
        return v

    @field_validator("cpf_cliente")
    @classmethod
    def cpf_apenas_digitos(cls, v: str) -> str:
        digits = v.replace(".", "").replace("-", "").replace("/", "")
        if not digits.isdigit() or len(digits) not in (11, 14):
            raise ValueError("CPF/CNPJ inválido")
        return digits


class PropostaOut(BaseModel):
    id: str
    proposta_id_externo: str
    corretor_id: str | None
    cpf_cliente: str
    nome_cliente: str | None
    uf_cliente: str | None
    banco: str
    convenio: str | None
    produto: str | None
    valor: float
    status: str
    score_fraude: int | None
    resultado_motor: str | None
    decisao_detalhes: dict | None
    corretor_resolucao: dict | None = None
    limite_corretor_shadow: dict | None = None
    tentativas: int
    ultimo_erro: str | None
    criado_em: datetime
    atualizado_em: datetime

    model_config = {"from_attributes": True}


class PropostasListaResponse(BaseModel):
    items: list[PropostaOut]
    total: int
    skip: int
    limit: int


class PropostaSummary(BaseModel):
    total: int
    enfileiradas: int
    em_analise: int
    aprovadas: int
    reprovadas: int
    bloqueadas: int
    analise_manual: int
    enviadas_banco: int
    confirmadas_banco: int
    erro: int
    # Soma de Proposta.valor por status — permite os cards do dashboard
    # mostrarem "N propostas / R$ X", como na Mesa de Crédito do WebDeck.
    valor_total: float = 0.0
    valores_por_status: dict[str, float] = {}


class PropostaDashboardItem(BaseModel):
    id: str
    ade: str
    banco: str
    convenio: str | None
    produto: str | None
    corretor: str | None
    corretor_id: str | None
    valor: float
    status: str
    cpf: str
    nome_cliente: str | None
    uf_cliente: str | None
    observacoes: str | None
    data_importacao: datetime
    data_atualizacao: datetime
    data_agendamento: str | None
    possui_arquivos: bool
    score_fraude: int | None
    resultado_motor: str | None
    origem: str
    tentativas: int
    corretor_esteira: str | None = None
    corretor_limite: float | None = None
    limite_corretor_status: str | None = None


class PropostasDashboardResponse(BaseModel):
    items: list[PropostaDashboardItem]
    total: int
    skip: int
    limit: int


# ── Regra Antifraude ─────────────────────────────────────────────────────────

class RegraCreate(BaseModel):
    nome: str
    descricao: str | None = None
    tipo: str
    parametros: dict[str, Any]
    peso_score: int = 0
    bloqueante: bool = False
    shadow_mode: bool = False
    prioridade: int = 100
    ativo: bool = True

    @field_validator("nome")
    @classmethod
    def nome_nao_vazio(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Nome é obrigatório")
        return v.strip()

    @field_validator("peso_score")
    @classmethod
    def peso_nao_negativo(cls, v: int) -> int:
        if v < 0:
            raise ValueError("Peso não pode ser negativo")
        return v

    @field_validator("prioridade")
    @classmethod
    def prioridade_positiva(cls, v: int) -> int:
        if v < 1:
            raise ValueError("Prioridade deve ser >= 1")
        return v


class RegraUpdate(BaseModel):
    nome: str | None = None
    descricao: str | None = None
    parametros: dict[str, Any] | None = None
    peso_score: int | None = None
    bloqueante: bool | None = None
    shadow_mode: bool | None = None
    prioridade: int | None = None
    ativo: bool | None = None

    @field_validator("nome")
    @classmethod
    def nome_nao_vazio(cls, v: str | None) -> str | None:
        if v is not None and not v.strip():
            raise ValueError("Nome não pode ser vazio")
        return v.strip() if v is not None else v

    @field_validator("peso_score")
    @classmethod
    def peso_nao_negativo(cls, v: int | None) -> int | None:
        if v is not None and v < 0:
            raise ValueError("Peso não pode ser negativo")
        return v

    @field_validator("prioridade")
    @classmethod
    def prioridade_positiva(cls, v: int | None) -> int | None:
        if v is not None and v < 1:
            raise ValueError("Prioridade deve ser >= 1")
        return v


class RegraOut(BaseModel):
    id: str
    nome: str
    descricao: str | None
    tipo: str
    parametros: dict
    peso_score: int
    bloqueante: bool
    shadow_mode: bool
    prioridade: int
    ativo: bool
    versao: int
    criado_por: str | None = None
    atualizado_por: str | None = None
    criado_em: datetime
    atualizado_em: datetime
    # Preenchido só quando gerada automaticamente a partir de uma Esteira
    # Comercial — ver app/services/gerar_regras_esteiras.py.
    esteira_id: str | None = None

    model_config = {"from_attributes": True}


# ── Simulador de Regras ────────────────────────────────────────────────────────
# Executa antifraude.avaliar() contra uma proposta transitória (nunca
# persistida) — usado pela aba "Simulador" da tela /regras.

class SimulacaoRequest(BaseModel):
    cpf_cliente: str
    banco: str = "SIMULACAO"
    convenio: str | None = None
    uf_cliente: str | None = None
    produto: str | None = None
    valor: float

    @field_validator("valor")
    @classmethod
    def valor_positivo(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("Valor deve ser positivo")
        return v

    @field_validator("cpf_cliente")
    @classmethod
    def cpf_apenas_digitos(cls, v: str) -> str:
        digits = v.replace(".", "").replace("-", "").replace("/", "")
        if not digits.isdigit() or len(digits) not in (11, 14):
            raise ValueError("CPF/CNPJ inválido")
        return digits


class RegraDisparadaOut(BaseModel):
    regra_id: str
    nome: str
    tipo: str
    score_contribuicao: int
    bloqueante: bool
    motivo: str
    detalhes: dict
    efeito: str  # REAL | SHADOW


class SimulacaoResponse(BaseModel):
    resultado: str
    score: int
    motivo_principal: str
    flags: list[str]
    regras_disparadas: list[RegraDisparadaOut]


# ── Blacklist ─────────────────────────────────────────────────────────────────

class BlacklistAdd(BaseModel):
    cpf: str
    motivo: str


class BlacklistOut(BaseModel):
    id: str
    cpf: str
    motivo: str
    adicionado_por: str | None
    criado_em: datetime

    model_config = {"from_attributes": True}


# ── Auditoria ─────────────────────────────────────────────────────────────────

class AuditoriaOut(BaseModel):
    id: str
    proposta_id: str
    evento: str
    dados: dict | None
    usuario: str | None
    ip_origem: str | None
    timestamp: datetime

    model_config = {"from_attributes": True}


# ── Auth / Usuário ────────────────────────────────────────────────────────────

class UsuarioCreate(BaseModel):
    email: str
    username: str
    nome: str
    cargo: str | None = None
    senha: str
    perfil: str = "operador"


class UsuarioUpdate(BaseModel):
    nome: str | None = None
    cargo: str | None = None
    perfil: str | None = None
    ativo: bool | None = None
    senha: str | None = None


class UsuarioOut(BaseModel):
    id: str
    email: str
    username: str
    nome: str
    cargo: str | None
    perfil: str
    ativo: bool
    criado_em: datetime

    model_config = {"from_attributes": True}


class LoginRequest(BaseModel):
    identificador: str  # email OU username
    senha: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    usuario: UsuarioOut


# ── Titan ─────────────────────────────────────────────────────────────────────

class TitanStatusOut(BaseModel):
    circuit_breaker: str
    estado: str


# ── Corretor ─────────────────────────────────────────────────────────────────

class CorretorCreate(BaseModel):
    nome: str
    # Opcional: corretores importados do WebDeck não têm CPF, só código interno.
    cpf: str | None = None
    email: str | None = None
    telefone: str | None = None
    codigo_externo: str | None = None
    grupo_id: str | None = None
    limite_valor_diario: float = 0.0


class CorretorUpdate(BaseModel):
    nome: str | None = None
    email: str | None = None
    telefone: str | None = None
    codigo_externo: str | None = None
    grupo_id: str | None = None
    limite_valor_diario: float | None = None
    ativo: bool | None = None


class CorretorOut(BaseModel):
    id: str
    nome: str
    cpf: str | None
    email: str | None
    telefone: str | None
    codigo_externo: str | None
    grupo_id: str | None
    limite_valor_diario: float
    ativo: bool
    criado_em: datetime

    model_config = {"from_attributes": True}


class ContatoCreate(BaseModel):
    tipo: str  # EMAIL | TELEFONE
    valor: str
    principal: bool = False


class ContatoOut(BaseModel):
    id: str
    corretor_id: str
    tipo: str
    valor: str
    principal: bool
    ativo: bool
    criado_em: datetime

    model_config = {"from_attributes": True}


# ── Grupo de Corretores ────────────────────────────────────────────────────────

class GrupoCreate(BaseModel):
    nome: str
    descricao: str | None = None
    limite_valor: float = 0.0


class GrupoUpdate(BaseModel):
    nome: str | None = None
    descricao: str | None = None
    limite_valor: float | None = None
    ativo: bool | None = None


class GrupoOut(BaseModel):
    id: str
    nome: str
    descricao: str | None
    limite_valor: float
    ativo: bool
    criado_em: datetime

    model_config = {"from_attributes": True}


# ── Esteiras Comerciais (WebDeck) ──────────────────────────────────────────────
# Camada de leitura sobre GrupoCorretor/Corretor/CorretorEsteira — não são
# regras antifraude, são cadastro operacional. Ver ANALISE_REGRAS_WEBDECK.md.

class EsteiraResumoOut(BaseModel):
    id: str
    nome: str
    descricao: str | None
    limite_valor: float
    metadados: dict | None
    ativo: bool
    criado_em: datetime
    total_corretores: int = 0

    model_config = {"from_attributes": True}


class EsteiraVinculoOut(BaseModel):
    corretor_id: str
    corretor_nome: str
    codigo_externo: str | None
    corretor_ativo: bool
    banco_grupo: str | None
    data_entrada: datetime | None


class ImportEsteirasErro(BaseModel):
    linha: int
    erro: str


class ImportEsteirasResultado(BaseModel):
    esteiras_criadas: int
    esteiras_atualizadas: int
    corretores_criados: int
    corretores_atualizados: int
    vinculos_criados: int
    vinculos_atualizados: int
    total_erros: int
    erros: list[ImportEsteirasErro]


# ── Layout de Importação ───────────────────────────────────────────────────────

class MapeamentoCreate(BaseModel):
    coluna_origem: str
    campo_destino: str
    transformacao: str | None = None
    obrigatorio: bool = False
    valor_padrao: str | None = None
    ordem: int = 0


class MapeamentoOut(BaseModel):
    id: str
    layout_id: str
    coluna_origem: str
    campo_destino: str
    transformacao: str | None
    obrigatorio: bool
    valor_padrao: str | None
    ordem: int

    model_config = {"from_attributes": True}


class LayoutCreate(BaseModel):
    nome: str
    descricao: str | None = None
    tipo: str  # PROPOSTA | CORRETOR
    separador: str = ","
    encoding: str = "utf-8"
    tem_cabecalho: bool = True


class LayoutUpdate(BaseModel):
    nome: str | None = None
    descricao: str | None = None
    separador: str | None = None
    encoding: str | None = None
    tem_cabecalho: bool | None = None
    ativo: bool | None = None


class LayoutOut(BaseModel):
    id: str
    nome: str
    descricao: str | None
    tipo: str
    separador: str
    encoding: str
    tem_cabecalho: bool
    ativo: bool
    criado_em: datetime

    model_config = {"from_attributes": True}


# ── Importações ────────────────────────────────────────────────────────────────

class ImportacaoOut(BaseModel):
    id: str
    arquivo_nome: str
    total_linhas: int
    processadas: int | None = None
    sucesso: int
    erro: int
    status: str
    log_erros: list | None
    criado_por: str | None
    criado_em: datetime
    concluido_em: datetime | None

    model_config = {"from_attributes": True}


# ── Averbação ──────────────────────────────────────────────────────────────────

class AverbacaoCreate(BaseModel):
    banco: str
    numero_operacao: str | None = None
    observacao: str | None = None


class AverbacaoUpdate(BaseModel):
    status: str | None = None
    numero_operacao: str | None = None
    observacao: str | None = None


class AverbacaoOut(BaseModel):
    id: str
    proposta_id: str
    banco: str
    numero_operacao: str | None
    status: str
    data_averbacao: datetime | None
    resposta_banco: dict | None
    observacao: str | None
    criado_em: datetime
    atualizado_em: datetime

    model_config = {"from_attributes": True}


# ── Retorno de Banco ───────────────────────────────────────────────────────────

class RetornoCreate(BaseModel):
    proposta_id: str | None = None
    banco: str
    tipo_retorno: str
    dados: dict | None = None
    observacao: str | None = None


class RetornoOut(BaseModel):
    id: str
    proposta_id: str | None
    banco: str
    tipo_retorno: str
    dados: dict | None
    processado: bool
    observacao: str | None
    criado_em: datetime
    processado_em: datetime | None

    model_config = {"from_attributes": True}


# ── Pendência ──────────────────────────────────────────────────────────────────

class PendenciaCreate(BaseModel):
    proposta_id: str | None = None
    tipo: str
    descricao: str
    responsavel_id: str | None = None
    prazo: datetime | None = None


class PendenciaUpdate(BaseModel):
    descricao: str | None = None
    responsavel_id: str | None = None
    prazo: datetime | None = None
    resolvida: bool | None = None
    resolucao: str | None = None


class PendenciaOut(BaseModel):
    id: str
    proposta_id: str | None
    tipo: str
    descricao: str
    responsavel_id: str | None
    prazo: datetime | None
    resolvida: bool
    resolucao: str | None
    criado_em: datetime
    resolvida_em: datetime | None

    model_config = {"from_attributes": True}


class PendenciaSummary(BaseModel):
    abertas: int
    resolvidas: int
    total: int
    taxa_resolucao: float


# ── Log de Acesso ──────────────────────────────────────────────────────────────

class LogAcessoOut(BaseModel):
    id: str
    usuario_id: str | None
    username: str | None
    nome: str | None = None
    perfil: str | None = None
    metodo: str
    endpoint: str
    ip: str | None
    status_code: int
    duracao_ms: int | None
    timestamp: datetime

    model_config = {"from_attributes": True}


# ── Convênio ──────────────────────────────────────────────────────────────────

class ConvenioCreate(BaseModel):
    nome: str
    banco: str | None = None
    ativo: bool = True


class ConvenioUpdate(BaseModel):
    nome: str | None = None
    banco: str | None = None
    ativo: bool | None = None


class ConvenioOut(BaseModel):
    id: str
    nome: str
    banco: str | None
    ativo: bool
    auto_registrado: bool
    criado_em: datetime

    model_config = {"from_attributes": True}


# ── Auditoria de Ações de Usuários ───────────────────────────────────────────

class LogAuditoriaOut(BaseModel):
    id: str
    usuario_id: str | None
    username: str | None
    nome: str | None
    perfil: str | None
    acao: str
    tipo_entidade: str | None
    entidade_id: str | None
    antes: dict | None
    depois: dict | None
    risco: str
    ip: str | None
    user_agent: str | None
    origem: str
    sucesso: bool
    erro: str | None
    criado_em: datetime

    model_config = {"from_attributes": True}


# ── Genérico ──────────────────────────────────────────────────────────────────

class Mensagem(BaseModel):
    mensagem: str
