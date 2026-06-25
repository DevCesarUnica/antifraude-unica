/**
 * Normalização da API Storm — campos confirmados pelo JSON real:
 *
 * /clientes/cpf → response.clientes["cpf"] = {
 *   clienteDados: { cpf, clienteNome, dataNascimento, telefone },
 *   contratos: [{ codigo, banco (id string), banco_nome, operacao_nome,
 *                 prazo, parcela, valor_operacao, situacao,
 *                 status: { descricao }, data_cadastro, data_pagamento,
 *                 cliente: { nome, orgao: { nome }, identidade, endereco, telefones } }]
 * }
 *
 * /contratos → response.data = [{
 *   codigo, prazo, valor_bruto, valor_liquido,
 *   banco: { nome },
 *   status_contrato: { nome },
 *   operacao: { nome },
 *   data_pgto_bc,
 *   cliente_contrato: { cpf, nome, rg, orgao_emissor, ... }
 * }]
 */

type Raw = Record<string, unknown>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function str(v: unknown): string {
  if (v == null || v === "") return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

/** Retorna sub-objeto seguro. */
function obj(parent: Raw, key: string): Raw {
  const v = parent[key];
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {};
}

/** Primeiro valor string não-vazio dentre as tentativas. */
function pick(o: Raw, ...keys: string[]): string {
  for (const k of keys) {
    const s = str(o[k]);
    if (s) return s;
  }
  return "";
}

/** Primeiro número válido. Aceita string "1.234,56" e "1234.56". */
function num(o: Raw, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = o[k];
    if (v == null || v === "" || v === "0.00" || v === 0) continue;
    const n = typeof v === "string"
      ? parseFloat(v.replace(/\./g, "").replace(",", "."))
      : Number(v);
    if (!isNaN(n) && n > 0) return n;
  }
  return null;
}

/** Converte ISO ou DD/MM/YYYY para DD/MM/YYYY. Ignora "0000-00-00". */
function dt(s: string): string {
  if (!s || s.startsWith("0000")) return "—";
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) return s.slice(0, 10);
  return s;
}

/** Formata telefone. */
function fone(s: string): string {
  if (!s) return "—";
  const d = s.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  if (d.length >= 8) return s;
  return "—";
}

export function fmtBRL(v: number | null | undefined): string {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dash(s: string): string { return s.trim() || "—"; }
function prefer(a: string, b: string): string { return a !== "—" ? a : b; }

function toArr(o: Raw, ...keys: string[]): Raw[] {
  for (const k of keys) {
    const v = o[k];
    if (Array.isArray(v)) return (v as unknown[]).filter(x => x && typeof x === "object") as Raw[];
  }
  return [];
}

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface ContratoNorm {
  codigo: string;
  banco: string;
  convenio: string;
  produto: string;
  status: string;
  valor: string;
  valor_raw: number | null;
  parcela: string;
  parcela_raw: number | null;
  prazo: string;
  data_inicio: string;
  data_fim: string;
  taxa: string;
}

export interface ClienteNorm {
  nome: string;
  cpf: string;
  data_nascimento: string;
  sexo: string;
  situacao: string;
  matricula: string;
  nb: string;
  especie: string;
  banco_beneficio: string;
  rg: string;
  orgao_emissor: string;
  uf_doc: string;
  telefone: string;
  telefone2: string;
  email: string;
  cidade: string;
  uf: string;
  endereco: string;
  renda: string;
  renda_raw: number | null;
  margem_disponivel: string;
  margem_disponivel_raw: number | null;
  margem_utilizada: string;
  margem_utilizada_raw: number | null;
  percentual_margem_util: number | null;
  contratos: ContratoNorm[];
}

function emptyCliente(): ClienteNorm {
  return {
    nome:"—",cpf:"—",data_nascimento:"—",sexo:"—",situacao:"—",
    matricula:"—",nb:"—",especie:"—",banco_beneficio:"—",
    rg:"—",orgao_emissor:"—",uf_doc:"—",
    telefone:"—",telefone2:"—",email:"—",
    cidade:"—",uf:"—",endereco:"—",
    renda:"—",renda_raw:null,
    margem_disponivel:"—",margem_disponivel_raw:null,
    margem_utilizada:"—",margem_utilizada_raw:null,
    percentual_margem_util:null,contratos:[],
  };
}

// ── normContrato — lida com ambos os formatos ─────────────────────────────────

export function normContrato(ct: Raw): ContratoNorm {
  // banco: /clientes/cpf → ct.banco_nome (string); /contratos → ct.banco.nome (objeto)
  const bancoObj = obj(ct, "banco");
  const banco = dash(
    pick(ct, "banco_nome", "ba_nome") ||
    pick(bancoObj, "nome") ||
    pick(ct, "nm_banco", "ds_banco")
  );

  // status: /clientes/cpf → ct.situacao (string) ou ct.status.descricao (objeto)
  //         /contratos    → ct.status_contrato.nome (objeto)
  const statusObj = obj(ct, "status");
  const statusContObj = obj(ct, "status_contrato");
  const status = dash(
    pick(ct, "situacao") ||
    pick(statusContObj, "nome") ||
    pick(statusObj, "descricao", "nome") ||
    pick(ct, "ds_status", "st_nome")
  );

  // produto/operação: /clientes/cpf → ct.operacao_nome; /contratos → ct.operacao.nome
  const operacaoObj = obj(ct, "operacao");
  const produto = dash(
    pick(ct, "operacao_nome") ||
    pick(operacaoObj, "nome") ||
    pick(ct, "tabela_nome", "pr_nome", "produto")
  );

  // convênio/órgão: /clientes/cpf → ct.cliente.orgao.nome
  const clienteNested = obj(ct, "cliente");
  const orgaoObj = obj(clienteNested, "orgao");
  const convenio = dash(
    pick(orgaoObj, "nome") ||
    pick(ct, "convenio", "co_nome", "nm_convenio")
  );

  // valor: /clientes/cpf → valor_operacao; /contratos → valor_bruto
  const valor_raw = num(ct, "valor_operacao", "producao_bruta", "valor_bruto", "valor_liquido", "valor_negociado");

  // parcela: /clientes/cpf → parcela; /contratos → total_parcelas
  const parcela_raw = num(ct, "parcela", "total_parcelas", "valor_parcela");

  const prazoRaw = pick(ct, "prazo");

  const taxa_raw = num(ct, "taxa", "taxa_juros", "taxa_mes");

  // data início: /clientes/cpf → data_cadastro; /contratos → data_pgto_bc
  const data_inicio = dt(pick(ct, "data_cadastro", "data_pgto_bc", "dt_inicio", "data_inicio"));
  const data_fim    = dt(pick(ct, "data_pagamento", "dt_fim", "data_fim", "dt_vencimento"));

  return {
    codigo:  dash(pick(ct, "codigo", "ff", "id")),
    banco,
    convenio,
    produto,
    status,
    valor_raw,
    valor: fmtBRL(valor_raw),
    parcela_raw,
    parcela: fmtBRL(parcela_raw),
    prazo: prazoRaw ? `${prazoRaw}x` : "—",
    data_inicio,
    data_fim,
    taxa: taxa_raw != null ? `${taxa_raw.toFixed(2)}% a.m.` : "—",
  };
}

// ── normalizeStormCliente ─────────────────────────────────────────────────────

export function normalizeStormCliente(response: unknown): ClienteNorm | null {
  if (!response || typeof response !== "object") return null;
  const res = response as Raw;

  // Desempacota { clientes: { "cpf": { ... } } }
  let raw: Raw = res;
  if (res.clientes && typeof res.clientes === "object" && !Array.isArray(res.clientes)) {
    const entries = Object.values(res.clientes as Record<string, unknown>);
    if (entries.length > 0 && entries[0] && typeof entries[0] === "object") {
      raw = entries[0] as Raw;
    }
  }
  if (raw.erro || raw.error) return null;

  // ── Sub-objetos confirmados pelo JSON real ────────────────────────────────
  const clienteDados = obj(raw, "clienteDados");       // /clientes/cpf principal
  const objCliente   = obj(raw, "cliente");            // possível alternativo
  const objPessoa    = obj(raw, "pessoa");
  const identidade   = (() => {
    // identidade pode estar em raw.contratos[0].cliente.identidade
    const contratos = toArr(raw, "contratos");
    if (contratos.length > 0) {
      const c0 = contratos[0];
      const cl = obj(c0, "cliente");
      return obj(cl, "identidade");
    }
    return {} as Raw;
  })();
  const enderecoNested = (() => {
    const contratos = toArr(raw, "contratos");
    if (contratos.length > 0) {
      const c0 = contratos[0];
      const cl = obj(c0, "cliente");
      return obj(cl, "endereco");
    }
    return {} as Raw;
  })();
  const orgaoNested = (() => {
    const contratos = toArr(raw, "contratos");
    if (contratos.length > 0) {
      const c0 = contratos[0];
      const cl = obj(c0, "cliente");
      return obj(cl, "orgao");
    }
    return {} as Raw;
  })();

  // ── Nome: clienteDados.clienteNome é o campo real ─────────────────────────
  const nome = dash(
    pick(clienteDados, "clienteNome") ||         // /clientes/cpf ← CAMPO REAL
    pick(clienteDados, "nome") ||
    pick(objCliente, "nome", "nome_cliente") ||
    pick(objPessoa,  "nome") ||
    pick(raw, "nome", "cl_nome", "clienteNome")
  );

  const cpf = dash(
    pick(clienteDados, "cpf") ||
    pick(objCliente, "cpf") ||
    pick(raw, "cpf", "cl_cpf")
  );

  const data_nascimento = dt(
    pick(clienteDados, "dataNascimento") ||
    pick(objCliente, "data_nascimento", "nascimento") ||
    pick(raw, "dt_nascimento", "data_nascimento")
  );

  const sexo = dash(
    pick(objCliente, "sexo") ||
    pick(raw, "sexo", "cl_sexo")
  );

  // Situação do benefício (não temos no FGTS)
  const situacao = dash(
    pick(raw, "situacao", "cl_situacao", "status_beneficio") ||
    pick(objCliente, "situacao", "status")
  );

  // Matrícula / NB / Orgão (FGTS = orgao.codigo "1737")
  const matricula = dash(
    pick(orgaoNested, "matricula") ||
    pick(objCliente, "matricula") ||
    pick(raw, "matricula", "cl_matricula")
  );

  const especie = dash(
    pick(orgaoNested, "nome") ||               // ex: "FGTS"
    pick(raw, "especie", "cl_especie")
  );

  const nb = dash(
    pick(raw, "nb", "num_beneficio", "nr_beneficio") ||
    pick(objCliente, "nb", "beneficio")
  );

  const banco_beneficio = dash(
    pick(raw, "banco_beneficio", "banco_pag") ||
    pick(objCliente, "banco_beneficio")
  );

  // ── Documentos: identidade está em contratos[0].cliente.identidade ────────
  const rg = dash(
    pick(identidade, "numero") ||
    pick(raw, "rg", "cl_rg")
  );
  const orgao_emissor = dash(
    pick(identidade, "orgao_emissor") ||
    pick(raw, "orgao_emissor", "cl_org_rg")
  );
  const uf_doc = dash(
    pick(identidade, "uf") ||
    pick(raw, "uf_rg", "uf_doc")
  );

  // ── Contato: clienteDados.telefone ou contratos[0].cliente.telefones ──────
  const telefone = fone(
    pick(clienteDados, "telefone") ||
    (() => {
      const contratos = toArr(raw, "contratos");
      if (contratos.length > 0) {
        const cl = obj(contratos[0], "cliente");
        const fones = toArr(cl, "telefones");
        if (fones.length > 0) return pick(fones[0], "numero", "fone");
      }
      return "";
    })() ||
    pick(raw, "telefone", "cl_telefone")
  );

  const telefone2 = fone(
    (() => {
      const contratos = toArr(raw, "contratos");
      if (contratos.length > 0) {
        const cl = obj(contratos[0], "cliente");
        const fones = toArr(cl, "telefones");
        if (fones.length > 1) return pick(fones[1], "numero", "fone");
      }
      return "";
    })() ||
    pick(raw, "telefone2", "cl_telefone2")
  );

  const email = dash(
    pick(objCliente, "email") ||
    pick(raw, "email", "cl_email")
  );

  // ── Endereço: contratos[0].cliente.endereco ───────────────────────────────
  const cidade = dash(
    pick(enderecoNested, "cidade") ||
    pick(raw, "cidade", "cl_cidade")
  );
  const uf = dash(
    pick(enderecoNested, "uf") ||
    pick(raw, "uf", "cl_uf")
  );
  const logradouro = pick(enderecoNested, "logradouro") || pick(raw, "logradouro");
  const bairro = pick(enderecoNested, "bairro") || pick(raw, "bairro");
  const endereco = dash([logradouro, bairro].filter(Boolean).join(", "));

  // ── Financeiro ────────────────────────────────────────────────────────────
  const renda_raw = num(raw, "renda", "cl_renda", "salario") ||
    num(objCliente, "salario", "renda");
  const margem_disponivel_raw = num(raw, "margem_disponivel", "cl_margem", "margem");
  const margem_utilizada_raw  = num(raw, "margem_utilizada",  "cl_margem_util");
  const percentual_margem_util =
    margem_disponivel_raw != null && margem_utilizada_raw != null && margem_disponivel_raw > 0
      ? Math.min(100, Math.round((margem_utilizada_raw / (margem_disponivel_raw + margem_utilizada_raw)) * 100))
      : null;

  // Contratos do /clientes/cpf
  const contratos = toArr(raw, "contratos").map(normContrato);

  return {
    nome, cpf, data_nascimento, sexo, situacao,
    matricula, nb, especie, banco_beneficio,
    rg, orgao_emissor, uf_doc,
    telefone, telefone2, email,
    cidade, uf, endereco,
    renda_raw, renda: fmtBRL(renda_raw),
    margem_disponivel_raw, margem_disponivel: fmtBRL(margem_disponivel_raw),
    margem_utilizada_raw,  margem_utilizada:  fmtBRL(margem_utilizada_raw),
    percentual_margem_util, contratos,
  };
}

// ── mergeClienteAndContratos ──────────────────────────────────────────────────

/**
 * Combina /clientes/cpf (dados básicos) com /contratos (lista completa).
 * /contratos usa response.data[] — confirmado pelo JSON real.
 */
export function mergeClienteAndContratos(
  rawCliente: unknown,
  rawContratos: unknown,
): ClienteNorm | null {
  const clienteNorm = normalizeStormCliente(rawCliente);

  // /contratos retorna { data: [...] } — NÃO "contratos"
  let contratosRaw: Raw[] = [];
  if (rawContratos && typeof rawContratos === "object") {
    contratosRaw = toArr(rawContratos as Raw, "data", "contratos", "items", "results");
  }
  const contratosNorm = contratosRaw.map(normContrato);

  // Extrai dados do cliente embutidos em /contratos: cliente_contrato
  const fromContratos = (() => {
    if (!contratosRaw.length) return { nome: "—", cpf: "—", rg: "—", orgao_emissor: "—" };
    const ct = contratosRaw[0];
    const cc = obj(ct, "cliente_contrato");
    return {
      nome: dash(pick(cc, "nome")),
      cpf:  dash(pick(cc, "cpf")),
      rg:   pick(cc, "rg") || "—",
      orgao_emissor: pick(cc, "orgao_emissor") || "—",
    };
  })();

  if (!clienteNorm && !contratosNorm.length) return null;

  const base = clienteNorm ?? emptyCliente();
  const contratos = contratosNorm.length > 0 ? contratosNorm : base.contratos;

  return {
    ...base,
    nome: prefer(base.nome, fromContratos.nome),
    cpf:  prefer(base.cpf,  fromContratos.cpf),
    rg:   prefer(base.rg,   fromContratos.rg ?? "—"),
    orgao_emissor: prefer(base.orgao_emissor, fromContratos.orgao_emissor ?? "—"),
    contratos,
  };
}

// ── normalizeContratoLista ────────────────────────────────────────────────────
// Usado em AbaContratos (/contratos) — inclui dados do cliente embutidos.

export interface ContratoListaItem {
  ff: string;
  nome_cliente: string;
  cpf_cliente: string;
  banco: string;
  convenio: string;
  valor: string;
  valor_raw: number | null;
  status: string;
  data: string;
}

export function normalizeContratoLista(raw: Raw): ContratoListaItem {
  const base = normContrato(raw);

  // /contratos embute o cliente em cliente_contrato
  const cc = obj(raw, "cliente_contrato");
  const nome_cliente = dash(
    pick(cc, "nome") ||
    pick(raw, "nome_cliente", "cl_nome")
  );
  const cpf_cliente = dash(
    pick(cc, "cpf") ||
    pick(raw, "cpf", "cpf_cliente", "cl_cpf")
  );

  // convenio vem de operacao.nome em /contratos
  const convenio = base.convenio !== "—" ? base.convenio : base.produto;

  return {
    ff: base.codigo,
    nome_cliente,
    cpf_cliente,
    banco: base.banco,
    convenio,
    valor: base.valor,
    valor_raw: base.valor_raw,
    status: base.status,
    data: base.data_inicio,
  };
}

// ── stormErro ─────────────────────────────────────────────────────────────────

export function stormErro(response: unknown): string | null {
  if (!response || typeof response !== "object") return null;
  const res = response as Raw;
  if (res.clientes && typeof res.clientes === "object") {
    const vals = Object.values(res.clientes as Record<string, unknown>);
    if (vals.length > 0 && vals[0] && typeof vals[0] === "object") {
      const first = vals[0] as Raw;
      if (first.erro) return String(first.erro);
    }
  }
  if (res.erro) return String(res.erro);
  if (res.error) return String(res.error);
  if (res.detail) return String(res.detail);
  return null;
}
