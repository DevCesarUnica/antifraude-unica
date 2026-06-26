/**
 * hopeAdapter — frontend adapter para a API Hope/Titan (Ceoslab).
 *
 * Hope é um banco específico, integrado exclusivamente via API Titan.
 * banco = "HOPE" é correto e intencional aqui — único local válido
 * no frontend (assim como hope_adapter.py no backend).
 */

import api from "@/lib/api";

// ── Tipos da API Titan ────────────────────────────────────────────────────────

export interface TitanAddress {
  street?: string;
  number?: string;
  city?: string;
  state?: string;
  zipCode?: string;
}

export interface TitanPerson {
  fullName?: string;
  documentNumber?: string;
  birthDate?: string;
  gender?: string;
  addresses?: TitanAddress[];
}

export interface TitanCustomer {
  person?: TitanPerson;
}

export interface TitanProduct {
  id?: number;
  name?: string;
  type?: string;
}

export interface TitanOriginatingCompany {
  id?: number;
  tradeName?: string;
  cnpj?: string;
}

export interface TitanOperacao {
  id: string | number;
  requestedValue?: number;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  customer?: TitanCustomer;
  product?: TitanProduct;
  originatingCompany?: TitanOriginatingCompany;
}

// ── Normalização para exibição ────────────────────────────────────────────────

export interface OperacaoNorm {
  id: string;
  ade: string;
  banco: "HOPE";           // INTENCIONAL — Titan = banco Hope exclusivamente
  convenio: string;
  produto: string;
  cpf: string;
  nome: string;
  uf: string;
  valor: string;
  valor_raw: number | null;
  criado_em: string;
}

function _str(v: unknown): string {
  if (!v) return "";
  return typeof v === "string" ? v.trim() : String(v);
}

function _cpfDigits(v: string): string {
  const d = v.replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
  return d;
}

function _fmtBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Normaliza uma operação Titan para exibição no frontend.
 * banco sempre "HOPE" — Titan é o sistema exclusivo do banco Hope.
 */
export function normOperacao(op: TitanOperacao): OperacaoNorm {
  const person      = op.customer?.person ?? {};
  const originating = op.originatingCompany ?? {};
  const product     = op.product ?? {};
  const addresses   = person.addresses ?? [];
  const address     = addresses[0] ?? {};

  const valor_raw = op.requestedValue ? Number(op.requestedValue) : null;

  return {
    id:        _str(op.id),
    ade:       `titan-${_str(op.id)}`,
    banco:     "HOPE",
    convenio:  _str(originating.tradeName),
    produto:   _str(product.name),
    cpf:       _cpfDigits(_str(person.documentNumber)),
    nome:      _str(person.fullName),
    uf:        _str(address.state),
    valor:     valor_raw != null ? _fmtBRL(valor_raw) : "—",
    valor_raw,
    criado_em: _str(op.createdAt),
  };
}

// ── Sincronização ─────────────────────────────────────────────────────────────

export interface TitanSyncParams {
  page_size?: number;
  max_pages?: number;
  data_inicio?: string;
  data_fim?: string;
  status_id?: number;
}

export interface TitanSyncResult {
  importadas: number;
  ignoradas: number;
  erros: number;
}

/**
 * Dispara a sincronização Hope/Titan → propostas no backend.
 * Chama POST /titan/sync e retorna os contadores.
 */
export async function titanSync(params: TitanSyncParams = {}): Promise<TitanSyncResult> {
  const query = new URLSearchParams();
  if (params.page_size   != null) query.set("page_size",   String(params.page_size));
  if (params.max_pages   != null) query.set("max_pages",   String(params.max_pages));
  if (params.data_inicio)         query.set("data_inicio", params.data_inicio);
  if (params.data_fim)            query.set("data_fim",    params.data_fim);
  if (params.status_id   != null) query.set("status_id",   String(params.status_id));

  const qs = query.toString();
  const url = `/titan/sync${qs ? `?${qs}` : ""}`;
  const { data } = await api.post<TitanSyncResult>(url);
  return data;
}
