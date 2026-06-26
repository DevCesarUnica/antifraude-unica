import { useState, useCallback, useEffect } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getPropostasDashboard, aprovarProposta, bloquearProposta, reprocessarProposta } from "@/lib/api";
import PropostaDetalheModal, { type PropostaDashboard } from "@/components/PropostaDetalheModal";

// ── Tipos ────────────────────────────────────────────────────────────────────

interface DashboardResponse {
  items: PropostaDashboard[];
  total: number;
  skip: number;
  limit: number;
}

// ── Helpers de formatação (usados na tabela) ─────────────────────────────────

function fmtBRL(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtCPF(cpf: string): string {
  const d = cpf.replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
  return cpf;
}

function fmtData(s: string | null | undefined): string {
  if (!s) return "—";
  try { return format(new Date(s), "dd/MM/yyyy HH:mm", { locale: ptBR }); }
  catch { return s; }
}

function fmtDataSo(s: string | null | undefined): string {
  if (!s) return "—";
  try { return format(new Date(s), "dd/MM/yyyy", { locale: ptBR }); }
  catch { return s; }
}

function safe(v: unknown): string {
  if (v == null) return "—";
  return String(v) || "—";
}

// ── Badge de status ──────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; bg: string; color: string }> = {
  APROVADA:         { label: "Aprovada",    bg: "rgba(34,197,94,0.15)",   color: "#22c55e" },
  CONFIRMADA_BANCO: { label: "Confirmada",  bg: "rgba(16,185,129,0.15)",  color: "#10b981" },
  ANALISE_MANUAL:   { label: "Analisar",    bg: "rgba(234,179,8,0.15)",   color: "#eab308" },
  EM_ANALISE:       { label: "Em Análise",  bg: "rgba(96,165,250,0.15)",  color: "#60a5fa" },
  ENFILEIRADA:      { label: "Enfileirada", bg: "rgba(148,163,184,0.15)", color: "#94a3b8" },
  BLOQUEADA:        { label: "Bloqueada",   bg: "rgba(239,68,68,0.15)",   color: "#ef4444" },
  REPROVADA:        { label: "Reprovada",   bg: "rgba(239,68,68,0.15)",   color: "#ef4444" },
  ENVIADA_BANCO:    { label: "Enviada",     bg: "rgba(168,85,247,0.15)",  color: "#a855f7" },
  ERRO:             { label: "Erro",        bg: "rgba(251,146,60,0.15)",  color: "#fb923c" },
};

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? { label: status, bg: "rgba(148,163,184,0.15)", color: "#94a3b8" };
  return (
    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide whitespace-nowrap" style={{ backgroundColor: m.bg, color: m.color }}>
      {m.label}
    </span>
  );
}

function OrigemChip({ origem }: { origem: string }) {
  const meta: Record<string, { label: string; color: string }> = {
    hope:   { label: "HOPE",   color: "#DC2626" },
    storm:  { label: "STORM",  color: "#3b82f6" },
    manual: { label: "MANUAL", color: "#94a3b8" },
  };
  const m = meta[origem] ?? { label: origem.toUpperCase(), color: "#94a3b8" };
  return (
    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: `${m.color}15`, color: m.color }}>
      {m.label}
    </span>
  );
}

// ── Cabeçalho de coluna ordenável ────────────────────────────────────────────

function ColHeader({
  label, col, orderBy, orderDir, onSort,
}: {
  label: string; col: string; orderBy: string; orderDir: "asc" | "desc";
  onSort: (col: string) => void;
}) {
  const ativo = orderBy === col;
  return (
    <th
      onClick={() => onSort(col)}
      className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide cursor-pointer select-none whitespace-nowrap"
      style={{ color: ativo ? "var(--text-primary)" : "var(--text-muted)" }}
    >
      {label}{" "}
      {ativo && <span style={{ opacity: 0.7 }}>{orderDir === "desc" ? "↓" : "↑"}</span>}
    </th>
  );
}

// ── Filtros ──────────────────────────────────────────────────────────────────

interface Filtros {
  banco: string; status: string; cpf: string; nome: string;
  corretor: string; valor_min: string; valor_max: string;
  data_inicio: string; data_fim: string;
}

const FILTROS_VAZIOS: Filtros = {
  banco: "", status: "", cpf: "", nome: "",
  corretor: "", valor_min: "", valor_max: "",
  data_inicio: "", data_fim: "",
};

const STATUSES_OPCOES = [
  "", "ENFILEIRADA", "EM_ANALISE", "ANALISE_MANUAL", "APROVADA",
  "BLOQUEADA", "REPROVADA", "ENVIADA_BANCO", "CONFIRMADA_BANCO", "ERRO",
];

const inputCls: React.CSSProperties = {
  backgroundColor: "var(--bg-mid)", color: "var(--text-primary)",
  border: "1px solid var(--border)", borderRadius: "0.5rem",
  padding: "0.35rem 0.6rem", fontSize: "0.72rem", outline: "none", width: "100%",
};


// ── Componente principal ──────────────────────────────────────────────────────

const LIMIT = 50;

export default function DashboardPropostasTable() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VAZIOS);
  const [aplicados, setAplicados] = useState<Filtros>(FILTROS_VAZIOS);
  const [skip, setSkip] = useState(0);
  const [orderBy, setOrderBy] = useState("criado_em");
  const [orderDir, setOrderDir] = useState<"asc" | "desc">("desc");

  const [modalProposta, setModalProposta] = useState<PropostaDashboard | null>(null);

  const carregar = useCallback(async (s: number) => {
    setLoading(true); setErro("");
    try {
      const params: Record<string, unknown> = {
        skip: s,
        limit: LIMIT,
        order_by: orderBy,
        order_dir: orderDir,
      };
      if (aplicados.banco)       params.banco       = aplicados.banco;
      if (aplicados.status)      params.status      = aplicados.status;
      if (aplicados.cpf)         params.cpf         = aplicados.cpf;
      if (aplicados.nome)        params.nome        = aplicados.nome;
      if (aplicados.corretor)    params.corretor    = aplicados.corretor;
      if (aplicados.valor_min)   params.valor_min   = Number(aplicados.valor_min);
      if (aplicados.valor_max)   params.valor_max   = Number(aplicados.valor_max);
      if (aplicados.data_inicio) params.data_inicio = aplicados.data_inicio;
      if (aplicados.data_fim)    params.data_fim    = aplicados.data_fim;

      const res: DashboardResponse = await getPropostasDashboard(params as Parameters<typeof getPropostasDashboard>[0]);
      setData(res);
      setSkip(s);
    } catch {
      setErro("Erro ao carregar propostas. Tente novamente.");
    } finally { setLoading(false); }
  }, [aplicados, orderBy, orderDir]);

  useEffect(() => { carregar(0); }, [aplicados, orderBy, orderDir]); // eslint-disable-line react-hooks/exhaustive-deps

  const aplicarFiltros = () => { setAplicados({ ...filtros }); };
  const limparFiltros  = () => { setFiltros(FILTROS_VAZIOS); setAplicados(FILTROS_VAZIOS); };

  const handleSort = (col: string) => {
    if (col === orderBy) setOrderDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setOrderBy(col); setOrderDir("desc"); }
  };

  const paginaAtual  = Math.floor(skip / LIMIT) + 1;
  const totalPaginas = data ? Math.ceil(data.total / LIMIT) : 1;
  const temFiltro    = Object.values(aplicados).some(Boolean);

  const abrirModal = (p: PropostaDashboard) => setModalProposta(p);

  const acaoModal = (fn: (id: string) => Promise<unknown>) => async () => {
    if (!modalProposta) return;
    await fn(modalProposta.id);
    setModalProposta(null);
    carregar(skip);
  };

  return (
    <div className="space-y-3">
      {/* ── Filtros ─────────────────────────────────────────────────── */}
      <div className="rounded-xl p-4" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: "var(--text-muted)" }}>Filtros</p>
        <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
          <div>
            <label className="text-[10px] font-semibold uppercase mb-1 block" style={{ color: "var(--text-muted)" }}>Banco</label>
            <input value={filtros.banco} onChange={(e) => setFiltros({ ...filtros, banco: e.target.value })} onKeyDown={(e) => e.key === "Enter" && aplicarFiltros()} placeholder="Ex: BMG, HOPE..." style={inputCls} />
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase mb-1 block" style={{ color: "var(--text-muted)" }}>Status</label>
            <select value={filtros.status} onChange={(e) => setFiltros({ ...filtros, status: e.target.value })} style={inputCls}>
              {STATUSES_OPCOES.map((s) => <option key={s} value={s}>{s || "Todos"}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase mb-1 block" style={{ color: "var(--text-muted)" }}>CPF</label>
            <input value={filtros.cpf} onChange={(e) => setFiltros({ ...filtros, cpf: e.target.value })} onKeyDown={(e) => e.key === "Enter" && aplicarFiltros()} placeholder="000.000.000-00" style={inputCls} />
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase mb-1 block" style={{ color: "var(--text-muted)" }}>Nome</label>
            <input value={filtros.nome} onChange={(e) => setFiltros({ ...filtros, nome: e.target.value })} onKeyDown={(e) => e.key === "Enter" && aplicarFiltros()} placeholder="Parte do nome" style={inputCls} />
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase mb-1 block" style={{ color: "var(--text-muted)" }}>Corretor</label>
            <input value={filtros.corretor} onChange={(e) => setFiltros({ ...filtros, corretor: e.target.value })} onKeyDown={(e) => e.key === "Enter" && aplicarFiltros()} placeholder="Nome do corretor" style={inputCls} />
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase mb-1 block" style={{ color: "var(--text-muted)" }}>Valor mín</label>
            <input type="number" value={filtros.valor_min} onChange={(e) => setFiltros({ ...filtros, valor_min: e.target.value })} placeholder="0,00" style={inputCls} />
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase mb-1 block" style={{ color: "var(--text-muted)" }}>Valor máx</label>
            <input type="number" value={filtros.valor_max} onChange={(e) => setFiltros({ ...filtros, valor_max: e.target.value })} placeholder="99999,00" style={inputCls} />
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase mb-1 block" style={{ color: "var(--text-muted)" }}>Data início</label>
            <input type="date" value={filtros.data_inicio} onChange={(e) => setFiltros({ ...filtros, data_inicio: e.target.value })} style={inputCls} />
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase mb-1 block" style={{ color: "var(--text-muted)" }}>Data fim</label>
            <input type="date" value={filtros.data_fim} onChange={(e) => setFiltros({ ...filtros, data_fim: e.target.value })} style={inputCls} />
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={aplicarFiltros} className="px-4 py-1.5 rounded-lg text-xs font-bold text-white" style={{ backgroundColor: "#DC2626" }}>Pesquisar</button>
          {temFiltro && (
            <button onClick={limparFiltros} className="px-4 py-1.5 rounded-lg text-xs font-medium" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>Limpar</button>
          )}
        </div>
      </div>

      {/* ── Barra de info + paginação ────────────────────────────────── */}
      <div className="flex items-center justify-between px-1">
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          {loading ? "Carregando..." : data ? (
            <>{data.total.toLocaleString("pt-BR")} proposta{data.total !== 1 ? "s" : ""}{temFiltro ? " (filtrado)" : ""}</>
          ) : ""}
        </p>
        {data && data.total > LIMIT && (
          <div className="flex items-center gap-2">
            <button
              disabled={skip === 0 || loading}
              onClick={() => carregar(Math.max(0, skip - LIMIT))}
              className="px-3 py-1 rounded-lg text-xs font-semibold"
              style={{ backgroundColor: "var(--bg-mid)", color: skip === 0 ? "var(--text-muted)" : "var(--text-primary)", opacity: skip === 0 ? 0.5 : 1 }}
            >‹ Anterior</button>
            <span className="text-xs px-2 py-1 rounded" style={{ backgroundColor: "var(--bg-mid)", color: "var(--text-primary)" }}>
              {paginaAtual} / {totalPaginas}
            </span>
            <button
              disabled={paginaAtual >= totalPaginas || loading}
              onClick={() => carregar(skip + LIMIT)}
              className="px-3 py-1 rounded-lg text-xs font-semibold"
              style={{ backgroundColor: "var(--bg-mid)", color: paginaAtual >= totalPaginas ? "var(--text-muted)" : "var(--text-primary)", opacity: paginaAtual >= totalPaginas ? 0.5 : 1 }}
            >Próxima ›</button>
          </div>
        )}
      </div>

      {/* ── Erro ────────────────────────────────────────────────────── */}
      {erro && (
        <p className="text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: "rgba(239,68,68,0.08)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)" }}>
          {erro}
        </p>
      )}

      {/* ── Tabela ──────────────────────────────────────────────────── */}
      <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{ minWidth: 1200 }}>
            <thead>
              <tr style={{ backgroundColor: "var(--bg-mid)", borderBottom: "2px solid var(--border)" }}>
                <ColHeader label="Proposta (ADE)" col="ade"          orderBy={orderBy} orderDir={orderDir} onSort={handleSort} />
                <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Arq.</th>
                <ColHeader label="Banco"          col="banco"        orderBy={orderBy} orderDir={orderDir} onSort={handleSort} />
                <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Convênio</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Produto</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Corretor</th>
                <ColHeader label="Valor"          col="valor"        orderBy={orderBy} orderDir={orderDir} onSort={handleSort} />
                <ColHeader label="Situação"       col="status"       orderBy={orderBy} orderDir={orderDir} onSort={handleSort} />
                <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>CPF</th>
                <ColHeader label="Cliente"        col="nome_cliente" orderBy={orderBy} orderDir={orderDir} onSort={handleSort} />
                <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Obs.</th>
                <ColHeader label="Importação"     col="criado_em"    orderBy={orderBy} orderDir={orderDir} onSort={handleSort} />
                <ColHeader label="Atualização"    col="atualizado_em" orderBy={orderBy} orderDir={orderDir} onSort={handleSort} />
                <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Agend.</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={15} className="text-center py-12 text-sm" style={{ color: "var(--text-muted)" }}>Carregando propostas...</td></tr>
              )}
              {!loading && (!data || data.items.length === 0) && (
                <tr><td colSpan={15} className="text-center py-12 text-sm" style={{ color: "var(--text-muted)" }}>
                  {temFiltro ? "Nenhuma proposta encontrada para os filtros." : "Nenhuma proposta cadastrada."}
                </td></tr>
              )}
              {!loading && data?.items.map((p, idx) => (
                <tr
                  key={p.id}
                  style={{
                    backgroundColor: idx % 2 === 0 ? "var(--bg-row-even)" : "var(--bg-row-odd)",
                    borderBottom: "1px solid var(--border-mid)",
                  }}
                >
                  {/* Proposta ADE */}
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <OrigemChip origem={p.origem} />
                      <span className="font-mono font-bold text-[10px]" style={{ color: "#DC2626" }}>{p.ade}</span>
                    </div>
                  </td>
                  {/* Arquivos */}
                  <td className="px-3 py-2.5 text-center">
                    {p.possui_arquivos
                      ? <span style={{ color: "#22c55e" }}>📎</span>
                      : <span style={{ color: "var(--text-muted)", opacity: 0.3 }}>—</span>}
                  </td>
                  {/* Banco */}
                  <td className="px-3 py-2.5 whitespace-nowrap font-medium" style={{ color: "var(--text-primary)" }}>{p.banco}</td>
                  {/* Convênio */}
                  <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: "var(--text-secondary, var(--text-muted))", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>{safe(p.convenio)}</td>
                  {/* Produto */}
                  <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: "var(--text-muted)" }}>{safe(p.produto)}</td>
                  {/* Corretor */}
                  <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: "var(--text-muted)" }}>{safe(p.corretor)}</td>
                  {/* Valor */}
                  <td className="px-3 py-2.5 text-right font-bold whitespace-nowrap" style={{ color: "var(--text-primary)" }}>{fmtBRL(p.valor)}</td>
                  {/* Situação */}
                  <td className="px-3 py-2.5"><StatusBadge status={p.status} /></td>
                  {/* CPF */}
                  <td className="px-3 py-2.5 font-mono whitespace-nowrap" style={{ color: "var(--text-muted)" }}>{fmtCPF(p.cpf)}</td>
                  {/* Nome */}
                  <td className="px-3 py-2.5 font-medium" style={{ color: "var(--text-primary)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{safe(p.nome_cliente)}</td>
                  {/* Obs */}
                  <td className="px-3 py-2.5" style={{ color: "var(--text-muted)", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.observacoes ? <span title={p.observacoes}>{p.observacoes.slice(0, 35)}{p.observacoes.length > 35 ? "…" : ""}</span> : "—"}
                  </td>
                  {/* Importação */}
                  <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: "var(--text-muted)" }}>{fmtData(p.data_importacao)}</td>
                  {/* Atualização */}
                  <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: "var(--text-muted)" }}>{fmtData(p.data_atualizacao)}</td>
                  {/* Agendamento */}
                  <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: "var(--text-muted)" }}>{fmtDataSo(p.data_agendamento)}</td>
                  {/* Ações */}
                  <td className="px-3 py-2.5 text-right">
                    <button
                      onClick={() => abrirModal(p)}
                      className="px-3 py-1 rounded-lg text-[10px] font-bold"
                      style={{ backgroundColor: "rgba(96,165,250,0.12)", color: "#60a5fa", border: "1px solid rgba(96,165,250,0.25)" }}
                    >
                      Opções
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Modal ───────────────────────────────────────────────────── */}
      {modalProposta && (
        <PropostaDetalheModal
          proposta={modalProposta}
          onClose={() => setModalProposta(null)}
          onAprovar={acaoModal(aprovarProposta)}
          onBloquear={acaoModal(bloquearProposta)}
          onReprocessar={acaoModal(reprocessarProposta)}
        />
      )}
    </div>
  );
}
