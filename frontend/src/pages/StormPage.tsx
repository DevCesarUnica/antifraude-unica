import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import { mergeClienteAndContratos, normalizeContratoLista, stormErro, type ClienteNorm, type ContratoListaItem } from "../lib/storm-utils";
import {
  getStormStatus,
  resetarCircuitBreakerStorm,
  getStormContratos,
  getStormHistoricoContrato,
  getStormAcompanhamentoContrato,
  getStormStatusContratos,
  getStormClienteCpf,
  getStormClienteTelefone,
  getStormColaboradores,
  getStormColaborador,
  getStormParceiros,
  getStormParceiro,
  getStormBancos,
  getStormOrgaos,
  simularCLTStorm,
  simularFGTSStorm,
  getStormAntifraude,
  getStormTiposRecusas,
  getStormTiposPendencias,
  aprovarContratoStorm,
  recusarContratoStorm,
  pendenciarContratoStorm,
} from "../lib/api";

// ── Tipos ─────────────────────────────────────────────────────────────────────

type Tab = "antifraude" | "contratos" | "clientes" | "colaboradores" | "simulacoes" | "referencia";

const TABS: { id: Tab; label: string }[] = [
  { id: "antifraude",   label: "Antifraude" },
  { id: "contratos",    label: "Contratos" },
  { id: "clientes",     label: "Clientes" },
  { id: "colaboradores",label: "Colaboradores" },
  { id: "simulacoes",   label: "Simulações" },
  { id: "referencia",   label: "Referência" },
];

// ── Utilitários visuais ───────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyData = any;

function Card({ children, className = "", onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div className={`rounded-xl p-4 ${className}`} style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }} onClick={onClick}>
      {children}
    </div>
  );
}

function Badge({ label, color }: { label: string; color: "green" | "red" | "yellow" | "gray" | "blue" | "purple" }) {
  const bg: Record<string, string> = { green: "rgba(34,197,94,0.15)", red: "rgba(220,38,38,0.15)", yellow: "rgba(234,179,8,0.15)", gray: "rgba(156,163,175,0.15)", blue: "rgba(59,130,246,0.15)", purple: "rgba(168,85,247,0.15)" };
  const fg: Record<string, string> = { green: "#22c55e", red: "#DC2626", yellow: "#eab308", gray: "#9ca3af", blue: "#3b82f6", purple: "#a855f7" };
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ backgroundColor: bg[color], color: fg[color] }}>{label}</span>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: "#DC262620", borderTopColor: "#DC2626" }} />
    </div>
  );
}

function EmptyState({ msg }: { msg: string }) {
  return <p className="text-center py-12 text-xs" style={{ color: "var(--text-muted)" }}>{msg}</p>;
}

function AlertErro({ msg }: { msg: string }) {
  return <p className="text-xs font-semibold px-3 py-2 rounded-lg" style={{ backgroundColor: "rgba(220,38,38,0.08)", color: "#DC2626", border: "1px solid rgba(220,38,38,0.2)" }}>{msg}</p>;
}

function AlertOk({ msg }: { msg: string }) {
  return <p className="text-xs font-semibold px-3 py-2 rounded-lg" style={{ backgroundColor: "rgba(34,197,94,0.08)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.2)" }}>{msg}</p>;
}

// ── Componentes de Modal ──────────────────────────────────────────────────────

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.72)" }} onClick={onClose}>
      <div className="w-full max-w-xl rounded-2xl shadow-2xl max-h-[88vh] flex flex-col"
        style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}
        onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function ModalHeader({ title, ff, onClose }: { title: string; ff: string; onClose: () => void }) {
  return (
    <div className="flex justify-between items-center px-5 py-4 flex-shrink-0"
      style={{ borderBottom: "1px solid var(--border)" }}>
      <div>
        <h3 className="text-sm font-black" style={{ color: "var(--text-primary)" }}>{title}</h3>
        <p className="text-[10px] font-mono mt-0.5" style={{ color: "#DC2626" }}>{ff}</p>
      </div>
      <button onClick={onClose} className="text-xs px-3 py-1.5 rounded-lg"
        style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-muted)" }}>✕ Fechar</button>
    </div>
  );
}

// ── Histórico: layout de timeline ─────────────────────────────────────────────

function fmtDataHora(s: string): string {
  if (!s) return "";
  try {
    if (s.includes("T") || /^\d{4}-\d{2}-\d{2}/.test(s)) {
      return new Date(s).toLocaleString("pt-BR", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
    }
    if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) return s;
    return s;
  } catch { return s; }
}

function HistoricoTimeline({ itens }: { itens: AnyData[] }) {
  return (
    <div style={{ position: "relative", paddingLeft: 28 }}>
      <div style={{ position: "absolute", left: 7, top: 8, bottom: 8, width: 2, backgroundColor: "var(--border)" }} />
      <div className="space-y-3">
        {itens.map((h: AnyData, i: number) => {
          const evento = h.descricao ?? h.acao ?? h.situacao ?? h.evento ?? h.tipo ?? h.status ?? "Evento";
          const data   = fmtDataHora(h.data ?? h.data_criacao ?? h.dt_evento ?? h.data_hora ?? h.created_at ?? "");
          const usuario = h.usuario ?? h.operador ?? h.nome_usuario ?? h.user ?? "";
          const obs    = h.observacao ?? h.motivo ?? h.detalhe ?? h.comentario ?? h.mensagem ?? "";
          return (
            <div key={i} style={{ position: "relative" }}>
              <div style={{
                position: "absolute", left: -21, top: 6,
                width: 10, height: 10, borderRadius: 5,
                backgroundColor: i === 0 ? "#DC2626" : "var(--bg-mid)",
                border: `2px solid ${i === 0 ? "#DC2626" : "var(--text-muted)"}`,
              }} />
              <div className="rounded-xl p-3" style={{ backgroundColor: "var(--bg-mid)" }}>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-xs font-bold flex-1" style={{ color: "var(--text-primary)" }}>{String(evento)}</span>
                  {data && <span className="text-[10px] font-mono flex-shrink-0" style={{ color: "var(--text-muted)" }}>{data}</span>}
                </div>
                {usuario && (
                  <p className="text-[10px] mt-1.5" style={{ color: "var(--text-muted)" }}>
                    Operador: <strong style={{ color: "var(--text-secondary)" }}>{String(usuario)}</strong>
                  </p>
                )}
                {obs && (
                  <p className="text-[10px] mt-1 italic" style={{ color: "var(--text-muted)" }}>{String(obs)}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Acompanhamento: renderiza qualquer estrutura JSON ─────────────────────────

function valorStr(v: unknown): string {
  if (v == null || v === "") return "—";
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.length > 0 ? `${v.length} registros` : "—";
  const o = v as AnyData;
  return o.nome ?? o.descricao ?? o.name ?? o.valor ?? JSON.stringify(v).slice(0, 80);
}

function AcompanhamentoView({ data }: { data: AnyData }) {
  if (!data || typeof data !== "object") return null;
  const entradas = Object.entries(data as object);
  if (entradas.length === 0) return <EmptyState msg="Sem dados." />;
  return (
    <div className="space-y-1">
      {entradas.map(([k, v]) => {
        if (v == null) return null;
        const label = k.replace(/_/g, " ");
        if (Array.isArray(v) && v.length > 0 && typeof v[0] === "object") {
          return (
            <div key={k}>
              <p className="text-[10px] font-bold uppercase tracking-wide mt-4 mb-1" style={{ color: "var(--text-muted)" }}>{label} ({v.length})</p>
              {(v as AnyData[]).map((item: AnyData, i: number) => (
                <div key={i} className="rounded-xl p-3 mb-2" style={{ backgroundColor: "var(--bg-mid)" }}>
                  {Object.entries(item as object).map(([ik, iv]) => iv != null && (
                    <div key={ik} className="flex gap-3 py-1" style={{ borderBottom: "1px solid var(--border)" }}>
                      <span className="text-[10px] font-semibold w-32 flex-shrink-0 uppercase" style={{ color: "var(--text-muted)" }}>{ik.replace(/_/g, " ")}</span>
                      <span className="text-xs" style={{ color: "var(--text-primary)" }}>{valorStr(iv)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          );
        }
        if (typeof v === "object" && !Array.isArray(v)) {
          return (
            <div key={k}>
              <p className="text-[10px] font-bold uppercase tracking-wide mt-4 mb-1" style={{ color: "var(--text-muted)" }}>{label}</p>
              {Object.entries(v as object).map(([sk, sv]) => sv != null && (
                <div key={sk} className="flex gap-3 py-1.5 pl-2" style={{ borderBottom: "1px solid var(--border)" }}>
                  <span className="text-[10px] font-semibold w-36 flex-shrink-0" style={{ color: "var(--text-muted)" }}>{sk.replace(/_/g, " ")}</span>
                  <span className="text-xs" style={{ color: "var(--text-primary)" }}>{valorStr(sv)}</span>
                </div>
              ))}
            </div>
          );
        }
        return (
          <div key={k} className="flex gap-3 py-1.5" style={{ borderBottom: "1px solid var(--border)" }}>
            <span className="text-[10px] font-semibold w-36 flex-shrink-0 uppercase" style={{ color: "var(--text-muted)" }}>{label}</span>
            <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>{valorStr(v)}</span>
          </div>
        );
      })}
    </div>
  );
}

function Paginacao({ pagina, onPrev, onNext }: { pagina: number; onPrev: () => void; onNext: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <button onClick={onPrev} disabled={pagina === 1} className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all" style={{ backgroundColor: "var(--bg-mid)", color: pagina === 1 ? "var(--text-muted)" : "var(--text-primary)", opacity: pagina === 1 ? 0.5 : 1 }}>&#8249; Anterior</button>
      <span className="text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)" }}>Página {pagina}</span>
      <button onClick={onNext} className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)" }}>Próxima &#8250;</button>
    </div>
  );
}

function normalize(data: AnyData, keys: string[]): AnyData[] {
  if (Array.isArray(data)) return data;
  for (const k of keys) if (Array.isArray(data?.[k])) return data[k];
  return [];
}

function formatBRL(v: number | string | undefined) {
  const n = Number(v);
  if (isNaN(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function stormStr(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === "string") return v || undefined;
  if (typeof v === "number") return String(v);
  if (typeof v === "object") {
    const o = v as AnyData;
    const s = o.nome ?? o.name ?? o.codigo;
    return s ? String(s) : undefined;
  }
  return undefined;
}

// ── Aba Antifraude ────────────────────────────────────────────────────────────

/**
 * Extrai banco de um contrato Storm ou Hope.
 * Storm = hub de bancos → banco real vem da resposta da API.
 * Hope = banco específico → sempre "HOPE".
 * NUNCA hardcodar "HOPE" para contratos Storm.
 */
function getBancoProposta(raw: AnyData, origem: "storm" | "hope"): string {
  console.log("[Origem proposta]:", origem);
  if (origem === "hope") return "HOPE";

  // Storm: extrai banco real da resposta — nunca assume "HOPE"
  const bancoObj = raw?.banco;
  let nome = "";
  if (bancoObj && typeof bancoObj === "object") {
    nome = String(bancoObj.nome ?? bancoObj.name ?? bancoObj.ba_nome ?? "").trim();
  } else if (typeof bancoObj === "string") {
    nome = bancoObj.trim();
  }
  if (!nome) {
    nome = String(raw?.banco_nome ?? raw?.ba_nome ?? raw?.nm_banco ?? "").trim();
  }
  if (!nome && raw?.convenio && typeof raw.convenio === "object") {
    nome = String(raw.convenio.banco ?? raw.convenio.banco_nome ?? "").trim();
  }

  const result = nome || "Não informado";
  console.log("[Banco extraído]:", result);
  return result;
}

function normStormAntifraudeOp(op: AnyData) {
  const banco = getBancoProposta(op, "storm");
  const cc = op?.cliente_contrato ?? op?.cliente ?? {};
  const statusObj = op?.status_contrato ?? op?.status ?? {};
  const operacaoObj = op?.operacao ?? {};
  return {
    id:           op?.id ?? op?.ff ?? op?.codigo,
    ff:           String(op?.ff ?? op?.codigo ?? op?.id ?? "—"),
    nome_cliente: String(cc.nome ?? cc.clienteNome ?? op?.nome_cliente ?? "—"),
    cpf_cliente:  String(cc.cpf ?? cc.clienteCpf ?? op?.cpf_cliente ?? "—"),
    banco,
    convenio:     String(operacaoObj.nome ?? op?.operacao_nome ?? op?.convenio ?? "—"),
    produto:      String(operacaoObj.nome ?? op?.produto ?? "—"),
    valor:        op?.valor_bruto ?? op?.valor_liquido ?? op?.valor_operacao ?? 0,
    status:       String(statusObj.nome ?? statusObj.descricao ?? op?.situacao ?? "—"),
    data:         op?.data_pgto_bc ?? op?.data_cadastro ?? op?.created_at ?? null,
  };
}

const ESTEIAS_STORM = [
  "Analisar/Reanalisar",
  "Pendentes",
  "Aprovado aguardando liberação no banco",
  "Migrados com informações incompletas",
] as const;

function AbaAntifraude() {
  const [contratos, setContratos] = useState<AnyData[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ total: 0, aprovados: 0, recusados: 0, outros: 0 });
  const [pagina, setPagina] = useState(1);
  const [esteira, setEsteira] = useState<string>(ESTEIAS_STORM[0]);
  const [erro, setErro] = useState("");
  const [tiposRecusas, setTiposRecusas] = useState<AnyData[]>([]);
  const [tiposPendencias, setTiposPendencias] = useState<AnyData[]>([]);
  const [acao, setAcao] = useState<{ id: number; tipo: "aprovar" | "recusar" | "pendenciar" } | null>(null);
  const [tipoId, setTipoId] = useState("");
  const [observacao, setObservacao] = useState("");
  const [loadingAcao, setLoadingAcao] = useState(false);
  const [msgAcao, setMsgAcao] = useState("");

  useEffect(() => {
    Promise.all([getStormTiposRecusas(), getStormTiposPendencias()])
      .then(([r, p]) => {
        setTiposRecusas(normalize(r, ["tipos_recusas", "items", "data"]) ?? []);
        setTiposPendencias(normalize(p, ["tipos_pendencias", "items", "data"]) ?? []);
      }).catch(() => {});
  }, []);

  const buscar = useCallback(async () => {
    setLoading(true); setErro("");
    try {
      const data = await getStormAntifraude(esteira, pagina);
      console.log("[Storm antifraude raw] primeiro item:", JSON.stringify(normalize(data, ["contratos", "items", "data", "content"])[0], null, 2));
      const items: AnyData[] = normalize(data, ["contratos", "items", "data", "content"]);
      const lista = items.map(normStormAntifraudeOp);
      setContratos(lista);
      const aprovados = lista.filter((c) => /aprov/i.test(c.status)).length;
      const recusados = lista.filter((c) => /(recus|negad)/i.test(c.status)).length;
      setStats({ total: lista.length, aprovados, recusados, outros: lista.length - aprovados - recusados });
    } catch (e: AnyData) {
      setErro(e?.response?.data?.detail ?? "Erro ao buscar contratos antifraude Storm");
    } finally { setLoading(false); }
  }, [pagina, esteira]);

  useEffect(() => { buscar(); }, [buscar]);

  const fecharModal = () => { setAcao(null); setTipoId(""); setObservacao(""); setMsgAcao(""); };

  const executarAcao = async () => {
    if (!acao) return;
    setLoadingAcao(true); setMsgAcao("");
    try {
      if (acao.tipo === "aprovar") {
        await aprovarContratoStorm(acao.id);
      } else if (acao.tipo === "recusar") {
        if (!tipoId) { setMsgAcao("Selecione o tipo de recusa."); setLoadingAcao(false); return; }
        await recusarContratoStorm(acao.id, { tipo_recusa_id: Number(tipoId), observacao: observacao || undefined });
      } else {
        if (!tipoId) { setMsgAcao("Selecione o tipo de pendência."); setLoadingAcao(false); return; }
        await pendenciarContratoStorm(acao.id, { tipo_pendencia_id: Number(tipoId), observacao: observacao || undefined });
      }
      fecharModal();
      buscar();
    } catch (e: AnyData) {
      setMsgAcao(e?.response?.data?.detail ?? "Erro ao executar ação. Verifique o console.");
    } finally { setLoadingAcao(false); }
  };

  const tiposDisponiveis = acao?.tipo === "recusar" ? tiposRecusas : tiposPendencias;

  return (
    <div className="space-y-4">
      {/* Filtros / paginação */}
      <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <div>
          <label className="text-[10px] font-bold uppercase mb-1 block" style={{ color: "var(--text-muted)" }}>Fila (Esteira)</label>
          <select
            value={esteira}
            onChange={(e) => { setEsteira(e.target.value); setPagina(1); }}
            className="px-3 py-2 rounded-lg text-xs"
            style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)", minWidth: 220 }}
          >
            {ESTEIAS_STORM.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        <button onClick={() => { setPagina(1); buscar(); }} className="px-4 py-2 rounded-lg text-xs font-bold text-white self-end" style={{ backgroundColor: "#DC2626" }}>Buscar</button>
        <div className="ml-auto self-end">
          <Paginacao pagina={pagina} onPrev={() => setPagina((p) => Math.max(1, p - 1))} onNext={() => setPagina((p) => p + 1)} />
        </div>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total",      value: stats.total,     bg: "rgba(59,130,246,0.1)",  color: "#3b82f6"  },
          { label: "Aprovados",  value: stats.aprovados, bg: "rgba(34,197,94,0.1)",   color: "#22c55e"  },
          { label: "Recusados",  value: stats.recusados, bg: "rgba(220,38,38,0.1)",   color: "#DC2626"  },
          { label: "Outros",     value: stats.outros,    bg: "rgba(234,179,8,0.1)",   color: "#eab308"  },
        ].map(({ label, value, bg, color }) => (
          <div key={label} className="rounded-xl p-3" style={{ backgroundColor: bg, border: `1px solid ${color}30` }}>
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color }}>{label}</p>
            <p className="text-2xl font-black mt-0.5" style={{ color: "var(--text-primary)" }}>{value}</p>
          </div>
        ))}
      </div>

      {erro && <AlertErro msg={erro} />}

      {loading ? <Spinner /> : contratos.length === 0 ? <EmptyState msg="Nenhum contrato na fila antifraude Storm." /> : (
        <div className="space-y-3">
          {contratos.map((op: AnyData) => (
            <Card key={op.id ?? op.ff}>
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-black font-mono" style={{ color: "#DC2626" }}>{op.ff !== "—" ? op.ff : `#${op.id}`}</p>
                  {op.status !== "—" && <Badge label={op.status} color="blue" />}
                  {/* Banco real extraído da Storm — nunca hardcodado */}
                  {op.banco !== "Não informado" && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(59,130,246,0.1)", color: "#3b82f6" }}>{op.banco}</span>
                  )}
                  {op.data && <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{fmtDataHora(op.data)}</span>}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-0.5 mt-2">
                  {[
                    ["Cliente",  op.nome_cliente],
                    ["CPF",      op.cpf_cliente],
                    ["Banco",    op.banco],
                    ["Convênio", op.convenio !== op.banco ? op.convenio : null],
                    ["Valor",    formatBRL(op.valor)],
                  ].filter(([, v]) => v && v !== "—" && v !== "Não informado").map(([k, v]) => (
                    <div key={k as string}>
                      <span className="text-[10px] font-semibold uppercase" style={{ color: "var(--text-muted)" }}>{k}</span>
                      <p className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>{v as string}</p>
                    </div>
                  ))}
                </div>
                {/* Ações antifraude */}
                <div className="flex gap-2 mt-2 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
                  <button onClick={() => setAcao({ id: Number(op.id), tipo: "aprovar" })} className="px-3 py-1 rounded text-[10px] font-bold text-white" style={{ backgroundColor: "#16a34a" }}>Aprovar</button>
                  <button onClick={() => { setAcao({ id: Number(op.id), tipo: "recusar" }); setTipoId(""); setObservacao(""); }} className="px-3 py-1 rounded text-[10px] font-bold text-white" style={{ backgroundColor: "#DC2626" }}>Recusar</button>
                  <button onClick={() => { setAcao({ id: Number(op.id), tipo: "pendenciar" }); setTipoId(""); setObservacao(""); }} className="px-3 py-1 rounded text-[10px] font-bold" style={{ backgroundColor: "rgba(234,179,8,0.15)", color: "#eab308" }}>Pendenciar</button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Modal de ação antifraude */}
      {acao && (
        <ModalOverlay onClose={fecharModal}>
          <ModalHeader
            title={acao.tipo === "aprovar" ? "Aprovar Contrato" : acao.tipo === "recusar" ? "Recusar Contrato" : "Pendenciar Contrato"}
            ff={String(acao.id)}
            onClose={fecharModal}
          />
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {acao.tipo === "aprovar" ? (
              <p className="text-sm" style={{ color: "var(--text-primary)" }}>Confirma a aprovação do contrato <strong>#{acao.id}</strong> na fila antifraude Storm?</p>
            ) : (
              <>
                <div>
                  <label className="text-[10px] font-bold uppercase mb-1 block" style={{ color: "var(--text-muted)" }}>
                    {acao.tipo === "recusar" ? "Tipo de Recusa" : "Tipo de Pendência"}
                  </label>
                  <select value={tipoId} onChange={(e) => setTipoId(e.target.value)} className="w-full px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }}>
                    <option value="">Selecione...</option>
                    {tiposDisponiveis.map((t: AnyData) => (
                      <option key={t.id ?? t.co_id} value={t.id ?? t.co_id}>{t.descricao ?? t.nome ?? t.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase mb-1 block" style={{ color: "var(--text-muted)" }}>Observação (opcional)</label>
                  <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={3} className="w-full px-3 py-2 rounded-lg text-xs resize-none" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }} />
                </div>
              </>
            )}
            {msgAcao && <p className="text-xs font-semibold" style={{ color: msgAcao.includes("sucesso") ? "#22c55e" : "#f87171" }}>{msgAcao}</p>}
          </div>
          <div className="px-5 py-3 flex gap-2 justify-end" style={{ borderTop: "1px solid var(--border)" }}>
            <button onClick={fecharModal} className="px-4 py-2 rounded-lg text-xs font-semibold" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-muted)" }}>Cancelar</button>
            <button onClick={executarAcao} disabled={loadingAcao} className="px-4 py-2 rounded-lg text-xs font-bold text-white" style={{ backgroundColor: acao.tipo === "aprovar" ? "#16a34a" : acao.tipo === "recusar" ? "#DC2626" : "#eab308", opacity: loadingAcao ? 0.65 : 1 }}>
              {loadingAcao ? "Aguarde..." : acao.tipo === "aprovar" ? "Confirmar Aprovação" : acao.tipo === "recusar" ? "Confirmar Recusa" : "Confirmar Pendência"}
            </button>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}

// ── Aba Contratos ─────────────────────────────────────────────────────────────

function AbaContratos() {
  const [contratos, setContratos] = useState<ContratoListaItem[]>([]);
  const [statusList, setStatusList] = useState<AnyData[]>([]);
  const [bancos, setBancos] = useState<AnyData[]>([]);
  const [loading, setLoading] = useState(false);
  const [cpf, setCpf] = useState("");
  const [ff, setFf] = useState("");
  const [idBanco, setIdBanco] = useState("");
  const [idStatus, setIdStatus] = useState("");
  const [pagina, setPagina] = useState(1);
  const [historico, setHistorico] = useState<AnyData[] | null>(null);
  const [ffHistorico, setFfHistorico] = useState("");
  const [acompanhamento, setAcompanhamento] = useState<AnyData | null>(null);
  const [ffAcomp, setFfAcomp] = useState("");
  const [loadingAcomp, setLoadingAcomp] = useState(false);
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [erro, setErro] = useState("");

  useEffect(() => {
    Promise.all([getStormStatusContratos(), getStormBancos()])
      .then(([s, b]) => {
        setStatusList(normalize(s, ["status", "items"]));
        setBancos(normalize(b, ["bancos", "items"]));
      }).catch(() => {});
  }, []);

  const buscar = async () => {
    setLoading(true); setErro(""); setHistorico(null);
    try {
      const data = await getStormContratos({
        cpf: cpf || undefined, ff: ff || undefined,
        id_banco: idBanco ? Number(idBanco) : undefined,
        id_status: idStatus ? Number(idStatus) : undefined,
        pagina,
        data_inicio: dataInicio || undefined,
        data_fim: dataFim || undefined,
      });
      const raw = normalize(data, ["contratos", "items", "data"]);
      console.log("[Storm /contratos raw] primeiro item:", JSON.stringify(raw[0], null, 2));
      setContratos(raw.map(normalizeContratoLista));
    } catch (e: AnyData) {
      setErro(e?.response?.data?.detail ?? "Erro ao buscar contratos");
    } finally { setLoading(false); }
  };

  const verHistorico = async (ffCode: string) => {
    setFfHistorico(ffCode);
    try {
      const data = await getStormHistoricoContrato(ffCode);
      console.log("[Storm histórico raw]:", JSON.stringify(data, null, 2));
      setHistorico(normalize(data, ["historico", "items", "data"]));
    } catch { setHistorico([]); }
  };

  const verAcompanhamento = async (ffCode: string) => {
    setFfAcomp(ffCode);
    setAcompanhamento({});
    setLoadingAcomp(true);
    try {
      const data = await getStormAcompanhamentoContrato(ffCode);
      console.log("[Storm acompanhamento raw]:", JSON.stringify(data, null, 2));
      setAcompanhamento(data);
    } catch (e: AnyData) {
      console.error("[Storm acompanhamento erro]:", e?.response?.data ?? e);
      setAcompanhamento(null);
    } finally { setLoadingAcomp(false); }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-xl" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <div>
          <label className="text-[10px] font-bold uppercase mb-1 block" style={{ color: "var(--text-muted)" }}>CPF</label>
          <input value={cpf} onChange={(e) => setCpf(e.target.value)} placeholder="000.000.000-00" className="w-full px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }} />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase mb-1 block" style={{ color: "var(--text-muted)" }}>Código FF</label>
          <input value={ff} onChange={(e) => setFf(e.target.value)} placeholder="FF000000" className="w-full px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }} />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase mb-1 block" style={{ color: "var(--text-muted)" }}>Banco</label>
          <select value={idBanco} onChange={(e) => setIdBanco(e.target.value)} className="w-full px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }}>
            <option value="">Todos</option>
            {bancos.map((b: AnyData) => <option key={b.ba_id ?? b.id} value={b.ba_id ?? b.id}>{b.ba_nome ?? b.nome}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase mb-1 block" style={{ color: "var(--text-muted)" }}>Status</label>
          <select value={idStatus} onChange={(e) => setIdStatus(e.target.value)} className="w-full px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }}>
            <option value="">Todos</option>
            {statusList.map((s: AnyData) => <option key={s.id ?? s.co_id} value={s.id ?? s.co_id}>{s.descricao ?? s.nome ?? s.status}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase mb-1 block" style={{ color: "var(--text-muted)" }}>Data início</label>
          <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="w-full px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }} />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase mb-1 block" style={{ color: "var(--text-muted)" }}>Data fim</label>
          <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="w-full px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }} />
        </div>
        <div className="col-span-2 sm:col-span-4 flex items-center justify-between">
          <div className="flex gap-2">
            <button onClick={() => { setPagina(1); buscar(); }} className="px-5 py-2 rounded-lg text-xs font-bold text-white" style={{ backgroundColor: "#DC2626" }}>Buscar contratos</button>
            {(dataInicio || dataFim) && (
              <button onClick={() => { setDataInicio(""); setDataFim(""); }} className="px-3 py-2 rounded-lg text-xs font-semibold" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-muted)" }}>Limpar datas</button>
            )}
          </div>
          <Paginacao pagina={pagina} onPrev={() => setPagina((p) => Math.max(1, p - 1))} onNext={() => { setPagina((p) => p + 1); buscar(); }} />
        </div>
      </div>

      {erro && <AlertErro msg={erro} />}
      {loading ? <Spinner /> : contratos.length === 0 ? <EmptyState msg="Use os filtros para buscar contratos." /> : (
        <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <table className="w-full text-xs">
            <thead>
              <tr style={{ backgroundColor: "var(--bg-mid)", borderBottom: "1px solid var(--border)" }}>
                {["FF/Código", "Cliente", "CPF", "Banco", "Convênio", "Valor", "Status", ""].map((h) => (
                  <th key={h} className="px-3 py-3 text-left font-bold uppercase text-[10px]" style={{ color: "var(--text-muted)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {contratos.map((c, i) => (
                <tr key={c.ff || i} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td className="px-3 py-2.5 font-mono font-bold" style={{ color: "#DC2626" }}>{c.ff}</td>
                  <td className="px-3 py-2.5 font-medium" style={{ color: "var(--text-primary)" }}>{c.nome_cliente}</td>
                  <td className="px-3 py-2.5 font-mono" style={{ color: "var(--text-muted)" }}>{c.cpf_cliente}</td>
                  <td className="px-3 py-2.5" style={{ color: "var(--text-muted)" }}>{c.banco}</td>
                  <td className="px-3 py-2.5" style={{ color: "var(--text-muted)" }}>{c.convenio}</td>
                  <td className="px-3 py-2.5 font-bold" style={{ color: "var(--text-primary)" }}>{c.valor}</td>
                  <td className="px-3 py-2.5">
                    {c.status !== "—" ? <Badge label={c.status} color="blue" /> : "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex gap-1.5">
                      {c.ff !== "—" && (
                        <button onClick={() => verAcompanhamento(c.ff)} className="px-2 py-1 rounded text-[10px] font-semibold" style={{ backgroundColor: "rgba(34,197,94,0.12)", color: "#22c55e" }}>Acomp.</button>
                      )}
                      {c.ff !== "—" && (
                        <button onClick={() => verHistorico(c.ff)} className="px-2 py-1 rounded text-[10px] font-semibold" style={{ backgroundColor: "rgba(59,130,246,0.12)", color: "#3b82f6" }}>Histórico</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal acompanhamento */}
      {(acompanhamento !== null || loadingAcomp) && (
        <ModalOverlay onClose={() => { if (!loadingAcomp) { setAcompanhamento(null); setFfAcomp(""); } }}>
          <ModalHeader title="Acompanhamento" ff={ffAcomp} onClose={() => { setAcompanhamento(null); setFfAcomp(""); }} />
          <div className="overflow-y-auto flex-1 px-5 py-4">
            {loadingAcomp ? <Spinner /> : !acompanhamento || Object.keys(acompanhamento).length === 0
              ? <EmptyState msg="Nenhum dado disponível. Verifique o console (F12) para detalhes." />
              : <AcompanhamentoView data={acompanhamento} />
            }
          </div>
        </ModalOverlay>
      )}

      {/* Modal histórico */}
      {historico !== null && (
        <ModalOverlay onClose={() => setHistorico(null)}>
          <ModalHeader title="Histórico do Contrato" ff={ffHistorico} onClose={() => setHistorico(null)} />
          <div className="overflow-y-auto flex-1 px-5 py-4">
            {historico.length === 0
              ? <EmptyState msg="Sem histórico disponível." />
              : <HistoricoTimeline itens={historico} />
            }
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}

// ── Aba Clientes ──────────────────────────────────────────────────────────────

function AbaClientes() {
  const [tipoBusca, setTipoBusca] = useState<"cpf" | "telefone">("cpf");
  const [valor, setValor] = useState("");
  const [cliente, setCliente] = useState<ClienteNorm | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [debugCliente, setDebugCliente] = useState<AnyData>(null);
  const [debugContratos, setDebugContratos] = useState<AnyData>(null);
  const [showDebug, setShowDebug] = useState(false);

  const buscar = async () => {
    if (!valor.trim()) return;
    setLoading(true); setErro(""); setCliente(null); setDebugCliente(null); setDebugContratos(null);
    try {
      const digits = valor.replace(/\D/g, "");
      // CPF formatado para endpoints que exigem XXX.XXX.XXX-XX
      const cpfFmt = digits.length === 11
        ? `${digits.slice(0,3)}.${digits.slice(3,6)}.${digits.slice(6,9)}-${digits.slice(9)}`
        : valor;

      if (tipoBusca === "cpf") {
        const [rawCliente, rawContratos] = await Promise.allSettled([
          getStormClienteCpf(digits),
          getStormContratos({ cpf: cpfFmt }),
        ]);

        const clienteData = rawCliente.status === "fulfilled" ? rawCliente.value : null;
        const contratosData = rawContratos.status === "fulfilled" ? rawContratos.value : null;

        setDebugCliente(clienteData);
        setDebugContratos(contratosData);

        const erroMsg = stormErro(clienteData);
        if (erroMsg && !contratosData) { setErro(erroMsg); return; }

        const norm = mergeClienteAndContratos(clienteData, contratosData);
        if (!norm) { setErro("CPF não encontrado ou sem contratos na base Storm."); return; }
        setCliente(norm);
      } else {
        const raw = await getStormClienteTelefone(digits);
        setDebugCliente(raw);
        const erroMsg = stormErro(raw);
        if (erroMsg) { setErro(erroMsg); return; }
        const norm = mergeClienteAndContratos(raw, null);
        if (!norm) { setErro("Telefone não encontrado na base Storm."); return; }
        setCliente(norm);
      }
    } catch (e: AnyData) {
      setErro(e?.response?.data?.detail ?? "Erro na busca. Verifique os dados e tente novamente.");
    } finally { setLoading(false); }
  };

  const Field = ({ label, value, mono = false, omitDash = false }: { label: string; value: string; mono?: boolean; omitDash?: boolean }) => {
    if (omitDash && value === "—") return null;
    return (
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wide mb-0.5" style={{ color: "var(--text-muted)" }}>{label}</p>
        <p className={`text-sm font-semibold${mono ? " font-mono" : ""}`} style={{ color: "var(--text-primary)" }}>{value}</p>
      </div>
    );
  };

  const Section = ({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) => (
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="px-4 py-2.5" style={{ backgroundColor: `${accent}14`, borderBottom: `1px solid ${accent}30` }}>
        <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: accent }}>{title}</p>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );

  const situacaoCor = (s: string): "green" | "red" | "yellow" | "gray" => {
    const sl = s.toLowerCase();
    if (sl.includes("ativo")) return "green";
    if (sl.includes("inativo") || sl.includes("cessado") || sl.includes("bloqueado")) return "red";
    if (sl.includes("suspens") || sl.includes("pendente")) return "yellow";
    return "gray";
  };

  return (
    <div className="space-y-4 max-w-2xl">

      {/* ── Barra de busca ── */}
      <div className="p-4 rounded-xl" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <div className="flex gap-2 mb-3">
          {(["cpf", "telefone"] as const).map((t) => (
            <button key={t}
              onClick={() => { setTipoBusca(t); setValor(""); setCliente(null); setErro(""); }}
              className="px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all"
              style={{ backgroundColor: tipoBusca === t ? "#DC2626" : "var(--bg-mid)", color: tipoBusca === t ? "#fff" : "var(--text-muted)" }}
            >{t === "cpf" ? "Por CPF" : "Por Telefone"}</button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && buscar()}
            placeholder={tipoBusca === "cpf" ? "000.000.000-00" : "(11) 99999-9999"}
            className="flex-1 px-3 py-2.5 rounded-lg text-sm"
            style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
          />
          <button onClick={buscar} disabled={loading}
            className="px-6 py-2 rounded-lg text-xs font-bold text-white transition-all"
            style={{ backgroundColor: "#DC2626", opacity: loading ? 0.65 : 1 }}
          >{loading ? "Buscando..." : "Buscar"}</button>
        </div>
      </div>

      {loading && <Spinner />}
      {erro && <AlertErro msg={erro} />}

      {/* ── Painel de diagnóstico — remover após confirmar estrutura ── */}
      {(debugCliente || debugContratos) && (
        <div className="rounded-xl overflow-hidden text-xs" style={{ border: "1px solid rgba(234,179,8,0.4)", backgroundColor: "rgba(234,179,8,0.05)" }}>
          <button
            onClick={() => setShowDebug((v) => !v)}
            className="w-full px-4 py-2.5 text-left font-black uppercase tracking-widest flex justify-between"
            style={{ color: "#eab308" }}
          >
            <span>🔍 Diagnóstico API Storm</span>
            <span>{showDebug ? "▲ ocultar" : "▼ ver JSON bruto"}</span>
          </button>
          {showDebug && (
            <div className="px-4 pb-4 space-y-3">
              <div>
                <p className="font-bold mb-1" style={{ color: "#eab308" }}>/clientes/cpf</p>
                <pre className="text-[10px] overflow-auto max-h-48 p-2 rounded" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)" }}>
                  {JSON.stringify(debugCliente, null, 2)}
                </pre>
              </div>
              {debugContratos && (
                <div>
                  <p className="font-bold mb-1" style={{ color: "#eab308" }}>/contratos?cpf</p>
                  <pre className="text-[10px] overflow-auto max-h-48 p-2 rounded" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)" }}>
                    {JSON.stringify(debugContratos, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {cliente && (
        <div className="space-y-3">

          {/* ── Hero ── */}
          <div className="rounded-xl p-5" style={{ background: "linear-gradient(135deg, rgba(220,38,38,0.09) 0%, rgba(220,38,38,0.02) 100%)", border: "1px solid rgba(220,38,38,0.22)" }}>
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-black text-white flex-shrink-0" style={{ backgroundColor: "#DC2626" }}>
                {(cliente.nome !== "—" ? cliente.nome[0] : "?").toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-black leading-tight" style={{ color: "var(--text-primary)" }}>
                  {cliente.nome}
                </h2>
                <p className="text-sm font-mono mt-0.5" style={{ color: "var(--text-muted)" }}>{cliente.cpf}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {cliente.situacao !== "—" && <Badge label={cliente.situacao} color={situacaoCor(cliente.situacao)} />}
                  {cliente.especie !== "—" && <Badge label={cliente.especie} color="blue" />}
                  {cliente.cidade !== "—" && (
                    <Badge label={`${cliente.cidade}${cliente.uf !== "—" ? ` / ${cliente.uf}` : ""}`} color="gray" />
                  )}
                </div>
              </div>
              {cliente.margem_disponivel_raw != null && (
                <div className="text-right flex-shrink-0 pl-4" style={{ borderLeft: "1px solid rgba(220,38,38,0.2)" }}>
                  <p className="text-[10px] font-bold uppercase tracking-wide mb-0.5" style={{ color: "var(--text-muted)" }}>Margem Livre</p>
                  <p className="text-2xl font-black" style={{ color: "#22c55e" }}>{cliente.margem_disponivel}</p>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

            {/* ── Benefício / Matrícula ── */}
            <Section title="Benefício / Matrícula" accent="#DC2626">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nascimento"    value={cliente.data_nascimento} />
                <Field label="Sexo"          value={cliente.sexo} />
                <Field label="Matrícula"     value={cliente.matricula} mono />
                <Field label="NB / Benefício" value={cliente.nb} mono />
                {cliente.especie !== "—" && (
                  <div className="col-span-2">
                    <p className="text-[10px] font-bold uppercase tracking-wide mb-0.5" style={{ color: "var(--text-muted)" }}>Espécie</p>
                    <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{cliente.especie}</p>
                  </div>
                )}
                <Field label="Banco Pagador" value={cliente.banco_beneficio} omitDash />
              </div>
            </Section>

            {/* ── Documentos ── */}
            <Section title="Documentos" accent="#eab308">
              <div className="grid grid-cols-2 gap-3">
                <Field label="RG"            value={cliente.rg} mono />
                <Field label="Órgão Emissor" value={cliente.orgao_emissor} omitDash />
                <Field label="UF Documento"  value={cliente.uf_doc} omitDash />
              </div>
            </Section>

            {/* ── Contato ── */}
            <Section title="Contato" accent="#3b82f6">
              <div className="space-y-3">
                <Field label="Telefone"   value={cliente.telefone} mono />
                <Field label="Telefone 2" value={cliente.telefone2} mono omitDash />
                <Field label="E-mail"     value={cliente.email} omitDash />
                {cliente.endereco !== "—" && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide mb-0.5" style={{ color: "var(--text-muted)" }}>Endereço</p>
                    <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{cliente.endereco}</p>
                  </div>
                )}
              </div>
            </Section>

            {/* ── Financeiro ── */}
            <Section title="Financeiro" accent="#22c55e">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase mb-1" style={{ color: "var(--text-muted)" }}>Renda Bruta</p>
                    <p className="text-lg font-black" style={{ color: "var(--text-primary)" }}>{cliente.renda}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase mb-1" style={{ color: "var(--text-muted)" }}>Margem Disponível</p>
                    <p className="text-lg font-black" style={{ color: "#22c55e" }}>{cliente.margem_disponivel}</p>
                  </div>
                  {cliente.margem_utilizada !== "—" && (
                    <div>
                      <p className="text-[10px] font-bold uppercase mb-1" style={{ color: "var(--text-muted)" }}>Margem Utilizada</p>
                      <p className="text-lg font-black" style={{ color: "#eab308" }}>{cliente.margem_utilizada}</p>
                    </div>
                  )}
                </div>
                {cliente.percentual_margem_util != null && (
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-[10px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>Comprometimento</span>
                      <span className="text-[10px] font-black" style={{ color: cliente.percentual_margem_util > 75 ? "#DC2626" : "#22c55e" }}>
                        {cliente.percentual_margem_util}%
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: "var(--bg-mid)" }}>
                      <div className="h-full rounded-full transition-all" style={{
                        width: `${cliente.percentual_margem_util}%`,
                        backgroundColor: cliente.percentual_margem_util > 75 ? "#DC2626" : cliente.percentual_margem_util > 50 ? "#eab308" : "#22c55e"
                      }} />
                    </div>
                  </div>
                )}
              </div>
            </Section>

          </div>

          {/* ── Contratos ── */}
          {cliente.contratos.length > 0 && (
            <Section title={`Contratos (${cliente.contratos.length})`} accent="#a855f7">
              <div className="space-y-2">
                {cliente.contratos.map((ct, i) => (
                  <div key={i} className="rounded-xl p-3" style={{ backgroundColor: "var(--bg-mid)" }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-sm font-black font-mono" style={{ color: "#DC2626" }}>{ct.codigo}</span>
                          <Badge label={ct.status} color="blue" />
                          {ct.produto !== "—" && <Badge label={ct.produto} color="purple" />}
                        </div>
                        <p className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>
                          {[ct.banco, ct.convenio].map(stormStr).filter((v): v is string => !!v && v !== "—").join(" · ") || "—"}
                        </p>
                        <div className="flex flex-wrap gap-3 text-[10px]" style={{ color: "var(--text-muted)" }}>
                          {ct.prazo !== "—" && <span>{ct.prazo}</span>}
                          {ct.taxa !== "—" && <span>{ct.taxa}</span>}
                          {ct.data_inicio !== "—" && <span>Início: {ct.data_inicio}</span>}
                          {ct.data_fim !== "—" && <span>Venc: {ct.data_fim}</span>}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-black" style={{ color: "var(--text-primary)" }}>{ct.valor}</p>
                        {ct.parcela !== "—" && (
                          <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>{ct.parcela}/mês</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

        </div>
      )}
    </div>
  );
}

// ── Aba Colaboradores ─────────────────────────────────────────────────────────

type SubAbaColab = "parceiros" | "colaboradores";

function avatarIniciais(nome: string): string {
  const parts = nome.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0]?.[0] ?? "?").toUpperCase();
}

function statusCorColab(s: string): "green" | "red" | "gray" {
  const v = String(s).toLowerCase();
  if (v === "ativo" || v === "1" || v === "true") return "green";
  if (v === "inativo" || v === "0" || v === "false") return "red";
  return "gray";
}

// ss() — extrai string segura de qualquer valor, incluindo objetos aninhados
function ss(...vals: unknown[]): string {
  for (const v of vals) {
    const s = stormStr(v);
    if (s) return s;
  }
  return "";
}

function normColab(c: AnyData) {
  return {
    id:       c.id       ?? c.op_id  ?? c.pa_id  ?? c.par_id  ?? null,
    nome:     ss(c.nome, c.op_nome, c.pa_nome, c.par_nome, c.usuario, c.login) || "—",
    login:    ss(c.usuario, c.login, c.op_usuario),
    email:    ss(c.email, c.op_email, c.pa_email),
    telefone: ss(c.telefone, c.celular, c.pa_telefone, c.fone),
    cpf_cnpj: ss(c.cpf, c.cnpj, c.cpf_cnpj, c.pa_cpf),
    status:   ss(c.status, c.status_usuario, c.situacao, c.ativo),
    tipo:     ss(c.tipo, c.perfil, c.privilegio, c.categoria, c.pa_tipo),
    cidade:   ss(c.cidade, c.pa_cidade, c.municipio),
    uf:       ss(c.uf, c.estado, c.pa_uf),
  };
}

function AbaColaboradores() {
  const [sub, setSub]                   = useState<SubAbaColab>("colaboradores");
  const [items, setItems]               = useState<AnyData[]>([]);
  const [detalhe, setDetalhe]           = useState<AnyData | null>(null);
  const [detalheNome, setDetalheNome]   = useState("");
  const [loading, setLoading]           = useState(false);
  const [loadingDetalhe, setLoadingDetalhe] = useState(false);
  const [busca, setBusca]               = useState("");
  const [pagina, setPagina]             = useState(1);
  const [erro, setErro]                 = useState("");

  // Recebe pagina/busca/sub como parâmetros para evitar closure stale
  const executarBusca = useCallback(async (
    paginaAtual: number,
    buscaAtual: string,
    subAtual: SubAbaColab,
  ) => {
    setLoading(true); setErro("");
    try {
      let data: AnyData;
      if (subAtual === "parceiros") {
        data = await getStormParceiros({ pagina: paginaAtual, nome: buscaAtual || undefined });
        console.log("[Storm parceiros raw]:", JSON.stringify(data, null, 2));
        setItems(normalize(data, ["parceiros", "corretores", "correspondentes", "promotoras", "items", "data"]));
      } else {
        data = await getStormColaboradores({ pagina: paginaAtual, usuario: buscaAtual || undefined });
        console.log("[Storm colaboradores raw]:", JSON.stringify(data, null, 2));
        setItems(normalize(data, ["colaboradores", "operadores", "usuarios", "items", "data"]));
      }
    } catch (e: AnyData) {
      const msg = e?.response?.data?.detail ?? e?.message ?? `Erro ao buscar ${subAtual}`;
      console.error(`[Storm ${subAtual} erro]:`, e?.response?.data ?? e);
      setErro(msg);
      setItems([]);
    } finally { setLoading(false); }
  }, []);

  // Reset ao trocar sub-aba, sem auto-carregar
  useEffect(() => {
    setBusca(""); setPagina(1); setItems([]); setErro("");
  }, [sub]);

  const verDetalhe = async (c: AnyData) => {
    const norm = normColab(c);
    setDetalheNome(norm.nome);
    setDetalhe(null);
    setLoadingDetalhe(true);
    try {
      const data = norm.id != null
        ? (sub === "parceiros" ? await getStormParceiro(norm.id) : await getStormColaborador(norm.id))
        : c;
      console.log(`[Storm detalhe ${sub} raw]:`, JSON.stringify(data, null, 2));
      setDetalhe(data ?? c);
    } catch {
      setDetalhe(c);
    } finally { setLoadingDetalhe(false); }
  };

  const tabBtnStyle = (ativo: boolean): React.CSSProperties => ({
    padding: "6px 16px", borderRadius: 8, fontSize: 11, fontWeight: 700,
    backgroundColor: ativo ? "#DC2626" : "var(--bg-mid)",
    color: ativo ? "#fff" : "var(--text-muted)",
    border: "none", cursor: "pointer", transition: "all .15s",
  });

  return (
    <div className="space-y-4">
      {/* Barra de controles */}
      <div className="p-4 rounded-xl space-y-3" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
        {/* Sub-abas */}
        <div className="flex gap-2">
          <button style={tabBtnStyle(sub === "colaboradores")} onClick={() => setSub("colaboradores")}>Colaboradores</button>
          <button style={tabBtnStyle(sub === "parceiros")} onClick={() => setSub("parceiros")}>Parceiros</button>
        </div>

        {/* Busca + ação */}
        <div className="flex flex-wrap gap-2 items-center">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { setPagina(1); executarBusca(1, busca, sub); } }}
            placeholder={sub === "parceiros" ? "Buscar por nome ou CPF/CNPJ..." : "Buscar por usuário ou nome..."}
            className="flex-1 min-w-44 px-3 py-2 rounded-lg text-xs"
            style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
          />
          <button
            onClick={() => { setPagina(1); executarBusca(1, busca, sub); }}
            className="px-4 py-2 rounded-lg text-xs font-bold text-white"
            style={{ backgroundColor: "#DC2626" }}
          >
            Buscar
          </button>
          <Paginacao
            pagina={pagina}
            onPrev={() => { const p = Math.max(1, pagina - 1); setPagina(p); executarBusca(p, busca, sub); }}
            onNext={() => { const p = pagina + 1; setPagina(p); executarBusca(p, busca, sub); }}
          />
        </div>
      </div>

      {erro && <AlertErro msg={erro} />}

      {loading ? <Spinner /> : items.length === 0 ? (
        <EmptyState msg={`Clique em "Buscar" para carregar ${sub === "parceiros" ? "parceiros" : "colaboradores"}.`} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((raw: AnyData, i: number) => {
            const c = normColab(raw);
            const cor = statusCorColab(c.status);
            return (
              <Card key={c.id ?? i} className="flex items-start gap-3 cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => verDetalhe(raw)}>
                {/* Avatar */}
                <div className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-black text-white flex-shrink-0"
                  style={{ backgroundColor: cor === "green" ? "#16a34a" : cor === "red" ? "#DC2626" : "#64748b" }}>
                  {avatarIniciais(c.nome !== "—" ? c.nome : "?")}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold truncate" style={{ color: "var(--text-primary)" }}>{c.nome}</p>
                  {c.login && <p className="text-[10px] font-mono truncate" style={{ color: "var(--text-muted)" }}>{c.login}</p>}
                  {c.email && <p className="text-[10px] truncate" style={{ color: "var(--text-muted)" }}>{c.email}</p>}
                  {c.telefone && <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>{c.telefone}</p>}
                  {(c.cidade || c.uf) && (
                    <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                      {[c.cidade, c.uf].filter(Boolean).join(" – ")}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {c.status && <Badge label={c.status} color={cor} />}
                    {c.tipo && <Badge label={c.tipo} color="blue" />}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal detalhe */}
      {(detalhe !== null || loadingDetalhe) && (
        <ModalOverlay onClose={() => { if (!loadingDetalhe) setDetalhe(null); }}>
          <ModalHeader
            title={sub === "parceiros" ? "Detalhe do Parceiro" : "Detalhe do Colaborador"}
            ff={detalheNome}
            onClose={() => setDetalhe(null)}
          />
          <div className="overflow-y-auto flex-1 px-5 py-4">
            {loadingDetalhe ? <Spinner /> : <AcompanhamentoView data={detalhe} />}
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}

// ── Aba Simulações ────────────────────────────────────────────────────────────

function AbaSimulacoes() {
  const [tipo, setTipo] = useState<"clt" | "fgts">("clt");
  const [cpf, setCpf] = useState("");
  const [bancoId, setBancoId] = useState("");
  const [valorSolicitado, setValorSolicitado] = useState("");
  const [matricula, setMatricula] = useState("");
  const [bancos, setBancos] = useState<AnyData[]>([]);
  const [resultado, setResultado] = useState<AnyData>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    getStormBancos().then((d: AnyData) => setBancos(normalize(d, ["bancos", "items"]))).catch(() => {});
  }, []);

  const simular = async () => {
    if (!cpf || !bancoId) { setErro("CPF e banco são obrigatórios."); return; }
    setLoading(true); setErro(""); setResultado(null);
    try {
      const data = tipo === "clt"
        ? await simularCLTStorm(cpf.replace(/\D/g, ""), Number(bancoId), valorSolicitado ? Number(valorSolicitado) : undefined, matricula || undefined)
        : await simularFGTSStorm(cpf.replace(/\D/g, ""), Number(bancoId));
      setResultado(data);
    } catch (e: AnyData) {
      setErro(e?.response?.data?.detail ?? "Erro ao realizar simulação");
    } finally { setLoading(false); }
  };

  const exibir = (obj: AnyData, profundidade = 0): React.ReactNode => {
    if (!obj || typeof obj !== "object") return null;
    return Object.entries(obj).map(([k, v]) => {
      if (typeof v === "object" && v !== null && profundidade < 2) {
        return (
          <div key={k} className="mt-2">
            <p className="text-[10px] font-black uppercase mb-1" style={{ color: "#DC2626" }}>{k.replace(/_/g, " ")}</p>
            <div className="pl-3 border-l-2" style={{ borderColor: "var(--border)" }}>{exibir(v, profundidade + 1)}</div>
          </div>
        );
      }
      if (v == null || v === "") return null;
      return (
        <div key={k} className="flex justify-between items-baseline py-1" style={{ borderBottom: "1px solid var(--border)" }}>
          <span className="text-[10px] font-semibold uppercase" style={{ color: "var(--text-muted)" }}>{k.replace(/_/g, " ")}</span>
          <span className="text-xs font-medium ml-4 text-right" style={{ color: "var(--text-primary)" }}>{String(v)}</span>
        </div>
      );
    });
  };

  return (
    <div className="space-y-4 max-w-xl">
      <div className="flex gap-2">
        {(["clt", "fgts"] as const).map((t) => (
          <button key={t} onClick={() => { setTipo(t); setResultado(null); setErro(""); }}
            className="px-5 py-2 rounded-lg text-xs font-bold uppercase tracking-widest"
            style={{ backgroundColor: tipo === t ? "#DC2626" : "var(--bg-mid)", color: tipo === t ? "#fff" : "var(--text-muted)" }}
          >{t === "clt" ? "Consignado CLT" : "FGTS"}</button>
        ))}
      </div>

      <Card>
        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-bold uppercase mb-1 block" style={{ color: "var(--text-muted)" }}>CPF do Cliente</label>
            <input value={cpf} onChange={(e) => setCpf(e.target.value)} placeholder="000.000.000-00" className="w-full px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }} />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase mb-1 block" style={{ color: "var(--text-muted)" }}>Banco</label>
            <select value={bancoId} onChange={(e) => setBancoId(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }}>
              <option value="">Selecione o banco</option>
              {bancos.map((b: AnyData) => <option key={b.ba_id ?? b.id} value={b.ba_id ?? b.id}>{b.ba_nome ?? b.nome}</option>)}
            </select>
          </div>
          {tipo === "clt" && (
            <>
              <div>
                <label className="text-[10px] font-bold uppercase mb-1 block" style={{ color: "var(--text-muted)" }}>Valor Solicitado (opcional)</label>
                <input value={valorSolicitado} onChange={(e) => setValorSolicitado(e.target.value)} type="number" placeholder="R$ 0,00" className="w-full px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }} />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase mb-1 block" style={{ color: "var(--text-muted)" }}>Matrícula (opcional)</label>
                <input value={matricula} onChange={(e) => setMatricula(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)", border: "1px solid var(--border)" }} />
              </div>
            </>
          )}
          <button onClick={simular} disabled={loading} className="w-full py-3 rounded-xl text-sm font-black text-white uppercase tracking-wide" style={{ backgroundColor: "#DC2626", opacity: loading ? 0.7 : 1 }}>
            {loading ? "Simulando..." : `Simular ${tipo.toUpperCase()}`}
          </button>
        </div>
      </Card>

      {erro && <AlertErro msg={erro} />}
      {resultado && (
        <Card>
          <p className="text-xs font-black uppercase mb-3" style={{ color: "#DC2626" }}>Resultado da Simulação</p>
          <div>{exibir(resultado)}</div>
        </Card>
      )}
    </div>
  );
}

// ── Aba Referência (Bancos + Órgãos) ─────────────────────────────────────────

function AbaReferencia() {
  const [bancos, setBancos] = useState<AnyData[]>([]);
  const [orgaos, setOrgaos] = useState<AnyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [sub, setSub] = useState<"bancos" | "orgaos">("bancos");

  useEffect(() => {
    Promise.all([getStormBancos(), getStormOrgaos()])
      .then(([b, o]) => { setBancos(normalize(b, ["bancos", "items"])); setOrgaos(normalize(o, ["orgaos", "items"])); })
      .catch((e: AnyData) => setErro(e?.response?.data?.detail ?? "Erro ao carregar referências"))
      .finally(() => setLoading(false));
  }, []);

  const lista = sub === "bancos" ? bancos : orgaos;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["bancos", "orgaos"] as const).map((s) => (
          <button key={s} onClick={() => setSub(s)}
            className="px-4 py-2 rounded-lg text-xs font-bold uppercase"
            style={{ backgroundColor: sub === s ? "#DC2626" : "var(--bg-mid)", color: sub === s ? "#fff" : "var(--text-muted)" }}
          >{s === "bancos" ? "Bancos" : "Órgãos / Convênios"}</button>
        ))}
      </div>

      {erro && <AlertErro msg={erro} />}
      {loading ? <Spinner /> : lista.length === 0 ? <EmptyState msg={`Nenhum ${sub} retornado pela Storm.`} /> : (
        <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <table className="w-full text-xs">
            <thead>
              <tr style={{ backgroundColor: "var(--bg-mid)", borderBottom: "1px solid var(--border)" }}>
                <th className="px-4 py-3 text-left font-bold uppercase text-[10px]" style={{ color: "var(--text-muted)" }}>ID</th>
                <th className="px-4 py-3 text-left font-bold uppercase text-[10px]" style={{ color: "var(--text-muted)" }}>Nome</th>
                {sub === "bancos" && <th className="px-4 py-3 text-left font-bold uppercase text-[10px]" style={{ color: "var(--text-muted)" }}>Código</th>}
                {sub === "orgaos" && <th className="px-4 py-3 text-left font-bold uppercase text-[10px]" style={{ color: "var(--text-muted)" }}>Sigla / Tipo</th>}
                <th className="px-4 py-3 text-left font-bold uppercase text-[10px]" style={{ color: "var(--text-muted)" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((item: AnyData, i: number) => (
                <tr key={item.ba_id ?? item.or_id ?? item.id ?? i} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td className="px-4 py-2.5 font-mono font-bold" style={{ color: "#DC2626" }}>{item.ba_id ?? item.or_id ?? item.id ?? i + 1}</td>
                  <td className="px-4 py-2.5 font-medium" style={{ color: "var(--text-primary)" }}>{item.ba_nome ?? item.or_nome ?? item.nome ?? "—"}</td>
                  {sub === "bancos" && <td className="px-4 py-2.5 font-mono" style={{ color: "var(--text-muted)" }}>{item.ba_codigo ?? item.codigo ?? "—"}</td>}
                  {sub === "orgaos" && <td className="px-4 py-2.5" style={{ color: "var(--text-muted)" }}>{item.or_sigla ?? item.sigla ?? item.tipo ?? "—"}</td>}
                  <td className="px-4 py-2.5">
                    {item.status || item.ativo != null ? (
                      <Badge label={item.status ?? (item.ativo ? "Ativo" : "Inativo")} color={item.status === "ativo" || item.ativo ? "green" : "gray"} />
                    ) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function StormPage() {
  const [tab, setTab] = useState<Tab>("antifraude");
  const [status, setStatus] = useState<AnyData>(null);
  const [resetando, setResetando] = useState(false);

  useEffect(() => { getStormStatus().then(setStatus).catch(() => {}); }, []);

  const resetarCB = async () => {
    setResetando(true);
    try { await resetarCircuitBreakerStorm(); getStormStatus().then(setStatus); }
    finally { setResetando(false); }
  };

  const cbEstado = status?.estado;
  const cbCor = cbEstado === "CLOSED" ? "#22c55e" : cbEstado === "OPEN" ? "#DC2626" : "#eab308";

  return (
    <Layout>
      <div className="space-y-5">
        {/* Cabeçalho */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-black" style={{ color: "var(--text-primary)" }}>Storm Tecnologia</h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest" style={{ backgroundColor: "rgba(59,130,246,0.12)", color: "#3b82f6" }}>Colaborador</span>
            </div>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              Integração completa — antifraude, contratos, clientes, colaboradores, simulações e referência.
            </p>
          </div>

          {/* Status técnico */}
          {status && (
            <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 rounded-xl" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cbCor }} />
                <span className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
                  CB: <span style={{ color: cbCor }}>{cbEstado}</span>
                </span>
              </div>
              <div className="w-px h-4" style={{ backgroundColor: "var(--border)" }} />
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: status.token_ativo ? "#22c55e" : "#6b7280" }} />
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Token: {status.token_ativo ? "ativo" : "sem token"}
                </span>
              </div>
              {status.token_expira_em && (
                <>
                  <div className="w-px h-4" style={{ backgroundColor: "var(--border)" }} />
                  <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                    Expira: {new Date(status.token_expira_em).toLocaleTimeString("pt-BR")}
                  </span>
                </>
              )}
              {cbEstado === "OPEN" && (
                <button onClick={resetarCB} disabled={resetando} className="ml-2 px-3 py-1 rounded-lg text-xs font-semibold" style={{ backgroundColor: "rgba(234,179,8,0.12)", color: "#eab308" }}>
                  {resetando ? "Resetando..." : "Resetar CB"}
                </button>
              )}
            </div>
          )}
        </div>

        {!status?.credenciais_configuradas && status && (
          <div className="px-4 py-3 rounded-xl text-xs font-semibold" style={{ backgroundColor: "rgba(234,179,8,0.08)", color: "#eab308", border: "1px solid rgba(234,179,8,0.25)" }}>
            Configure STORM_USERNAME, STORM_PASSWORD e STORM_CLIENT_ID no .env para ativar a integração.
          </div>
        )}

        {/* Tabs */}
        <div className="flex flex-wrap gap-0.5" style={{ borderBottom: "1px solid var(--border)" }}>
          {TABS.map(({ id, label }) => (
            <button key={id} onClick={() => setTab(id)}
              className="px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-all"
              style={{ color: tab === id ? "#DC2626" : "var(--text-muted)", backgroundColor: tab === id ? "rgba(220,38,38,0.07)" : "transparent", borderBottom: tab === id ? "2px solid #DC2626" : "2px solid transparent" }}
            >{label}</button>
          ))}
        </div>

        {/* Conteúdo */}
        <div>
          {tab === "antifraude"    && <AbaAntifraude />}
          {tab === "contratos"     && <AbaContratos />}
          {tab === "clientes"      && <AbaClientes />}
          {tab === "colaboradores" && <AbaColaboradores />}
          {tab === "simulacoes"    && <AbaSimulacoes />}
          {tab === "referencia"    && <AbaReferencia />}
        </div>
      </div>
    </Layout>
  );
}
