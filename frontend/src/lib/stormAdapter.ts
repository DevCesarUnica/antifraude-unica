/**
 * stormAdapter — frontend adapter para a API Storm Tecnologia.
 *
 * Re-exporta os utilitários de storm-utils.ts e adiciona funções
 * específicas de sincronização e normalização para o dashboard.
 *
 * Storm é um HUB multibanco — o campo banco é sempre dinâmico,
 * extraído do payload. NUNCA hardcode "HOPE" aqui.
 */

export {
  fmtBRL,
  normContrato,
  type ContratoNorm,
  type ClienteNorm,
  normalizeStormCliente,
  mergeClienteAndContratos,
  stormErro,
  normalizeContratoLista,
} from "@/lib/storm-utils";

import api from "@/lib/api";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface StormSyncParams {
  max_paginas?: number;
  id_banco?: number;
  id_status?: number;
  data_inicio?: string;
  data_fim?: string;
}

export interface StormSyncResult {
  importadas: number;
  ignoradas: number;
  erros: number;
}

// ── Sincronização ─────────────────────────────────────────────────────────────

/**
 * Dispara a sincronização Storm → propostas no backend.
 * Chama POST /storm/sync e retorna os contadores.
 */
export async function stormSync(params: StormSyncParams = {}): Promise<StormSyncResult> {
  const query = new URLSearchParams();
  if (params.max_paginas != null) query.set("max_paginas", String(params.max_paginas));
  if (params.id_banco    != null) query.set("id_banco",    String(params.id_banco));
  if (params.id_status   != null) query.set("id_status",   String(params.id_status));
  if (params.data_inicio)         query.set("data_inicio", params.data_inicio);
  if (params.data_fim)            query.set("data_fim",    params.data_fim);

  const qs = query.toString();
  const url = `/storm/sync${qs ? `?${qs}` : ""}`;
  const { data } = await api.post<StormSyncResult>(url);
  return data;
}

// ── Extração de banco (frontend) ──────────────────────────────────────────────

type Raw = Record<string, unknown>;

function _str(v: unknown): string {
  if (!v || typeof v !== "string") return "";
  return v.trim();
}

function _obj(d: Raw, key: string): Raw {
  const v = d[key];
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {};
}

/**
 * Extrai o nome do banco de um contrato Storm no frontend.
 * Espelha a lógica de storm_adapter.py#extrair_banco — nunca retorna "HOPE".
 */
export function extrairBancoStorm(raw: Raw): string {
  const bancoObj = _obj(raw, "banco");
  const nome =
    _str(bancoObj["nome"]) ||
    _str(bancoObj["name"]) ||
    _str(bancoObj["ba_nome"]) ||
    _str(raw["banco_nome"]) ||
    _str(raw["ba_nome"]) ||
    _str(raw["nm_banco"]) ||
    _str(raw["ds_banco"]);

  if (nome) return nome;

  const convObj = _obj(raw, "convenio");
  return _str(convObj["banco"]) || _str(convObj["banco_nome"]) || "Não informado";
}
